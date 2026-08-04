import { pool } from '../src/db.js';
import { embedCatalogue } from '../src/enrich/embed.js';

const arg = process.argv[2];
const limit = arg && !arg.startsWith('-') ? Number(arg) : undefined;

embedCatalogue(limit)
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
