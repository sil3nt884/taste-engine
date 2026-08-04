import { query } from '../db.js';
import { ANILIST_ENDPOINT, COVER_FAILURE_COOLDOWN_MS } from '../consts';

const QUERY = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      coverImage { extraLarge large }
    }
  }
}`;

let cooldownUntil = 0;

export async function fetchCovers(anilistIds: number[]): Promise<Map<number, string>> {
  const covers = new Map<number, string>();
  const ids = anilistIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0 || Date.now() < cooldownUntil) return covers;

  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids: ids.slice(0, 50) } }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { Page?: { media?: { id: number; coverImage?: { extraLarge?: string; large?: string } }[] } };
      };
      for (const item of json.data?.Page?.media ?? []) {
        const url = item.coverImage?.extraLarge ?? item.coverImage?.large;
        if (url) covers.set(item.id, url);
      }
    } else {
      cooldownUntil = Date.now() + COVER_FAILURE_COOLDOWN_MS;
    }
  } catch {
    cooldownUntil = Date.now() + COVER_FAILURE_COOLDOWN_MS;
  }
  return covers;
}

export async function storeCovers(fetched: Array<{ id: string; url: string }>): Promise<void> {
  if (fetched.length === 0) return;
  await query(
    `UPDATE media m SET cover_image = v.url
       FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS url) v
      WHERE m.id = v.id AND m.cover_image IS NULL`,
    [fetched.map((row) => row.id), fetched.map((row) => row.url)],
  );
}

export async function ensureCovers(
  rows: Array<{ id: string; anilist_id: number; cover_image: string | null }>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const missing: Array<{ id: string; anilist_id: number }> = [];
  for (const row of rows) {
    if (row.cover_image != null) result.set(row.id, row.cover_image);
    else { result.set(row.id, null); missing.push(row); }
  }
  if (missing.length === 0) return result;

  const byAnilist = await fetchCovers(missing.map((row) => row.anilist_id));
  const fetched: Array<{ id: string; url: string }> = [];
  for (const row of missing) {
    const url = byAnilist.get(row.anilist_id);
    if (url) { result.set(row.id, url); fetched.push({ id: row.id, url }); }
  }
  await storeCovers(fetched);
  return result;
}
