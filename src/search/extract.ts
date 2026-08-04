import { createHash } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db.js';
import { chatJSON } from '../enrich/ollama.js';
import type { ExtractionTerm, Extraction } from '../types';

function weightBucket(weight: number): 'high' | 'medium' | 'low' {
  if (weight >= 0.9) return 'high';
  if (weight >= 0.5) return 'medium';
  return 'low';
}

export function moodExtractionHash(extraction: Extraction): string {
  const pos = extraction.positive.map((term) => `+${term.slug}@${weightBucket(term.weight)}`).sort();
  const neg = extraction.negative.map((term) => `-${term.slug}@${weightBucket(term.weight)}`).sort();
  return createHash('sha256')
    .update([...pos, ...neg, `ep:${extraction.filters.max_episodes ?? ''}`].join(','))
    .digest('hex');
}

const RawSchema = z.object({
  positive: z.array(z.object({ tag: z.string(), weight: z.number() })).default([]),
  negative: z.array(z.object({ tag: z.string(), weight: z.number() })).default([]),
  filters: z.object({ max_episodes: z.number().int().positive().optional() }).optional(),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    positive: { type: 'array', items: term() },
    negative: { type: 'array', items: term() },
    filters: {
      type: 'object',
      properties: { max_episodes: { type: 'integer' } },
    },
  },
  required: ['positive', 'negative'],
} as const;

function term() {
  return {
    type: 'object',
    properties: { tag: { type: 'string' }, weight: { type: 'number' } },
    required: ['tag', 'weight'],
  };
}

function buildSystem(vocab: Array<{ slug: string; definition: string }>): string {
  return [
    'You read a natural-language mood request and extract EVERY mood it implies into a',
    'collection of mood tags from a FIXED vocabulary. Each tag is either POSITIVE (a',
    'feeling the user wants / affirms) or NEGATIVE (a feeling they reject / negate).',
    'Capture the whole request — never stop at the single main mood.',
    '',
    'The user almost never uses the exact slug words. Map what they describe onto the',
    'CLOSEST slugs by MEANING using each slug\'s definition below — not string matching.',
    'This holds for BOTH polarities.',
    '',
    'Polarity:',
    '- POSITIVE: what they want. "make me cry" is sadness AND emotional release AND',
    '  bittersweetness -> return each nearest tone (e.g. tearjerker, cathartic, bittersweet).',
    '- NEGATIVE: what they want to avoid. Negation words (not / no / without / nothing too)',
    '  flip that mood into NEGATIVE. Map it to the nearest listed tone and KEEP it — e.g.',
    '  "not depressing" -> negative: the bleak/melancholic tone. Never silently drop it.',
    '',
    'Rules:',
    '- Use ONLY the slugs listed below, chosen by definition. NEVER output a tag that is',
    '  not in the list, and never invent one — this applies to negative tags too.',
    '- Extract the FULL feeling: usually 2-4 positive tones, PLUS every negated one.',
    '- weight is 0..1: how strongly the user asked for (or against) each tag.',
    '- If the query names an episode limit, set filters.max_episodes.',
    '',
    'Vocabulary (slug: definition):',
    ...vocab.map((entry) => `${entry.slug}: ${entry.definition}`),
  ].join('\n');
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export async function extractMoodQuery(
  queryText: string,
  vocabularyId: number,
): Promise<Extraction> {
  const vocab = await query<{ slug: string; definition: string }>(
    `SELECT slug, definition FROM mood_tag WHERE vocabulary_id = $1 ORDER BY slug`,
    [vocabularyId],
  );
  const valid = new Set(vocab.map((entry) => entry.slug));

  const raw = RawSchema.parse(
    await chatJSON(buildSystem(vocab), queryText, OUTPUT_SCHEMA),
  );

  if (process.env.DEBUG_EXTRACT) {
    const allTags = [...raw.positive, ...raw.negative].map((item) => item.tag);
    const dropped = allTags.filter((tag) => !valid.has(tag));
    console.error('[extract] raw model tags:', JSON.stringify(raw));
    console.error('[extract] dropped (not in vocab):', dropped.length ? dropped : '(none)');
  }

  // Validate against the vocabulary; unknown slugs are dropped, not coerced.
  const keep = (terms: Array<{ tag: string; weight: number }>): ExtractionTerm[] =>
    terms
      .filter((item) => valid.has(item.tag))
      .map((item) => ({ slug: item.tag, weight: clamp01(item.weight) }));

  return {
    positive: keep(raw.positive),
    negative: keep(raw.negative),
    filters: raw.filters?.max_episodes ? { max_episodes: raw.filters.max_episodes } : {},
  };
}
