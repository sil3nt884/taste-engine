import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../../db.js';
import { ensureCovers } from '../../ingest/coverArt.js';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const stripHtml = (html: string | null): string =>
  (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export async function listMedia(request: FastifyRequest, reply: FastifyReply) {
  const parsed = Query.safeParse(request.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { limit, offset } = parsed.data;

  const rows = await query<{
    id: string; anilist_id: number; cover_image: string | null;
    title: string | null; synopsis: string | null;
    format: string | null; episodes: number | null; season_year: number | null;
    avg_score: number | null; popularity: number | null;
  }>(
    `SELECT m.id, m.anilist_id, m.cover_image,
              COALESCE(m.title_english, m.title_romaji) AS title, m.synopsis,
              m.format, m.episodes, m.season_year, m.avg_score, m.popularity
         FROM media m
        ORDER BY m.popularity DESC NULLS LAST, m.id
        LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const [counted] = await query<{ total: number }>(`SELECT count(*)::int AS total FROM media`);
  const covers = await ensureCovers(rows);

  const results = rows.map((row) => ({
    media_id: row.id,
    anilistId: row.anilist_id,
    coverImage: covers.get(row.id) ?? null,
    title: row.title,
    description: stripHtml(row.synopsis),
    format: row.format,
    episodes: row.episodes,
    seasonYear: row.season_year,
    avgScore: row.avg_score,
    popularity: row.popularity,
  }));

  return reply.send({ total: counted?.total ?? 0, limit, offset, results });
}

export async function getMediaEntry(request: FastifyRequest, reply: FastifyReply) {
  const parsed = IdParam.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }

  const [row] = await query<{
    id: string; anilist_id: number; cover_image: string | null; title: string | null;
    title_english: string | null; title_romaji: string | null; synopsis: string | null;
    format: string | null; status: string | null; episodes: number | null;
    season: string | null; season_year: number | null;
    avg_score: number | null; popularity: number | null;
  }>(
    `SELECT m.id, m.anilist_id, m.cover_image,
              COALESCE(m.title_english, m.title_romaji) AS title,
              m.title_english, m.title_romaji, m.synopsis,
              m.format, m.status, m.episodes, m.season, m.season_year,
              m.avg_score, m.popularity
         FROM media m
        WHERE m.id = $1`,
    [parsed.data.id],
  );

  if (!row) return reply.code(404).send({ error: 'No anime with that id.' });

  const covers = await ensureCovers([row]);

  return reply.send({
    media_id: row.id,
    anilistId: row.anilist_id,
    coverImage: covers.get(row.id) ?? null,
    title: row.title,
    titleEnglish: row.title_english,
    titleRomaji: row.title_romaji,
    description: stripHtml(row.synopsis),
    format: row.format,
    status: row.status,
    episodes: row.episodes,
    season: row.season,
    seasonYear: row.season_year,
    avgScore: row.avg_score,
    popularity: row.popularity,
  });
}
