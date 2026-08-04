import { searchQuery } from '../src/search/query.js';
import { pool } from '../src/db.js';

const args = process.argv.slice(2);
const query = args.join(' ') || 'i want a sad anime';

try {
  const result = await searchQuery({ q: query, explain: false });
  console.log('\nquery      :', query);
  console.log('source     :', result.source);
  console.log('extraction :', JSON.stringify(result.extraction));
  console.log('matches    :', result.results.length);
  console.log('titles     :', JSON.stringify(result.results.map((item) => item.title), null, 0));
  console.log('top        :', JSON.stringify(
    result.results.slice(0, 8).map((item) => ({ title: item.title, why: item.why })),
    null, 2,
  ));
} catch (err) {
  console.error('\nERROR:', (err as Error).message);
} finally {
  await pool.end();
}
