import { runCatalogSync } from '../src/ingest/catalogSync.js';

runCatalogSync().catch((err) => {
  console.error(err);
  process.exit(1);
});
