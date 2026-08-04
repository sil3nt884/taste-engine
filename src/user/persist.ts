import type pg from 'pg';
import { withTransaction, query } from '../db.js';
import type { ListMedia, MediaListStatus } from '../anilist/lists.js';

async function upsertListMedia(client: pg.PoolClient, listMedia: ListMedia): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO media (anilist_id, title_romaji, title_english, format,
                        episodes, avg_score, popularity, season_year, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (anilist_id) DO UPDATE SET
       title_romaji  = COALESCE(EXCLUDED.title_romaji,  media.title_romaji),
       title_english = COALESCE(EXCLUDED.title_english, media.title_english),
       format        = COALESCE(EXCLUDED.format,        media.format),
       episodes      = COALESCE(EXCLUDED.episodes,      media.episodes),
       avg_score     = COALESCE(EXCLUDED.avg_score,     media.avg_score),
       popularity    = COALESCE(EXCLUDED.popularity,    media.popularity),
       season_year   = COALESCE(EXCLUDED.season_year,   media.season_year),
       updated_at    = now()
     RETURNING id`,
    [
      listMedia.id, listMedia.title.romaji, listMedia.title.english, listMedia.format,
      listMedia.episodes, listMedia.averageScore, listMedia.popularity, listMedia.startDate.year,
    ],
  );
  const mediaId = rows[0]!.id;

  for (const name of listMedia.genres) {
    const { rows: genreRows } = await client.query<{ id: string }>(
      `INSERT INTO genre (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name],
    );
    await client.query(
      `INSERT INTO media_genre (media_id, genre_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [mediaId, genreRows[0]!.id],
    );
  }

  for (const communityTag of listMedia.tags) {
    const { rows: tagRows } = await client.query<{ id: string }>(
      `INSERT INTO tag (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [communityTag.name],
    );
    await client.query(
      `INSERT INTO media_tag (media_id, tag_id, rank, is_spoiler)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [mediaId, tagRows[0]!.id, communityTag.rank, communityTag.isMediaSpoiler],
    );
  }
  return mediaId;
}

export async function saveUserLists(
  userName: string,
  lists: Partial<Record<MediaListStatus, ListMedia[]>>,
): Promise<string> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO user_account (anilist_name) VALUES ($1)
       ON CONFLICT (anilist_name) DO UPDATE SET anilist_name = EXCLUDED.anilist_name
       RETURNING id`,
      [userName],
    );
    const userId = rows[0]!.id;

    for (const [status, mediaList] of Object.entries(lists)) {
      for (const listItem of mediaList ?? []) {
        const mediaId = await upsertListMedia(client, listItem);
        await client.query(
          `INSERT INTO list_entry (user_id, media_id, status, updated_at)
           VALUES ($1,$2,$3, now())
           ON CONFLICT (user_id, media_id) DO UPDATE SET
             status = EXCLUDED.status, updated_at = now()`,
          [userId, mediaId, status],
        );
      }
    }
    return userId;
  });
}
