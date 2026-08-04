import { config } from '../src/config.js';
import { pool, query } from '../src/db.js';
import { ingestCatalogue } from '../src/ingest/anilistAnimeFetch.js';
import { resolveFranchiseRoots } from '../src/ingest/franchise.js';
import { enrichCatalogueLocal } from '../src/enrich/enrichLocal.js';
import { embedCatalogue } from '../src/enrich/embed.js';
import { buildVocabulary } from '../src/enrich/vocabulary.js';
import { buildTaste } from '../src/user/taste.js';

async function count(table: string): Promise<number> {
  const [r] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r?.n ?? 0;
}

async function vocabExists(version: number): Promise<boolean> {
  const [v] = await query<{ id: string }>(
    `SELECT id FROM vocabulary WHERE version = $1`, [version],
  );
  return Boolean(v);
}

async function main(): Promise<void> {
  const version = config.ACTIVE_VOCABULARY_VERSION;
  const base = config.BASE_VOCABULARY_VERSION;
  console.log(`\n== taste-engine setup — active vocabulary v${version} (base seed v${base}) ==\n`);

  // 0. The hand-seeded base vocabulary comes from Flyway; verify it landed.
  if (!(await vocabExists(base))) {
    throw new Error(
      `base vocabulary version ${base} is not in the database.\n` +
      `Run your Flyway migrations first (they seed it), then re-run \`npm run setup\`.`,
    );
  }

  if (!(await vocabExists(version))) {
    if (version === base) {
      throw new Error(
        `vocabulary version ${version} equals the base but is missing — check your Flyway seed.`,
      );
    }
    console.log(`0/3 building vocabulary v${version} by AI-expanding the hand-seeded v${base} (needs Ollama)...`);
    await buildVocabulary(version, { baseVersion: base });
  } else {
    console.log(`0/3 vocabulary v${version} already built — reusing (frozen).`);
  }

  // 1. Catalogue ingest — one-time. Not tied to the vocabulary, so skip it once
  //    media is populated (a version bump does not need a re-ingest).
  const media = await count('media');
  if (media === 0) {
    console.log('1/3 ingesting catalogue from AniList (first run, this pages the whole catalogue)...');
    await ingestCatalogue();
  } else {
    console.log(`1/3 catalogue present (${media} titles) — skipping ingest.`);
  }

  // 1b. Resolve franchise roots from the relation graph (cheap, no model). Lets
  //     search collapse a franchise to its entry-point series.
  console.log('1b/3 resolving franchise roots...');
  const fr = await resolveFranchiseRoots();
  console.log(`     ${fr.franchises} franchises across ${fr.titles} titles.`);

  // 2. Enrich against the active vocabulary. This is the slow, version-specific
  //    step: a fresh version enriches all titles; an unchanged one skips all.
  console.log(`2/3 enriching catalogue against vocabulary v${version} (needs Ollama running)...`);
  await enrichCatalogueLocal(version);

  // 2b. Embed the catalogue for semantic search. Best-effort: if pgvector or the
  //     embedding model aren't set up yet, warn and carry on (the slug engine
  //     still works; embeddings only power `useEmbeddings: true`).
  try {
    console.log('2b/3 embedding catalogue for semantic search...');
    await embedCatalogue();
  } catch (err) {
    console.warn(`     skipped embeddings: ${(err as Error).message}`);
    console.warn('     (install pgvector + `ollama pull nomic-embed-text`, then `npm run embed:catalogue`)');
  }

  // 3. Rebuild taste for every imported user against the active vocabulary — their
  //    stored affinity was computed against whatever version was active at import.
  const users = await query<{ id: string }>(`SELECT id FROM user_account ORDER BY id`);
  console.log(`3/3 rebuilding taste for ${users.length} user(s)...`);
  for (const user of users) await buildTaste(user.id);

  console.log(`\nsetup complete — vocabulary v${version} is live and enriched.\n`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('\nsetup failed:', (err as Error).message);
    await pool.end();
    process.exit(1);
  });
