import { pool, query } from '../src/db.js';
import { fetchCovers, storeCovers } from '../src/ingest/coverArt.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const rows = await query<{ id: string; anilist_id: number }>(
    `SELECT id, anilist_id FROM media WHERE cover_image IS NULL ORDER BY popularity DESC NULLS LAST`,
  );
  console.log(`${rows.length} title(s) missing a cover.`);

  const BATCH = 50;
  let stored = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const batch = rows.slice(offset, offset + BATCH);
    const covers = await fetchCovers(batch.map((row) => row.anilist_id));
    const fetched = batch
      .filter((row) => covers.has(row.anilist_id))
      .map((row) => ({ id: row.id, url: covers.get(row.anilist_id)! }));
    await storeCovers(fetched);
    stored += fetched.length;
    console.log(`  ${Math.min(offset + BATCH, rows.length)}/${rows.length} (stored ${stored})`);
    await sleep(2500);   // ~24 requests/min, under AniList's budget
  }
  console.log(`done: stored ${stored} cover URL(s).`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
