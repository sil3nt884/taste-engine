import { z } from 'zod';
import { config, LOCAL_MODEL_ID } from '../config.js';
import { query, withTransaction } from '../db.js';
import { recomputeIdf } from '../search/score.js';
import { assertModelAvailable, chatJSON } from './ollama.js';
import { inputFingerprint } from './hash.js';
import type { MoodTag, MediaRow, EnrichCounters } from '../types';

const INTENSITY: Record<'high' | 'medium' | 'low', number> =
  { high: 1.0, medium: 0.6, low: 0.3 };

const EnrichmentSchema = z.object({
  tags: z.array(z.object({
    tag: z.string(),
    intensity: z.enum(['high', 'medium', 'low']),
  })),
  suggestions: z.array(z.object({
    slug: z.string(),
    label: z.string(),
    definition: z.string(),
  })).optional().default([]),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
          intensity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['tag', 'intensity'],
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          label: { type: 'string' },
          definition: { type: 'string' },
        },
        required: ['slug', 'label', 'definition'],
      },
    },
  },
  required: ['tags'],
} as const;

const slugify = (text: string): string =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function buildSystem(vocab: Array<{ slug: string; definition: string }>): string {
  return [
    'You label anime with mood tags from a FIXED vocabulary.',
    'Describe how the show FEELS to watch — its tone, mood and pacing — not its plot.',
    '',
    'Rules:',
    '- Use ONLY the slugs listed below for "tags". Never invent one.',
    '- Intensity is coarse on purpose: high | medium | low.',
    '- Omit a tag entirely rather than guessing at "low".',
    '- Typically 3-8 tags per title.',
    '- If the show has a STRONG, defining mood that NONE of the slugs below can',
    '  express, add it to "suggestions" as {slug,label,definition} — a genuinely',
    '  NEW, distinct tone, never a synonym of an existing slug. Almost always leave',
    '  "suggestions" empty; propose only a real, recurring gap.',
    '',
    'Vocabulary (slug: definition):',
    ...vocab.map((entry) => `${entry.slug}: ${entry.definition}`),
  ].join('\n');
}

// Community tags go in as input, not just the synopsis (DESIGN.md §4.1).
function buildUser(media: MediaRow): string {
  return [
    `Title: ${media.title_romaji ?? 'Unknown'}`,
    media.format ? `Format: ${media.format}, ${media.episodes ?? '?'} episodes` : '',
    media.community_tags ? `Community tags: ${media.community_tags}` : '',
    '',
    'Synopsis:',
    (media.synopsis ?? '').replace(/<[^>]+>/g, '').slice(0, 2000),
  ].filter(Boolean).join('\n');
}


async function storeSuggestions(
  suggestions: Array<{ slug: string; label: string; definition: string }>,
  baseVersion: number,
  mediaId: string,
  inVocab: (slug: string) => boolean,
): Promise<number> {
  let added = 0;
  for (const suggestion of suggestions) {
    const slug = slugify(suggestion.slug || suggestion.label);
    if (!slug || inVocab(slug)) continue;            // already covered — not a gap
    await query(
      `INSERT INTO vocab_suggestion (slug, label, definition, base_version, example_media_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET
         frequency = vocab_suggestion.frequency + 1,
         last_seen = now()`,
      [slug, suggestion.label.trim() || slug, suggestion.definition.trim(), baseVersion, mediaId],
    );
    added++;
  }
  return added;
}

async function enrichOne(
  media: MediaRow,
  vocabularyId: number,
  vocabVersion: number,
  slugToId: Map<string, string>,
  counters: EnrichCounters,
): Promise<void> {
  const communityTags = media.community_tags ?? '';
  const synopsis = (media.synopsis ?? '').replace(/<[^>]+>/g, '');

  const fingerprint = inputFingerprint({
    vocabularyVersion: vocabVersion,
    modelId: LOCAL_MODEL_ID,
    title: media.title_romaji ?? '',
    synopsis,
    communityTags,
  });

  // Idempotency: unchanged input → nothing to do.
  const [existing] = await query<{ input_hash: string }>(
    `SELECT input_hash FROM media_enrichment WHERE media_id = $1 AND vocabulary_id = $2`,
    [media.id, vocabularyId],
  );
  if (existing?.input_hash === fingerprint) { counters.skipped++; return; }

  let parsed: z.infer<typeof EnrichmentSchema>;
  try {
    const raw = await chatJSON(buildSystem(VOCAB_CACHE), buildUser(media), OUTPUT_SCHEMA);
    parsed = EnrichmentSchema.parse(raw);
  } catch (err) {
    counters.failed++;
    console.warn(`media ${media.id} failed: ${(err as Error).message}`);
    return;
  }

  // Validate every slug against the frozen vocabulary. Unknown → dropped, not
  // coerced (DESIGN.md §6.1). A non-trivial invalid-slug rate is a drift alarm.
  const moodTags: Array<MoodTag & { moodTagId: string }> = [];
  for (const tag of parsed.tags) {
    const id = slugToId.get(tag.tag);
    if (!id) { counters.invalidSlugs++; continue; }
    moodTags.push({ slug: tag.tag, intensity: INTENSITY[tag.intensity], moodTagId: id });
  }

  await withTransaction(async (client) => {
    // Replace this title's mood set for this vocabulary.
    await client.query(
      `DELETE FROM media_mood_tag WHERE media_id = $1 AND vocabulary_id = $2`,
      [media.id, vocabularyId],
    );
    for (const tag of moodTags) {
      await client.query(
        `INSERT INTO media_mood_tag (media_id, mood_tag_id, intensity, vocabulary_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (media_id, mood_tag_id)
           DO UPDATE SET intensity = EXCLUDED.intensity`,
        [media.id, tag.moodTagId, tag.intensity, vocabularyId],
      );
    }
    await client.query(
      `INSERT INTO media_enrichment
         (media_id, vocabulary_id, model_id, input_hash, enriched_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (media_id, vocabulary_id) DO UPDATE SET
         model_id = EXCLUDED.model_id,
         input_hash = EXCLUDED.input_hash,
         enriched_at = now()`,
      [media.id, vocabularyId, LOCAL_MODEL_ID, fingerprint],
    );
  });
  counters.ok++;

  // Collect any proposed new tones for a future vocabulary version (never applied
  // now — the current run stays on the frozen vocabulary).
  if (parsed.suggestions.length) {
    counters.suggested += await storeSuggestions(
      parsed.suggestions, vocabVersion, media.id, (slug) => slugToId.has(slug),
    );
  }
}

// Populated once per run so buildSystem does not re-query per title.
let VOCAB_CACHE: Array<{ slug: string; definition: string }> = [];

export async function enrichCatalogueLocal(vocabularyVersion: number, limit = 100_000) {
  await assertModelAvailable();

  const [vocab] = await query<{ id: string }>(
    `SELECT id FROM vocabulary WHERE version = $1`, [vocabularyVersion],
  );
  if (!vocab) throw new Error(`vocabulary version ${vocabularyVersion} not found`);
  const vocabularyId = Number(vocab.id);

  VOCAB_CACHE = await query<{ slug: string; definition: string }>(
    `SELECT slug, definition FROM mood_tag WHERE vocabulary_id = $1 ORDER BY slug`,
    [vocabularyId],
  );
  if (VOCAB_CACHE.length === 0) throw new Error('vocabulary is empty — seed it first');
  const slugToId = new Map(
    (await query<{ id: string; slug: string }>(
      `SELECT id, slug FROM mood_tag WHERE vocabulary_id = $1`, [vocabularyId],
    )).map((row) => [row.slug, row.id]),
  );

  // Only titles that are new or whose input changed. Community tags are folded
  // into one string here, same as the prompt sees them.
  const media = await query<MediaRow>(
    `SELECT m.id, m.title_romaji, m.format, m.episodes, m.synopsis,
            string_agg(t.name || ' ' || mt.rank || '%', ', '
                       ORDER BY mt.rank DESC) AS community_tags
       FROM media m
       LEFT JOIN media_tag mt ON mt.media_id = m.id AND mt.rank >= 40
       LEFT JOIN tag t        ON t.id = mt.tag_id
      GROUP BY m.id
      ORDER BY m.popularity DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );

  const [run] = await query<{ id: string }>(
    `INSERT INTO enrichment_run (vocabulary_id, model_id, media_count)
     VALUES ($1,$2,$3) RETURNING id`,
    [vocabularyId, LOCAL_MODEL_ID, media.length],
  );

  const counters: EnrichCounters = { ok: 0, failed: 0, skipped: 0, invalidSlugs: 0, suggested: 0 };

  // Bounded concurrency: the local model is the bottleneck, so a small pool of
  // workers draining a shared queue keeps the GPU busy without oversubscribing.
  let cursor = 0;
  const worker = async () => {
    while (cursor < media.length) {
      const mediaRow = media[cursor++]!;
      await enrichOne(mediaRow, vocabularyId, vocabularyVersion, slugToId, counters);
      const done = counters.ok + counters.failed + counters.skipped;
      if (done % 50 === 0) {
        console.log(`  ${done}/${media.length} (ok=${counters.ok} skip=${counters.skipped} fail=${counters.failed})`);
      }
    }
  };
  await Promise.all(Array.from({ length: config.ENRICH_CONCURRENCY }, worker));

  await query(
    `UPDATE enrichment_run
        SET status='done', ok=$2, failed=$3, invalid_slugs=$4, finished_at=now()
      WHERE id=$1`,
    [run!.id, counters.ok, counters.failed, counters.invalidSlugs],
  );
  await recomputeIdf(vocabularyId);

  console.log(
    `enrichment done: ok=${counters.ok} skipped=${counters.skipped} ` +
    `failed=${counters.failed} invalid_slugs=${counters.invalidSlugs} ` +
    `suggestions=${counters.suggested}`,
  );
  if (counters.suggested > 0) {
    console.log('  review proposed tones with `npm run vocab:suggestions`, then ' +
      '`npm run vocab:build` to fold the good ones into a new version.');
  }
  // invalid_slugs is a vocabulary-drift alarm. If it is not near zero, the
  // prompt or the vocabulary needs work before trusting any downstream number.
  return counters;
}
