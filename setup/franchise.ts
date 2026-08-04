import { pool } from '../src/db.js';
import { resolveFranchiseRoots } from '../src/ingest/franchise.js';

resolveFranchiseRoots()
  .then((result) => {
    console.log(`resolved ${result.franchises} franchises across ${result.titles} titles.`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
