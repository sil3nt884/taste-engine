import { pool } from '../src/db.js';
import { ingestCatalogue } from '../src/ingest/anilistAnimeFetch.js';

const arg = process.argv.find((arg) => arg.startsWith('--from-page='));
const fromPage = arg ? Number(arg.split('=')[1]) : 1;

ingestCatalogue(fromPage)
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
