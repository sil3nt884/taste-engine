import type pg from 'pg';
import { withTransaction } from '../db.js';
import { buildTaste } from '../user/taste.js';
import type { JikanPage, MalImportResult } from '../types';
import { JIKAN_ENDPOINT } from '../consts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchStatus(malUser: string, status: 'completed' | 'plan_to_watch'): Promise<number[]> {
  const ids: number[] = [];
  for (let page = 1; ; page++) {
    const url = `${JIKAN_ENDPOINT}/users/${encodeURIComponent(malUser)}/animelist?status=${status}&page=${page}`;
    const res = await fetch(url);
    if (res.status === 429) { await sleep(1500); page--; continue; }   // rate limited — retry page
    if (res.status === 404) throw new Error(`MyAnimeList user "${malUser}" not found`);
    if (!res.ok) throw new Error(`Jikan ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as JikanPage;
    for (const it of body.data) ids.push(it.entry.mal_id);
    if (!body.pagination?.has_next_page) break;
    await sleep(400);   // Jikan allows ~3 req/s
  }
  return ids;
}

/** Resolve the account by mal_name (import-only if new), then record list_entry. */
async function saveMalUserLists(
  malUser: string, lists: { COMPLETED?: number[]; PLANNING?: number[] },
): Promise<{ userId: string; matched: Record<'COMPLETED' | 'PLANNING', number> }> {
  return withTransaction(async (client: pg.PoolClient) => {
    const found = await client.query<{ id: string }>(
      `SELECT id FROM user_account WHERE lower(mal_name) = lower($1)`, [malUser],
    );
    const userId = found.rows[0]?.id ?? (await client.query<{ id: string }>(
      `INSERT INTO user_account (mal_name) VALUES ($1) RETURNING id`, [malUser],
    )).rows[0]!.id;

    const matched = { COMPLETED: 0, PLANNING: 0 };
    for (const status of ['COMPLETED', 'PLANNING'] as const) {
      for (const malId of lists[status] ?? []) {
        const inserted = await client.query<{ media_id: string }>(
          `INSERT INTO list_entry (user_id, media_id, status)
           SELECT $1, m.id, $2 FROM media m WHERE m.mal_id = $3
           ON CONFLICT (user_id, media_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
           RETURNING media_id`,
          [userId, status, malId],
        );
        if (inserted.rows.length) matched[status]++;
      }
    }
    return { userId, matched };
  });
}

export async function importMyAnimeList(malUser: string): Promise<MalImportResult> {
  const completed = await fetchStatus(malUser, 'completed');
  const planning = await fetchStatus(malUser, 'plan_to_watch');

  const { userId, matched } = await saveMalUserLists(malUser, { COMPLETED: completed, PLANNING: planning });
  await buildTaste(userId);

  return {
    userId,
    completed: completed.length,
    planning: planning.length,
    matchedCompleted: matched.COMPLETED,
    matchedPlanning: matched.PLANNING,
  };
}
