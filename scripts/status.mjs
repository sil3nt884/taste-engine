import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const COUNTS = [
  ['vocabulary', 'vocabulary'],
  ['mood_tag', 'mood_tag'],
  ['media', 'media'],
  ['media_mood_tag (enriched rows)', 'media_mood_tag'],
  ['media_enrichment', 'media_enrichment'],
  ['query_cache', 'query_cache'],
  ['user_account', 'user_account'],
];

try {
  const rows = {};
  for (const [label, table] of COUNTS) {
    const { rows: r } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
    rows[label] = r[0].n;
  }
  console.log('\nDatabase status:');
  for (const [label] of COUNTS) {
    console.log(`  ${label.padEnd(32)} ${rows[label]}`);
  }
  const media = rows['media'];
  const enriched = rows['media_mood_tag (enriched rows)'];
  console.log('');
  if (media === 0) console.log('  -> media is empty: run `npm run ingest:catalogue`');
  else if (enriched === 0) console.log('  -> nothing enriched: run `npm run enrich:catalogue` (needs Ollama)');
  else console.log('  -> catalogue is ingested and enriched: search should return results');
} catch (e) {
  if (e.code === 'ECONNREFUSED') {
    console.error('\nCannot reach Postgres at', process.env.DATABASE_URL);
    console.error('Postgres is not running (or not listening on that host/port).');
    console.error('Start it, then re-run `npm run status`.');
  } else if (e.code === '42P01') {
    console.error('\nConnected, but a table is missing. Run your Flyway migrations first.');
  } else {
    console.error('\nDB error:', e.code ?? '', e.message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
