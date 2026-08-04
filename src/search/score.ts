import { query } from '../db.js';
import { MIN_DF } from '../consts';

export async function recomputeIdf(vocabularyId: number): Promise<void> {
  const [row] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM media`,
  );
  const total = row?.total ?? 0;
  if (total === 0) return;

  await query(
    `WITH df AS (
       SELECT mood_tag_id, count(*)::int AS n
         FROM media_mood_tag
        WHERE vocabulary_id = $1
        GROUP BY mood_tag_id
     )
     UPDATE mood_tag mt
        SET idf = ln($2::float / GREATEST(COALESCE(df.n, $3), $3))
       FROM (SELECT id FROM mood_tag WHERE vocabulary_id = $1) all_tags
       LEFT JOIN df ON df.mood_tag_id = all_tags.id
      WHERE mt.id = all_tags.id`,
    [vocabularyId, total, MIN_DF],
  );
}
