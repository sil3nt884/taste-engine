import { pool } from '../src/db.js';
import { reindexCatalog } from '../src/search/catalogIndex.js';

reindexCatalog()
  .then((count) => {
    console.log(`reindexed ${count} titles into Meilisearch.`);
    return pool.end();
  })
  .catch((err) => { console.error(err); process.exit(1); });
