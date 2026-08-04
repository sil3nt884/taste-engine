import { MeiliSearch } from 'meilisearch';
import { config } from '../config.js';
import { query } from '../db.js';
import type { CatalogDoc } from '../types';
import { MEILI_INDEX } from '../consts';

const client = new MeiliSearch({ host: config.MEILI_HOST, apiKey: config.MEILI_KEY });
export const catalogIndex = client.index(MEILI_INDEX);

export async function ensureCatalogIndex(): Promise<void> {
  try { await client.createIndex(MEILI_INDEX, { primaryKey: 'id' }); } catch { }
  await catalogIndex.updateSettings({
    searchableAttributes: ['title_english', 'title_romaji', 'synopsis', 'genres', 'tags'],
    filterableAttributes: ['genres', 'tags', 'format', 'is_adult'],
    sortableAttributes: ['popularity', 'avg_score'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'popularity:desc'],
  });
}

async function fetchDocs(mediaIds: string[]): Promise<CatalogDoc[]> {
  if (mediaIds.length === 0) return [];
  const rows = await query<{
    id: string; title_romaji: string | null; title_english: string | null;
    synopsis: string | null; format: string | null; episodes: number | null;
    popularity: number | null; avg_score: number | null; is_adult: boolean;
    genres: string[] | null; tags: string[] | null;
  }>(
    `SELECT m.id, m.title_romaji, m.title_english, m.synopsis, m.format, m.episodes,
            m.popularity, m.avg_score, m.is_adult,
            COALESCE(array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres,
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
       FROM media m
       LEFT JOIN media_genre mg ON mg.media_id = m.id
       LEFT JOIN genre       g  ON g.id = mg.genre_id
       LEFT JOIN media_tag   mt ON mt.media_id = m.id AND mt.rank >= 40
       LEFT JOIN tag         t  ON t.id = mt.tag_id
      WHERE m.id = ANY($1::bigint[])
      GROUP BY m.id`,
    [mediaIds],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title_english ?? row.title_romaji ?? 'Unknown',
    title_romaji: row.title_romaji,
    title_english: row.title_english,
    synopsis: (row.synopsis ?? '').replace(/<[^>]+>/g, '').trim(),
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    format: row.format,
    episodes: row.episodes,
    popularity: row.popularity,
    avg_score: row.avg_score,
    is_adult: row.is_adult,
  }));
}

export async function indexMedia(mediaIds: string[]): Promise<void> {
  const docs = await fetchDocs(mediaIds);
  if (docs.length) await catalogIndex.addDocuments(docs, { primaryKey: 'id' });
}

export async function removeMedia(mediaIds: string[]): Promise<void> {
  if (mediaIds.length) await catalogIndex.deleteDocuments(mediaIds);
}

export async function searchCatalog(
  q: string, opts: { limit?: number; offset?: number } = {},
): Promise<{ ids: string[]; total: number }> {
  const res = await catalogIndex.search(q, {
    limit: opts.limit ?? 20,
    offset: opts.offset ?? 0,
    attributesToRetrieve: ['id'],
  });
  return {
    ids: res.hits.map((hit) => String((hit as { id: string | number }).id)),
    total: res.estimatedTotalHits ?? res.hits.length,
  };
}

export async function reindexCatalog(): Promise<number> {
  await ensureCatalogIndex();
  const rows = await query<{ id: string }>(`SELECT id FROM media ORDER BY id`);
  const ids = rows.map((row) => row.id);
  const BATCH = 1000;
  for (let offset = 0; offset < ids.length; offset += BATCH) {
    await indexMedia(ids.slice(offset, offset + BATCH));
    console.log(`  indexed ${Math.min(offset + BATCH, ids.length)}/${ids.length}`);
  }
  return ids.length;
}
