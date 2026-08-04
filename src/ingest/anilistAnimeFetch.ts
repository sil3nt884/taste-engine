import { config } from '../config.js';
import { withTransaction } from '../db.js';
import {ANILIST_ENDPOINT, ANILIST_PER_PAGE} from "../consts";
import {AniListMedia, PageResponse} from "../types";


const CATALOGUE_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage lastPage }
    media(type: ANIME, sort: ID) {
      id
      idMal
      title { romaji english }
      format
      status
      episodes
      season
      seasonYear
      averageScore
      popularity
      description(asHtml: false)
      source
      isAdult
      genres
      tags { name rank isMediaSpoiler category isAdult }
      relations { edges { relationType node { id type } } }
    }
  }
}`;



const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page: number, signal?: AbortSignal): Promise<PageResponse['Page']> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: CATALOGUE_QUERY,
      variables: { page, perPage: ANILIST_PER_PAGE },
    }),
    signal,
  });

  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? '60');
    console.warn(`rate limited, sleeping ${retry}s`);
    await sleep(retry * 1000);
    return fetchPage(page, signal);
  }
  if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { data?: PageResponse; errors?: unknown };
  if (body.errors || !body.data) {
    throw new Error(`AniList GraphQL: ${JSON.stringify(body.errors)}`);
  }
  return body.data.Page;
}

async function upsertMedia(media: AniListMedia): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO media (anilist_id, mal_id, title_romaji, title_english, format, status,
                          episodes, season, season_year, avg_score, popularity,
                          synopsis, source, is_adult, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       ON CONFLICT (anilist_id) DO UPDATE SET
         mal_id = EXCLUDED.mal_id,
         title_romaji = EXCLUDED.title_romaji,
         title_english = EXCLUDED.title_english,
         format = EXCLUDED.format,
         status = EXCLUDED.status,
         episodes = EXCLUDED.episodes,
         season = EXCLUDED.season,
         season_year = EXCLUDED.season_year,
         avg_score = EXCLUDED.avg_score,
         popularity = EXCLUDED.popularity,
         synopsis = EXCLUDED.synopsis,
         source = EXCLUDED.source,
         is_adult = EXCLUDED.is_adult,
         updated_at = now()
       RETURNING id`,
      [
        media.id, media.idMal, media.title.romaji, media.title.english, media.format, media.status,
        media.episodes, media.season, media.seasonYear, media.averageScore, media.popularity,
        media.description, media.source, media.isAdult ?? false,
      ],
    );
    const mediaId = rows[0]!.id;

    // Genres: replace the set so removals propagate.
    await client.query(`DELETE FROM media_genre WHERE media_id = $1`, [mediaId]);
    for (const name of media.genres) {
      const { rows: genreRows } = await client.query<{ id: string }>(
        `INSERT INTO genre (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name],
      );
      await client.query(
        `INSERT INTO media_genre (media_id, genre_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [mediaId, genreRows[0]!.id],
      );
    }

    // Community tags: same replace-the-set treatment.
    await client.query(`DELETE FROM media_tag WHERE media_id = $1`, [mediaId]);
    for (const communityTag of media.tags) {
      const { rows: tagRows } = await client.query<{ id: string }>(
        `INSERT INTO tag (name, category, is_adult) VALUES ($1,$2,$3)
         ON CONFLICT (name) DO UPDATE SET
           category = EXCLUDED.category, is_adult = EXCLUDED.is_adult
         RETURNING id`,
        [communityTag.name, communityTag.category, communityTag.isAdult ?? false],
      );
      await client.query(
        `INSERT INTO media_tag (media_id, tag_id, rank, is_spoiler)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [mediaId, tagRows[0]!.id, communityTag.rank, communityTag.isMediaSpoiler],
      );
    }

    // Relations to other ANIME titles, keyed by anilist_id (franchise graph,
    // §5.2). Replace this title's outgoing edges so removals propagate.
    await client.query(`DELETE FROM media_relation WHERE from_anilist_id = $1`, [media.id]);
    for (const edge of media.relations?.edges ?? []) {
      if (!edge.node || edge.node.type !== 'ANIME' || !edge.relationType) continue;
      await client.query(
        `INSERT INTO media_relation (from_anilist_id, to_anilist_id, relation_type)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [media.id, edge.node.id, edge.relationType],
      );
    }
  });
}

export async function ingestCatalogue(fromPage = 1): Promise<void> {
  const delayMs = Math.ceil(60_000 / config.ANILIST_RATE_PER_MIN);
  let page = fromPage;
  let total = 0;

  for (;;) {
    const { media, pageInfo } = await fetchPage(page);
    for (const item of media) await upsertMedia(item);
    total += media.length;
    console.log(
      `page ${pageInfo.currentPage}/${pageInfo.lastPage} — ${media.length} titles (${total} total)`,
    );
    if (!pageInfo.hasNextPage) break;
    page += 1;
    await sleep(delayMs);
  }
  console.log(`catalogue ingest complete: ${total} titles`);
}
