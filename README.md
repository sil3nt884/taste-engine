# Taste Engine

Mood-based anime recommendation over your existing AniList/MAL history.
Read-only, import-based. See [DESIGN.md](./DESIGN.md) for the full rationale.

<img width="1262" height="832" alt="Untitled Diagram-Logical system" src="https://github.com/user-attachments/assets/1fe05fdc-1682-4a54-b2bf-82f0bcf6df78" />

## Run

```bash
docker compose up -d
cp .env.example .env      # points at local Ollama by default
ollama serve             # local model host
ollama pull llama3.1:8b  # the enrichment/extraction model
npm install
# schema + vocabulary are applied by Flyway from migrations/ (V*__*.sql)
flyway migrate            # or your Flyway runner of choice
npm run setup             # ingest catalogue + enrich against the active vocabulary
npm run dev               # api
```

`npm run setup` is also what you re-run after bumping `ACTIVE_VOCABULARY_VERSION`
(it re-enriches the catalogue and rebuilds taste) — see `setup/README.md`.

## Order of operations

The build order is deliberate — see DESIGN.md §11. In particular:

1. Backfill the catalogue.
2. `npm run enrich:sample` — free-generation pass, dumps a frequency table.
3. **Cluster the output by hand** into 100–200 tags with definitions, then
   `loadVocabulary()`. This step is manual on purpose; skipping it produces
   synonym drift that breaks matching between the query and catalogue sides.
4. `npm run enrich:catalogue` — label everything against the frozen
   vocabulary with the local model.
5. Hand-check 100 stratified titles and record the accuracy. **If it's poor,
   stop** — nothing downstream recovers from bad labels.
6. Only then build search on top.

## Two things that are easy to get wrong

**The token bucket is global, not per-process.** AniList rate-limits the
application, not the user. Run four workers with a per-process limit and you
send four times the budget. `src/ingest/tokenBucket.ts` is a Lua script so the
refill and take are atomic across processes.

**Never mix vocabulary versions in one query.** Scores computed against
different vocabularies aren't comparable. Every row that depends on a
vocabulary carries `vocabulary_id`, and the query cache is keyed on it too.

## Layout

```
migrations/          numbered SQL (Flyway naming V*__*.sql), applied by Flyway
setup/               one-command data setup / re-sync after a vocabulary bump
src/config.ts        env validation; LOCAL_MODEL_ID and PROMPT_VERSION live here
src/enrich/          vocabulary discovery + local catalogue labelling (Ollama)
src/ingest/          AniList client, token bucket, franchise graph
src/queue/           BullMQ import queue and worker
src/search/          canonicalise -> structure -> cache -> extract -> score
src/routes/          search (sync), import (async), health
```
