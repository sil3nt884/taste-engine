import { query } from '../db.js';
import { embed, asDocument, toVector } from '../enrich/embed.js';

export async function embedMoodTags(vocabularyId: number): Promise<{ embedded: number; total: number }> {
  const rows = await query<{ id: string; slug: string; label: string; definition: string }>(
    `SELECT id, slug, label, definition
       FROM mood_tag
      WHERE vocabulary_id = $1 AND embedding IS NULL`,
    [vocabularyId],
  );
  for (const row of rows) {
    const vector = toVector(await embed(asDocument(`${row.label}: ${row.definition}`)));
    await query(`UPDATE mood_tag SET embedding = $1::vector WHERE id = $2`, [vector, row.id]);
  }
  const [counted] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM mood_tag WHERE vocabulary_id = $1 AND embedding IS NOT NULL`,
    [vocabularyId],
  );
  return { embedded: rows.length, total: counted?.total ?? 0 };
}

/**
 * The weighted centroid of an extraction's positive-mood embeddings — its single
 * "feel" vector. Returns a ::vector literal, or null when no slug is embedded yet.
 */
export async function moodCentroid(
  vocabularyId: number,
  terms: Array<{ slug: string; weight: number }>,
): Promise<string | null> {
  if (terms.length === 0) return null;
  const rows = await query<{ slug: string; embedding: string }>(
    `SELECT slug, embedding::text AS embedding
       FROM mood_tag
      WHERE vocabulary_id = $1 AND slug = ANY($2::text[]) AND embedding IS NOT NULL`,
    [vocabularyId, terms.map((term) => term.slug)],
  );
  if (rows.length === 0) return null;

  const weightBySlug = new Map(terms.map((term) => [term.slug, term.weight]));
  const dims = (JSON.parse(rows[0]!.embedding) as number[]).length;
  const accumulator = new Array<number>(dims).fill(0);
  let totalWeight = 0;
  for (const row of rows) {
    const vector = JSON.parse(row.embedding) as number[];
    const weight = weightBySlug.get(row.slug) ?? 0;
    for (let dim = 0; dim < dims; dim++) accumulator[dim]! += vector[dim]! * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  for (let dim = 0; dim < dims; dim++) accumulator[dim]! /= totalWeight;
  return toVector(accumulator);
}
