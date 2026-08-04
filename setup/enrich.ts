import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { enrichCatalogueLocal } from '../src/enrich/enrichLocal.js';

const arg = process.argv[2];
const limit = arg && !arg.startsWith('-') ? Number(arg) : undefined;

enrichCatalogueLocal(config.ACTIVE_VOCABULARY_VERSION, limit)
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
