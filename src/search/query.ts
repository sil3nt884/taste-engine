import { config, EMBED_MODEL_ID, LOCAL_MODEL_ID, PROMPT_VERSION } from '../config.js';
import { query } from '../db.js';
import { embed, embedQuery, asQuery, toVector } from '../enrich/embed.js';
import { canonicalise } from './canonicalise.js';
import { parseStructure, structuralHash } from './structure.js';
import { extractMoodQuery, moodExtractionHash } from './extract.js';
import { cacheKey, getCached, putCached, findSemantic } from './queryCache.js';
import { moodCentroid } from './moodVector.js';
import { explainResults } from './explain.js';
import type {
  Extraction, SearchResult, Recommendation, SearchResponse, TasteTerm,
} from '../types';
import {
  MIN_AVG_SCORE, PERSONALISATION, TASTE_WEIGHT, L2_SIMILARITY, L2_MIN_CONFIDENCE,
} from '../consts';

const excludeAdult = (alias: string): string => `
  AND NOT ${alias}.is_adult
  AND NOT EXISTS (
    SELECT 1 FROM media_tag amt JOIN tag atg ON atg.id = amt.tag_id
     WHERE amt.media_id = ${alias}.id AND atg.is_adult AND amt.rank >= 40
  )`;

// Quality gate: a recommendation should be at least decently rated. The catalogue
// puts real tearjerkers at 63-88 and a shampoo commercial at 54, so this drops
// junk/unrated content (NULL avg_score fails) without touching obscure classics.
const qualityGate = (alias: string): string => `
  AND ${alias}.avg_score >= ${MIN_AVG_SCORE}`;

async function activeVocabularyId(): Promise<number> {
  const [vocabulary] = await query<{ id: string }>(
    `SELECT id FROM vocabulary WHERE version = $1`,
    [config.ACTIVE_VOCABULARY_VERSION],
  );
  if (!vocabulary) {
    throw new Error(`active vocabulary version ${config.ACTIVE_VOCABULARY_VERSION} not loaded`);
  }
  return Number(vocabulary.id);
}

async function resolveUser(userName?: string): Promise<string | null> {
  if (!userName) return null;
  const [account] = await query<{ id: string }>(
    `SELECT id FROM user_account WHERE anilist_name = $1`, [userName],
  );
  return account ? account.id : null;
}

// The user's learned mood affinity (slug -> 0..1 weight), minus anything they've
// explicitly asked for in this query — those are already scored, so don't
// double-count them.
async function tasteAffinity(userId: string | null, exclude: Set<string>): Promise<TasteTerm[]> {
  if (userId === null) return [];
  const [row] = await query<{ mood_affinity: Record<string, number> }>(
    `SELECT mood_affinity FROM user_taste WHERE user_id = $1`, [userId],
  );
  if (!row) return [];
  return Object.entries(row.mood_affinity)
    .filter(([slug]) => !exclude.has(slug))
    .map(([slug, weight]) => ({ slug, weight: Number(weight) }));
}

export async function searchQuery(opts: {
  q: string;
  userId?: string;     // authenticated account id — takes precedence over userName
  userName?: string;   // AniList handle, resolved to an account (for unauthenticated callers)
  limit?: number;
  explain?: boolean;   // AI-write the `why` per result (default true). false = fast, template reasons.
}): Promise<SearchResponse> {
  const limit = opts.limit ?? 20;
  const explain = opts.explain ?? true;
  const vocabularyId = await activeVocabularyId();
  // A logged-in caller personalises by their own account; otherwise fall back to
  // resolving a supplied AniList handle.
  const userId = opts.userId ?? await resolveUser(opts.userName);

  const canonical = canonicalise(opts.q);
  const structure = parseStructure(opts.q);
  const key = cacheKey(canonical.form, vocabularyId, PROMPT_VERSION);
  const partition = structuralHash(structure, config.ACTIVE_VOCABULARY_VERSION, PROMPT_VERSION);

  // L1: exact canonical hit — no model, no embedding.
  let extraction = await getCached(key);
  let source: SearchResponse['source'] = 'l1-cache';

  if (!extraction) {
    // Slot embeddings (from the deterministic parser, so available before the
    // LLM) drive both the L2 lookup and, on a miss, what we store for later.
    const positiveText = structure.positive.join(' ').trim();
    const negatedText = structure.negated.join(' ').trim();
    const positiveVec = positiveText ? toVector(await embed(asQuery(positiveText))) : null;
    const negatedVec = negatedText ? toVector(await embed(asQuery(negatedText))) : null;

    // L2: reuse a same-partition extraction whose slots are cosine-close — skips
    // the LLM. Confidence-gated (§7.8); the partition already isolates negation.
    if (positiveVec && structure.confidence >= L2_MIN_CONFIDENCE) {
      extraction = await findSemantic({
        structuralHash: partition,
        vocabularyId,
        positiveVector: positiveVec,
        negatedVector: negatedVec,
        threshold: L2_SIMILARITY,
      });
      if (extraction) source = 'l2-cache';
    }

    // L3: the LLM. Cache the result under both tiers (exact + semantic slots).
    if (!extraction) {
      extraction = await extractMoodQuery(opts.q, vocabularyId);
      source = 'model';

      // Cache only a meaningful extraction. An empty one still ranks fine via
      // embeddings (coverage doesn't depend on the vocabulary).
      const hasMoods = extraction.positive.length > 0 || extraction.negative.length > 0;
      if (hasMoods) {
        await putCached({
          key,
          canonical: canonical.form,
          structuralHash: partition,
          moodHash: moodExtractionHash(extraction),
          vocabularyId,
          promptVersion: PROMPT_VERSION,
          modelId: LOCAL_MODEL_ID,
          extraction,
          positiveEmbedding: positiveVec,
          negatedEmbedding: negatedVec,
          moodEmbedding: await moodCentroid(vocabularyId, extraction.positive),
        });
      }
    }
  }

  const queryVector = await embedQuery(opts.q);
  // Personalise: nudge toward the user's affinity moods, excluding the ones they
  // explicitly asked for (already scored). Seen titles are still excluded in SQL.
  const queryMoods = new Set(extraction.positive.map((term) => term.slug));
  const taste = await tasteAffinity(userId, queryMoods);
  const results = await scoreHybrid(queryVector, extraction, taste, vocabularyId, userId, limit);

  // The explain cache is keyed by the mood extraction; the intent handed to the
  // explainer is the raw query (embeddings capture more than the moods alone).
  const explainKey = moodExtractionHash(extraction);
  if (explain) await explainResults(explainKey, [opts.q], results);

  return { source, extraction, results, recommendations: toRecommendations(results) };
}

function toRecommendations(results: SearchResult[]): Recommendation[] {
  return results.map((result) => ({
    media_id: result.media_id,
    title: result.title ?? 'Untitled',
    description: result.description,
    why: result.why,
  }));
}

const stripHtml = (html: string | null): string =>
  (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Hybrid retrieval: embeddings for coverage + the mood tags for control. Ranks by
 * cosine similarity, nudged UP for titles that also carry the asked-for moods and
 * pushed DOWN hard for titles carrying a NEGATED mood — so "relaxing but not sad"
 * gets the semantic breadth of embeddings AND the negation-safety of the tags.
 *   rank = cosine_similarity + 0.06·(positive moods present) − 0.5·(strongest negated mood)
 *          + taste_weight·(the user's affinity moods present, affinity-weighted)
 */
async function scoreHybrid(
  queryVector: string,
  extraction: Extraction,
  taste: TasteTerm[],
  vocabularyId: number,
  userId: string | null,
  limit: number,
): Promise<SearchResult[]> {
  const positiveMoods = extraction.positive.map((moodTerm) => moodTerm.slug);
  const negatedMoods = extraction.negative.map((moodTerm) => moodTerm.slug);
  const tasteSlugs = taste.map((term) => term.slug);
  const tasteWeights = taste.map((term) => term.weight);

  const rows = await query<{
    media_id: string;
    title: string | null;
    synopsis: string | null;
    dist: number;
  }>(
    `WITH scored AS (
       SELECT m.id AS media_id,
              COALESCE(m.franchise_root_id, m.id) AS root_id,
              (me.embedding <=> $1::vector) AS dist,
              COALESCE((SELECT count(*) FROM media_mood_tag pm JOIN mood_tag pt ON pt.id = pm.mood_tag_id
                         WHERE pm.media_id = m.id AND pt.vocabulary_id = $3
                           AND pt.slug = ANY($4::text[]) AND pm.intensity >= 0.5), 0)::int AS pos_count,
              COALESCE((SELECT max(nm.intensity) FROM media_mood_tag nm JOIN mood_tag nt ON nt.id = nm.mood_tag_id
                         WHERE nm.media_id = m.id AND nt.vocabulary_id = $3
                           AND nt.slug = ANY($5::text[])), 0)::float8 AS neg_max,
              COALESCE((SELECT SUM(ta.weight * tm.intensity)
                          FROM media_mood_tag tm JOIN mood_tag tt ON tt.id = tm.mood_tag_id
                          JOIN unnest($8::text[], $9::float8[]) AS ta(slug, weight) ON ta.slug = tt.slug
                         WHERE tm.media_id = m.id AND tt.vocabulary_id = $3 AND tm.intensity >= 0.5), 0)::float8 AS taste_boost
         FROM media m
         JOIN media_embedding me ON me.media_id = m.id AND me.model_id = $2
     ),
     ranked AS (
       -- cosine similarity, lifted by confirmed positive moods, dropped by any
       -- negated mood, penalised when the embedding match has NO mood overlap
       -- (an untagged/off-mood coincidence shouldn't beat a tag-confirmed title),
       -- and mildly nudged toward the user's affinity moods.
       SELECT *, (
           (1 - dist)
           + 0.06 * pos_count
           - 0.50 * neg_max
           - CASE WHEN pos_count = 0 THEN 0.10 ELSE 0 END
           + ${TASTE_WEIGHT} * taste_boost
         ) AS rank
         FROM scored
     ),
     best AS (
       SELECT DISTINCT ON (root_id) root_id, dist, rank
         FROM ranked
        ORDER BY root_id, rank DESC
     )
     SELECT rm.id AS media_id,
            COALESCE(rm.title_english, rm.title_romaji) AS title,
            rm.synopsis,
            b.dist
       FROM best b
       JOIN media rm ON rm.id = b.root_id
      WHERE NOT EXISTS (
          SELECT 1 FROM list_entry le
           WHERE le.user_id = $6 AND le.media_id = rm.id AND le.status <> 'PLANNING'
        )${excludeAdult('rm')}${qualityGate('rm')}
      ORDER BY b.rank DESC, rm.popularity DESC NULLS LAST
      LIMIT $7`,
    [queryVector, EMBED_MODEL_ID, vocabularyId, positiveMoods, negatedMoods, userId, limit, tasteSlugs, tasteWeights],
  );

  return rows.map((row) => {
    const similarity = Number((1 - row.dist).toFixed(4));
    return {
      media_id: row.media_id,
      title: row.title,
      description: stripHtml(row.synopsis),
      why: `Semantic + mood match (${similarity.toFixed(2)} similarity).`,
    };
  });
}
