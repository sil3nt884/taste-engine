import { config } from '../config.js';
import { query } from '../db.js';

export async function buildTaste(userId: string): Promise<void> {
  const [vocab] = await query<{ id: string }>(
    `SELECT id FROM vocabulary WHERE version = $1`,
    [config.ACTIVE_VOCABULARY_VERSION],
  );
  if (!vocab) throw new Error(`active vocabulary version ${config.ACTIVE_VOCABULARY_VERSION} not loaded`);
  const vocabularyId = Number(vocab.id);

  // Sum mood intensity across everything the user has completed. Titles that
  // aren't enriched yet simply contribute nothing.
  const rows = await query<{ slug: string; weight: number }>(
    `SELECT mt.slug, SUM(mmt.intensity)::float AS weight
       FROM list_entry le
       JOIN media_mood_tag mmt ON mmt.media_id = le.media_id
                              AND mmt.vocabulary_id = $2
       JOIN mood_tag mt        ON mt.id = mmt.mood_tag_id
      WHERE le.user_id = $1 AND le.status = 'COMPLETED'
      GROUP BY mt.slug`,
    [userId, vocabularyId],
  );

  const [counted] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM list_entry
      WHERE user_id = $1 AND status = 'COMPLETED'`,
    [userId],
  );
  const completedCount = counted?.n ?? 0;

  // Normalise to 0..1 against the strongest mood so weights are comparable
  // across users regardless of how much they have watched.
  const max = rows.reduce((peak, row) => Math.max(peak, row.weight), 0);
  const affinity: Record<string, number> = {};
  if (max > 0) {
    for (const row of rows) affinity[row.slug] = Number((row.weight / max).toFixed(4));
  }

  await query(
    `INSERT INTO user_taste (user_id, vocabulary_id, mood_affinity, completed_count, computed_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (user_id) DO UPDATE SET
       vocabulary_id   = EXCLUDED.vocabulary_id,
       mood_affinity   = EXCLUDED.mood_affinity,
       completed_count = EXCLUDED.completed_count,
       computed_at     = now()`,
    [userId, vocabularyId, JSON.stringify(affinity), completedCount],
  );
}
