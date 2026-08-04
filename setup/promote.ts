import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { promoteVocabulary } from '../src/enrich/vocabulary.js';

const buildArg = process.argv.find((arg) => arg.startsWith('--build='));
if (!buildArg) {
  console.error('usage: npm run vocab:promote -- --build=<n> [--base=<n>] [--min=<freq>]');
  process.exit(1);
}
const newVersion = Number(buildArg.split('=')[1]);
const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
const baseVersion = baseArg ? Number(baseArg.split('=')[1]) : config.ACTIVE_VOCABULARY_VERSION;
const minArg = process.argv.find((arg) => arg.startsWith('--min='));
const minFrequency = minArg ? Number(minArg.split('=')[1]) : 3;

promoteVocabulary(newVersion, { baseVersion, minFrequency })
  .then((result) => {
    console.log(`v${newVersion} = v${baseVersion} + ${result.added} suggested tone(s) → ${result.total} tags.`);
    if (result.added === 0) {
      console.log('(no suggestions above the frequency threshold yet — nothing new to add.)');
    } else {
      console.log(`Next: set ACTIVE_VOCABULARY_VERSION=${newVersion} and \`npm run setup\` to enrich.`);
    }
    return pool.end();
  })
  .catch((err) => { console.error((err as Error).message); process.exit(1); });
