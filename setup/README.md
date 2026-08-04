# setup/

One command to bring the data layer up to the **active vocabulary version**, and
to re-sync it after a bump.

## Contents

Runnable entry points for every setup-time operation. Each is a thin wrapper —
the logic lives in `src/` (so the running API can share it); these just parse
args and call it.

| File | npm script | Does |
|------|------------|------|
| `setup.ts` | `npm run setup` | ingest (if empty) → enrich → rebuild taste |
| `ingest.ts` | `npm run ingest:catalogue` | page the AniList catalogue into `media` |
| `enrich.ts` | `npm run enrich:catalogue` | label titles against the active vocabulary |
| `buildVocabulary.ts` | `npm run enrich:sample` / `npm run vocab:build` | discovery pass / AI-build a new vocabulary version |

## Prerequisites (owned elsewhere)

- **Schema + vocabulary**: applied by **Flyway** from `migrations/` (`V*__*.sql`).
  Run your Flyway migrate step first — it creates the tables and seeds each
  vocabulary version. This project no longer ships a Node migration runner.
- **Ollama**: running with the configured model (`OLLAMA_MODEL`), for enrichment.
- **`.env`**: `DATABASE_URL`, `ACTIVE_VOCABULARY_VERSION` (the AI-built version to
  serve), and `BASE_VOCABULARY_VERSION` (the hand-seeded version to expand from).

## Run

```bash
npm run setup
```

It performs, in order:

0. **Build the vocabulary.** The active version (`ACTIVE_VOCABULARY_VERSION`) is
   the **AI-built expansion** of the hand-seeded `BASE_VOCABULARY_VERSION`: setup
   samples the catalogue, has the model propose mood words, consolidates them
   into the base's tags plus new ones, and loads them as the active version. Built
   once, then frozen (skipped on later runs). If `ACTIVE == BASE`, the hand-seeded
   set is used as-is with no AI build.
1. **Ingest** the AniList catalogue into `media` — one-time; skipped if `media`
   is already populated (a version bump does not re-ingest).
2. **Enrich** every title against the active version → `media_mood_tag`
   + `media_enrichment`. Idempotent per (title, version).
3. **Rebuild taste** for every imported user against the active vocabulary.

## When to re-run

- **After bumping `ACTIVE_VOCABULARY_VERSION`** (e.g. Flyway seeded a new v3, or
  you ran `npm run vocab:build`): run `npm run setup`. Step 2 re-enriches the
  whole catalogue against the new version; step 3 rebuilds taste to match.
- Re-running with no change is safe and cheap — enrichment skips already-done
  titles and prints a per-title `skip`.

Check progress any time with `npm run status`.
