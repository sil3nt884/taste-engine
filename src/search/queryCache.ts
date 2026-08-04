import { createHash } from 'node:crypto';
import { query } from '../db.js';
import type { Extraction } from '../types';

export function cacheKey(form: string, vocabularyId: number, promptVersion: number): string {
  return createHash('sha256')
    .update(`${vocabularyId}:${promptVersion}:${form}`)
    .digest('hex');
}

export async function getCached(key: string): Promise<Extraction | null> {
  const rows = await query<{ extraction: Extraction }>(
    `UPDATE query_cache SET hits = hits + 1
      WHERE cache_key = $1
      RETURNING extraction`,
    [key],
  );
  return rows[0]?.extraction ?? null;
}

/**
 * L2 semantic lookup (DESIGN.md §7.5). Within one structural partition, return
 * the extraction of the nearest cached entry whose positive-slot embedding is
 * cosine >= threshold — and, when the query is negated, whose negated-slot
 * embedding is also >= threshold. A match reuses that extraction and skips the
 * LLM. Bumps `hits` on the reused row. Null = no close-enough neighbour.
 */
export async function findSemantic(args: {
  structuralHash: string;
  vocabularyId: number;
  positiveVector: string;        // ::vector literal
  negatedVector: string | null;  // ::vector literal, when the query is negated
  threshold: number;
}): Promise<Extraction | null> {
  const params: unknown[] = [args.structuralHash, args.vocabularyId, args.positiveVector, args.threshold];
  let negatedClause = '';
  if (args.negatedVector) {
    params.push(args.negatedVector);
    negatedClause = `AND negated_embedding IS NOT NULL
             AND (1 - (negated_embedding <=> $${params.length}::vector)) >= $4`;
  }
  const rows = await query<{ extraction: Extraction }>(
    `UPDATE query_cache SET hits = hits + 1
      WHERE cache_key = (
        SELECT cache_key FROM query_cache
         WHERE structural_hash = $1 AND vocabulary_id = $2
           AND positive_embedding IS NOT NULL
           AND (1 - (positive_embedding <=> $3::vector)) >= $4
           ${negatedClause}
         ORDER BY positive_embedding <=> $3::vector ASC
         LIMIT 1
      )
      RETURNING extraction`,
    params,
  );
  return rows[0]?.extraction ?? null;
}

export async function putCached(args: {
  key: string;
  canonical: string;
  structuralHash: string;
  moodHash: string;
  vocabularyId: number;
  promptVersion: number;
  modelId: string;
  extraction: Extraction;
  positiveEmbedding: string | null;   // ::vector literal (query positive slots)
  negatedEmbedding: string | null;    // ::vector literal (query negated slots)
  moodEmbedding: string | null;       // ::vector literal (extraction feel centroid)
}): Promise<void> {
  await query(
    `INSERT INTO query_cache
       (cache_key, canonical, structural_hash, mood_hash, vocabulary_id,
        prompt_version, model_id, extraction, positive_embedding, negated_embedding, mood_embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10::vector,$11::vector)
     ON CONFLICT (cache_key) DO UPDATE SET
       extraction = EXCLUDED.extraction,
       structural_hash = EXCLUDED.structural_hash,
       mood_hash = EXCLUDED.mood_hash,
       model_id = EXCLUDED.model_id,
       positive_embedding = EXCLUDED.positive_embedding,
       negated_embedding = EXCLUDED.negated_embedding,
       mood_embedding = EXCLUDED.mood_embedding`,
    [
      args.key, args.canonical, args.structuralHash, args.moodHash,
      args.vocabularyId, args.promptVersion, args.modelId, JSON.stringify(args.extraction),
      args.positiveEmbedding, args.negatedEmbedding, args.moodEmbedding,
    ],
  );
}
