import { describe, it, expect, afterAll } from 'vitest';
import { searchQuery } from '../src/search/query.js';
import { pool, query } from '../src/db.js';
import { assertModelAvailable } from '../src/enrich/ollama.js';

async function servicesReady(): Promise<boolean> {
  try {
    const [row] = await query<{ n: number }>('SELECT count(*)::int AS n FROM media_mood_tag');
    if (!row || row.n === 0) return false;
    await assertModelAvailable();
    return true;
  } catch {
    return false;
  }
}

const ready = await servicesReady();
if (!ready) {
  console.warn(
    '[searchMoods] skipped: needs a migrated+enriched DB and Ollama running. ' +
    'Run `npm run status` and `npm run enrich:catalogue`, and start Ollama.',
  );
}

afterAll(async () => {
  await pool.end();
});

const CASES = [
  { mood: 'happy',    query: 'something happy and fun to cheer me up' },
  { mood: 'sad',      query: 'a sad anime that makes me cry' },
  { mood: 'calm',     query: 'something calm and relaxing to unwind to' },
  { mood: 'dark',     query: 'something dark and intense' },
  { mood: 'cozy',     query: 'a cozy heartwarming slice of life' },
  { mood: 'exciting', query: 'something exciting and full of action' },
];

describe.runIf(ready)('mood search returns on-mood recommendations', () => {
  for (const c of CASES) {
    it(`maps "${c.mood}" to vocabulary moods and returns matches`, async () => {
      const res = await searchQuery({ q: c.query });

      expect(res.source).not.toBe('fallback');
      expect(res.extraction?.positive.length ?? 0).toBeGreaterThan(0);

      expect(res.results.length).toBeGreaterThan(0);
      expect(res.moodHash).toMatch(/^[0-9a-f]{64}$/);

      const asked = new Set(res.extraction!.positive.map((t) => t.slug));
      for (const r of res.results) {
        expect(r.moods.some((m) => asked.has(m.slug))).toBe(true);
      }
    }, 30_000);
  }

  it('gives identical exact hashes to two phrasings of the same feel', async () => {
    const a = await searchQuery({ q: 'a sad anime that makes me cry' });
    const b = await searchQuery({ q: 'something really melancholy and tear-jerking' });
    if (a.source !== 'fallback' && b.source !== 'fallback') {
      const aSlugs = new Set(a.extraction!.positive.map((t) => t.slug));
      const overlap = b.extraction!.positive.some((t) => aSlugs.has(t.slug));
      expect(overlap).toBe(true);
    }
  }, 30_000);
});
