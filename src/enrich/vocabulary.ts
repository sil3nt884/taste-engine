import { config, LOCAL_MODEL_ID } from '../config.js';
import { query } from '../db.js';
import { assertModelAvailable, chatJSON } from './ollama.js';
import {z} from "zod";
import type { VocabEntry, Suggestion } from '../types';

const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: { terms: { type: 'array', items: { type: 'string' } } },
  required: ['terms'],
} as const;

export async function discoverVocabulary(sampleSize = 2000): Promise<Map<string, number>> {
  await assertModelAvailable();

  const sample = await query<{ id: string; title_romaji: string; synopsis: string | null }>(
    `WITH strata AS (
       SELECT m.*,
              ntile(4) OVER (ORDER BY COALESCE(m.season_year, 1990)) AS era,
              ntile(3) OVER (ORDER BY COALESCE(m.popularity, 0))     AS pop
         FROM media m
        WHERE m.synopsis IS NOT NULL
     )
     SELECT id, title_romaji, synopsis FROM (
       SELECT *, row_number() OVER (PARTITION BY era, pop, format ORDER BY random()) AS rn
         FROM strata
     ) s WHERE rn <= $1`,
    [Math.ceil(sampleSize / 24)],
  );

  const system =
    'Emit 3-8 lowercase mood/tone descriptors for this anime. ' +
    'Describe how it FEELS to watch, not what happens. No genres. ' +
    'Return JSON: {"terms":["...","..."]}.';

  const counts = new Map<string, number>();
  for (const media of sample) {
    let terms: string[];
    try {
      const raw = await chatJSON(
        system,
        `${media.title_romaji}\n\n${(media.synopsis ?? '').slice(0, 1500)}`,
        DISCOVERY_SCHEMA,
      );
      terms = (raw as { terms?: unknown }).terms as string[] ?? [];
    } catch {
      continue;
    }
    for (const term of terms) {
      if (typeof term !== 'string') continue;
      const normalized = term.toLowerCase().trim();
      if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return new Map([...counts].sort((left, right) => right[1] - left[1]));
}


const CONSOLIDATION_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
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

const RawVocab = z.object({
  tags: z.array(z.object({
    slug: z.string(),
    label: z.string(),
    definition: z.string(),
  })),
});

const slugify = (text: string): string =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Pass 2, automated (DESIGN.md §4.1). Feed the discovered free-text descriptor
 * frequencies to the model and have it collapse synonyms into a diverse set of
 * canonical mood tags, each with a written definition. This is the step that
 * turns a pile of near-duplicates ("wistful/melancholy/somber/bittersweet") into
 * distinct, load-bearing tones. Existing tags are passed in so the model EXTENDS
 * the vocabulary — keeping what works and only adding what genuinely fills a gap.
 */
export async function consolidateVocabulary(
  counts: Map<string, number>,
  opts: { targetCount?: number; existing?: VocabEntry[] } = {},
): Promise<VocabEntry[]> {
  await assertModelAvailable();
  const { targetCount = 100, existing = [] } = opts;

  const observed = [...counts]
    .filter(([, n]) => n >= 3)
    .slice(0, 400)
    .map(([term, n]) => `${n}\t${term}`)
    .join('\n');

  const system = [
    'You are EXTENDING a controlled vocabulary of ANIME MOOD tags — how a show FEELS',
    'to watch (tone, mood, pacing), never plot or genre.',
    'The existing tags listed below are ALREADY in the vocabulary and are kept as-is.',
    'Propose ONLY additional, NEW tags for feelings the observed descriptors reveal are',
    'missing from that set. Do NOT repeat, rename, or merge existing tags.',
    '',
    'Rules:',
    '- Every proposed tag must be genuinely absent from the existing set.',
    '- Keep tags DISTINCT: collapse synonyms into ONE, and do not duplicate an existing tone.',
    '- slug is lowercase-kebab-case; label is human-readable; definition is one',
    '  sentence stating what feeling earns the tag (the inclusion criterion).',
    '- It is fine to propose few or none if the existing set already covers the range.',
  ].join('\n');

  const user = [
    'Existing tags (slug: definition):',
    existing.length ? existing.map((entry) => `${entry.slug}: ${entry.definition}`).join('\n') : '(none)',
    '',
    'Observed descriptors from the catalogue (frequency, term):',
    observed || '(none)',
  ].join('\n');

  const raw = RawVocab.parse(await chatJSON(system, user, CONSOLIDATION_SCHEMA));

  // The seed is preserved PROGRAMMATICALLY — never trust the model to reproduce it
  // (a weak local model silently drops whole clusters, e.g. all romance tones). The
  // model only contributes genuinely-new tags on top.
  const seen = new Set<string>();
  const out: VocabEntry[] = [];
  for (const entry of existing) {
    const slug = slugify(entry.slug);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label: entry.label, definition: entry.definition });
  }
  for (const tag of raw.tags) {
    const slug = slugify(tag.slug || tag.label);
    if (!slug || seen.has(slug)) continue;          // skip empties + anything already in the seed
    seen.add(slug);
    out.push({ slug, label: tag.label.trim() || slug, definition: tag.definition.trim() });
  }
  return out;
}

export async function loadVocabulary(
  version: number, entries: VocabEntry[], notes?: string,
): Promise<number> {
  const [vocab] = await query<{ id: string }>(
    `INSERT INTO vocabulary (version, model_id, notes, frozen_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (version) DO UPDATE SET notes = EXCLUDED.notes
     RETURNING id`,
    [version, LOCAL_MODEL_ID, notes ?? null],
  );
  const id = Number(vocab!.id);
  for (const entry of entries) {
    await query(
      `INSERT INTO mood_tag (vocabulary_id, slug, label, definition)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (vocabulary_id, slug) DO UPDATE SET definition = EXCLUDED.definition`,
      [id, entry.slug, entry.label, entry.definition],
    );
  }
  return id;
}

async function existingVocabulary(version: number): Promise<VocabEntry[]> {
  const rows = await query<{ slug: string; label: string; definition: string }>(
    `SELECT mt.slug, mt.label, mt.definition
       FROM mood_tag mt JOIN vocabulary v ON v.id = mt.vocabulary_id
      WHERE v.version = $1 ORDER BY mt.slug`,
    [version],
  );
  return rows;
}


/** Tones the enricher proposed as gaps against `baseVersion`, most-wanted first. */
export async function listSuggestions(baseVersion: number): Promise<Suggestion[]> {
  return query<Suggestion>(
    `SELECT slug, label, definition, frequency FROM vocab_suggestion
      WHERE base_version = $1 ORDER BY frequency DESC`,
    [baseVersion],
  );
}

async function topSuggestions(baseVersion: number, minFrequency: number): Promise<VocabEntry[]> {
  const rows = await query<{ slug: string; label: string; definition: string }>(
    `SELECT slug, label, definition FROM vocab_suggestion
      WHERE base_version = $1 AND frequency >= $2 ORDER BY frequency DESC`,
    [baseVersion, minFrequency],
  );
  return rows;
}

/**
 * End-to-end vocabulary growth: discover free descriptors from the catalogue,
 * let the model consolidate them (extending the current active vocabulary), and
 * load the result as a NEW frozen version. Re-enrich against that version after.
 */
export async function buildVocabulary(
  newVersion: number,
  opts: { sampleSize?: number; targetCount?: number; baseVersion?: number; minSuggestionFreq?: number } = {},
): Promise<number> {
  const { sampleSize = 2000, targetCount = 100, baseVersion, minSuggestionFreq = 3 } = opts;
  const existing = baseVersion ? await existingVocabulary(baseVersion) : [];
  console.error(`discovering descriptors over ~${sampleSize} titles...`);
  const counts = await discoverVocabulary(sampleSize);
  console.error(`consolidating ${counts.size} descriptors into ~${targetCount} tags...`);
  const entries = await consolidateVocabulary(counts, { targetCount, existing });

  // Fold in the frequent tones the ENRICHER itself flagged as gaps (base preserved
  // by consolidate; these add on top, deduped). This is the enrichment feedback loop.
  if (baseVersion) {
    const have = new Set(entries.map((entry) => entry.slug));
    const suggestions = await topSuggestions(baseVersion, minSuggestionFreq);
    let added = 0;
    for (const suggestion of suggestions) {
      if (have.has(suggestion.slug)) continue;
      entries.push(suggestion);
      have.add(suggestion.slug);
      added++;
    }
    console.error(`added ${added} enrichment-suggested tone(s) (frequency >= ${minSuggestionFreq}).`);
  }

  const id = await loadVocabulary(newVersion, entries, `AI-built from v${baseVersion ?? '-'}`);
  console.error(`loaded ${entries.length} tags as vocabulary version ${newVersion} (id ${id}).`);
  console.error(`Next: set ACTIVE_VOCABULARY_VERSION=${newVersion} and re-run enrichment.`);
  return id;
}

// The guard that would have caught v3: a new version must contain every tone of
// its base and never be smaller. Cheap insurance against a lossy build.
function assertCoversBase(base: VocabEntry[], entries: VocabEntry[]): void {
  const have = new Set(entries.map((entry) => entry.slug));
  const missing = base.filter((entry) => !have.has(entry.slug)).map((entry) => entry.slug);
  if (missing.length) {
    throw new Error(
      `refusing to promote: ${missing.length} base tone(s) missing — ` +
      `${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`,
    );
  }
  if (entries.length < base.length) {
    throw new Error(`refusing to promote: ${entries.length} tags < base ${base.length}`);
  }
}

/**
 * Enrichment-driven promotion (the auto ratchet). Builds the next version as the
 * base vocabulary PLUS the frequent gap tones the enricher proposed — no catalogue
 * discovery pass, just what enrichment already surfaced. Coverage-validated, so it
 * can never regress below the base. The re-enrich stays a deliberate step.
 */
export async function promoteVocabulary(
  newVersion: number,
  opts: { baseVersion: number; minFrequency?: number },
): Promise<{ id: number; added: number; total: number }> {
  const { baseVersion, minFrequency = 3 } = opts;
  const base = await existingVocabulary(baseVersion);
  if (base.length === 0) throw new Error(`base vocabulary v${baseVersion} is empty or missing`);

  const have = new Set(base.map((entry) => entry.slug));
  const entries: VocabEntry[] = [...base];
  let added = 0;
  for (const suggestion of await topSuggestions(baseVersion, minFrequency)) {
    if (have.has(suggestion.slug)) continue;
    entries.push(suggestion);
    have.add(suggestion.slug);
    added++;
  }

  assertCoversBase(base, entries);
  const id = await loadVocabulary(
    newVersion, entries, `promoted from v${baseVersion} (+${added} suggestions)`,
  );
  return { id, added, total: entries.length };
}
