import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../../db.js';
import { buildTaste } from '../../user/taste.js';
import { ensureCovers } from '../../ingest/coverArt.js';
import type { ListItem } from '../../types';

const ListBody = z.object({ list: z.enum(['watched', 'planning']) });
const STATUS = { watched: 'COMPLETED', planning: 'PLANNING' } as const;

const IdParam = z.object({ id: z.coerce.number().int().positive() });

export async function getMyLists(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.sub;
  const rows = await query<{
    status: string; media_id: string; anilist_id: number; cover_image: string | null;
    title: string | null; episodes: number | null; avg_score: number | null; user_score: number | null;
  }>(
    `SELECT le.status,
              m.id AS media_id, m.anilist_id, m.cover_image,
              COALESCE(m.title_english, m.title_romaji) AS title,
              m.episodes, m.avg_score, le.score AS user_score
         FROM list_entry le
         JOIN media m ON m.id = le.media_id
        WHERE le.user_id = $1 AND le.status IN ('COMPLETED','PLANNING')
        ORDER BY le.updated_at DESC`,
    [userId],
  );

  const covers = await ensureCovers(
    rows.map((row) => ({ id: row.media_id, anilist_id: row.anilist_id, cover_image: row.cover_image })),
  );

  const watched: ListItem[] = [];
  const planning: ListItem[] = [];
  for (const row of rows) {
    const item: ListItem = {
      media_id: row.media_id, coverImage: covers.get(row.media_id) ?? null,
      title: row.title, episodes: row.episodes,
      avgScore: row.avg_score, userScore: row.user_score,
    };
    (row.status === 'COMPLETED' ? watched : planning).push(item);
  }
  return reply.send({ watched, planning });
}

export async function addAnimeToList(request: FastifyRequest, reply: FastifyReply) {
  const params = IdParam.safeParse(request.params);
  const body = ListBody.safeParse(request.body);
  if (!params.success || !body.success) {
    return reply.code(400).send({ error: (params.success ? body : params).error!.issues });
  }
  const userId = request.user!.sub;
  const mediaId = params.data.id;
  const status = STATUS[body.data.list];

  const rows = await query<{ media_id: string; prev_status: string | null }>(
    `WITH prev AS (
       SELECT status FROM list_entry WHERE user_id = $1 AND media_id = $3
     ),
     upsert AS (
       INSERT INTO list_entry (user_id, media_id, status)
         SELECT $1, m.id, $2 FROM media m WHERE m.id = $3
         ON CONFLICT (user_id, media_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
         RETURNING media_id
     )
     SELECT u.media_id, p.status AS prev_status
       FROM upsert u LEFT JOIN prev p ON true`,
    [userId, status, mediaId],
  );
  if (rows.length === 0) return reply.code(404).send({ error: 'No anime with that id.' });

  const prevStatus = rows[0]!.prev_status;
  const watchedChanged =
    (status === 'COMPLETED' && prevStatus !== 'COMPLETED') ||
    (status !== 'COMPLETED' && prevStatus === 'COMPLETED');
  if (watchedChanged) await buildTaste(userId);

  return reply.send({ media_id: mediaId, list: body.data.list });
}

export async function removeAnimeFromList(request: FastifyRequest, reply: FastifyReply) {
  const params = IdParam.safeParse(request.params);
  const body = ListBody.safeParse(request.body);
  if (!params.success || !body.success) {
    return reply.code(400).send({ error: (params.success ? body : params).error!.issues });
  }
  const userId = request.user!.sub;
  const mediaId = params.data.id;
  const status = STATUS[body.data.list];

  const rows = await query<{ media_id: string }>(
    `DELETE FROM list_entry
        WHERE user_id = $1 AND media_id = $2 AND status = $3
        RETURNING media_id`,
    [userId, mediaId, status],
  );
  if (rows.length === 0) return reply.code(404).send({ error: 'That anime is not on that list.' });

  if (status === 'COMPLETED') await buildTaste(userId);
  return reply.send({ media_id: mediaId, list: body.data.list, removed: true });
}
