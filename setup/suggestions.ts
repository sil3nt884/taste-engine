import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { listSuggestions } from '../src/enrich/vocabulary.js';

const arg = process.argv[2];
const base = arg && !arg.startsWith('-') ? Number(arg) : config.ACTIVE_VOCABULARY_VERSION;

listSuggestions(base)
  .then((rows) => {
    if (rows.length === 0) {
      console.log(`no enrichment suggestions recorded against vocabulary v${base}.`);
    } else {
      console.log(`enrichment-proposed tones against v${base} (most-wanted first):\n`);
      for (const row of rows) {
        console.log(`  ${String(row.frequency).padStart(4)}  ${row.slug} — ${row.definition}`);
      }
      console.log(`\nFold the good, distinct ones into a new version with:`);
      console.log(`  npm run vocab:build -- --build=<n> --base=${base}`);
    }
    return pool.end();
  })
  .catch((err) => { console.error(err); process.exit(1); });
