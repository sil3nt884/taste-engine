import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { chatJSON } from '../enrich/ollama.js';
import type { WhyTarget } from '../types';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, why: { type: 'string' } },
        required: ['id', 'why'],
      },
    },
  },
  required: ['items'],
} as const;

const RawSchema = z.object({
  items: z.array(z.object({ id: z.string(), why: z.string() })).default([]),
});

async function getCached(moodHash: string, mediaIds: string[]): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await query<{ media_id: string; why: string }>(
    `SELECT media_id, why FROM why_cache WHERE mood_hash = $1 AND media_id = ANY($2::bigint[])`,
    [moodHash, mediaIds],
  );
  return new Map(rows.map((row) => [row.media_id, row.why]));
}

async function putCached(
  moodHash: string, entries: Array<{ media_id: string; why: string }>,
): Promise<void> {
  for (const entry of entries) {
    await query(
      `INSERT INTO why_cache (mood_hash, media_id, why) VALUES ($1,$2,$3)
       ON CONFLICT (mood_hash, media_id) DO UPDATE SET why = EXCLUDED.why`,
      [moodHash, entry.media_id, entry.why],
    );
  }
}

async function generate(intent: string, targets: WhyTarget[]): Promise<Map<string, string>> {
  const system = [
    'You write one-line reasons a specific anime will give a viewer the mood they want.',
    `The viewer wants to feel: ${intent}.`,
    'For each title below, use its synopsis to write ONE sentence (max ~16 words) naming',
    'what makes it deliver that feeling — concrete and evocative, grounded in the premise.',
    'Speak to the effect on the viewer. Do not spoil endings. Do not just restate the',
    'mood words. Return JSON {"items":[{"id":"<id>","why":"<sentence>"}]}, reusing each id.',
  ].join('\n');

  const user = targets
    .map((target) => `[${target.media_id}] ${target.title ?? 'Unknown'} — ${target.description.slice(0, 280)}`)
    .join('\n');

  const raw = RawSchema.parse(await chatJSON(system, user, OUTPUT_SCHEMA, { model: config.EXPLAIN_MODEL }));
  const reasons = new Map<string, string>();
  for (const item of raw.items) {
    const id = String(item.id).replace(/\D/g, '');   // model sometimes decorates ids, e.g. ">469"
    const why = item.why.trim();
    if (id && why) reasons.set(id, why);
  }
  return reasons;
}

/**
 * Reasons for a set of targets: cache first, generate the misses in one batched
 * call (small explainer model), write them back, return media_id -> why. On any
 * model failure it just returns what was cached — the caller keeps its templates.
 */
export async function whysFor(
  key: string, intentTerms: string[], targets: WhyTarget[],
): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (targets.length === 0) return reasons;

  const cached = await getCached(key, targets.map((target) => target.media_id));
  for (const [id, why] of cached) reasons.set(id, why);

  const intent = intentTerms.length ? intentTerms.join(', ') : 'this mood';
  // Up to 2 passes: the small explainer model sometimes drops ids from a batch,
  // so the retry re-asks for ONLY the ones still missing (a smaller, easier batch).
  for (let attempt = 0; attempt < 2; attempt++) {
    const missing = targets.filter((target) => !reasons.has(target.media_id));
    if (missing.length === 0) break;
    try {
      const generated = await generate(intent, missing);
      const valid = new Set(missing.map((target) => target.media_id));
      const fresh: Array<{ media_id: string; why: string }> = [];
      for (const [id, why] of generated) {
        if (valid.has(id) && !reasons.has(id)) { reasons.set(id, why); fresh.push({ media_id: id, why }); }
      }
      if (fresh.length) await putCached(key, fresh);
      else break;   // nothing new came back — a further retry won't help
    } catch (err) {
      console.warn(`why generation failed: ${(err as Error).message}`);
      break;
    }
  }
  return reasons;
}

export async function explainResults(
  key: string, intentTerms: string[], targets: WhyTarget[],
): Promise<void> {
  const reasons = await whysFor(key, intentTerms, targets);
  for (const target of targets) {
    const why = reasons.get(target.media_id);
    if (why) target.why = why;
  }
}
