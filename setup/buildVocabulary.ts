import { pool } from '../src/db.js';
import { discoverVocabulary, buildVocabulary } from '../src/enrich/vocabulary.js';

const buildArg = process.argv.find((arg) => arg.startsWith('--build='));

if (buildArg) {
  const newVersion = Number(buildArg.split('=')[1]);
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const baseVersion = baseArg ? Number(baseArg.split('=')[1]) : undefined;
  await buildVocabulary(newVersion, { baseVersion });
  await pool.end();
} else {
  const counts = await discoverVocabulary();
  for (const [term, n] of counts) if (n >= 3) console.log(`${n}\t${term}`);
  console.error('\nRun with `--build=<version> [--base=<version>]` to consolidate + load automatically.');
  await pool.end();
}
