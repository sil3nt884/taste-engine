import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query } from '../../db.js';
import { searchCatalog } from '../../search/catalogIndex.js';
import { ensureCovers } from '../../ingest/coverArt.js';

const Body = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const stripHtml = (html: string | null): string =>
  (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export async function searchCatalogEntries(request: FastifyRequest, reply: FastifyReply) {
  const parsed = Body.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues });
  }
  const { q, limit, offset } = parsed.data;

  const { ids, total } = await searchCatalog(q, { limit, offset });
  if (ids.length === 0) return reply.send({ total, results: [] });

  const rows = await query<{
    id: string; anilist_id: number; cover_image: string | null;
    title: string | null; synopsis: string | null;
    format: string | null; episodes: number | null; season_year: number | null;
    avg_score: number | null; popularity: number | null;
  }>(
    `SELECT m.id, m.anilist_id, m.cover_image,
              COALESCE(m.title_english, m.title_romaji) AS title, m.synopsis,
              m.format, m.episodes, m.season_year, m.avg_score, m.popularity
         FROM media m WHERE m.id = ANY($1::bigint[])`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const covers = await ensureCovers(rows);

  const results = ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map((row) => ({
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

  return reply.send({ total, results });
}
