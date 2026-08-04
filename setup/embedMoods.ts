import { config } from '../src/config.js';
import { pool, query } from '../src/db.js';
import { embedMoodTags, moodCentroid } from '../src/search/moodVector.js';

async function main(): Promise<void> {
  const [vocab] = await query<{ id: string }>(
    `SELECT id FROM vocabulary WHERE version = $1`,
    [config.ACTIVE_VOCABULARY_VERSION],
  );
  if (!vocab) throw new Error(`active vocabulary v${config.ACTIVE_VOCABULARY_VERSION} not found`);
  const vocabularyId = Number(vocab.id);

  console.log(`embedding mood slugs for vocabulary v${config.ACTIVE_VOCABULARY_VERSION}…`);
  const { embedded, total } = await embedMoodTags(vocabularyId);
  console.log(`  embedded ${embedded} new slug(s); ${total} slugs now have embeddings.`);

  const rows = await query<{ cache_key: string; extraction: { positive?: { slug: string; weight: number }[] } }>(
    `SELECT cache_key, extraction FROM query_cache
      WHERE mood_embedding IS NULL AND vocabulary_id = $1`,
    [vocabularyId],
  );
  let filled = 0;
  for (const row of rows) {
    const centroid = await moodCentroid(vocabularyId, row.extraction.positive ?? []);
    if (centroid) {
      await query(`UPDATE query_cache SET mood_embedding = $1::vector WHERE cache_key = $2`, [centroid, row.cache_key]);
      filled++;
    }
  }
  console.log(`  backfilled feel centroid on ${filled}/${rows.length} cache row(s).`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
