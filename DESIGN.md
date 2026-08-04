# Anime Taste Engine — System Design

A mood-based anime recommendation service that reads a user's existing tracker
history and answers plain-language queries with explained, personalised results.

Not a tracker. Read-only, import-based. Users keep using AniList or MyAnimeList.

---

## 1. Problem

Existing trackers (MyAnimeList, AniList, Kitsu) are catalogues with list
management attached. They answer *"what is this show"* and *"what have I
watched"*. They do not answer:

- *"Something melancholy but not depressing, short enough for this weekend."*
- *"What's on my plan-to-watch that I'd actually finish?"*

Two structural reasons why:

**No affective vocabulary.** Community tag systems describe *content*, not
*tone*. AniList has `Male Protagonist`, `Time Skip`, and `Shounen`; it does not
have `melancholy`, `comforting`, or `slow-burn`. There is nothing in the
schema to match a mood query against.

**Mutable list entries.** A tracker row is overwritten in place: when a score
changes from 7 to 9 on rewatch, the 7 is gone permanently. Dropped shows are
stored as a status and never used as negative evidence, despite dropping being
a higher-cost, higher-signal action than rating.

## 2. What this system does

1. Enriches the catalogue with a derived mood vocabulary (§4.1).
2. Imports a user's full list history from AniList or MAL.
3. Derives a taste model: drop signature, staff affinity, normalised scores.
4. Accepts a plain-language mood query.
5. Returns ranked titles, each with a stated reason grounded in the database.

Example response:

> **Title A** — comforting (high), quietly-sad (medium), 12 episodes.
> You rated four other comforting titles above your personal mean.
>
> **Title B** — low on bleak, a mood present in six of your nine drops.

The reason line is a projection of the ranking score, not a separate feature
and not generated prose. It is arithmetic over the database and is therefore
correct by construction.

---

## 3. Design principles

**Symmetric vocabulary.** The catalogue and the query are labelled by the same
model into the same fixed vocabulary. Matching is then a set operation between
two things that speak the same language. This is the central idea; everything
else is plumbing around it.

**Controlled, not generated.** The vocabulary is fixed by hand after sampling,
then enforced on both sides. Free generation produces drift — `melancholy`,
`melancholic`, `wistful`, and `somber` as four tags meaning one thing — and
drift breaks matching, hashing, and IDF alike.

**Sync for milliseconds, async for minutes.** Two user-facing pipelines,
opposite treatment. This threshold is the most important architectural
decision here; see §10 for the rejected alternative.

**No model in the request path.** LLM latency is 300–800ms and belongs to a
third party. It sits behind a cache and, on miss, is the only slow component.

**Deterministic explanations.** Nothing user-facing is generated at request
time. Every claim in a result is a value read from Postgres, so there is no
hallucination surface and no groundedness checking required.

**Own the systems, rent the models.** Embeddings, enrichment, and extraction
are bought. Retrieval, queuing, scheduling, caching, vocabulary control, and
the taste model are built.

---

## 4. Architecture

Three pipelines. Only two are user-facing.

### 4.1 Enrichment pipeline — offline batch

The foundation. Runs before the product exists, then on catalogue updates.
Enrichment quality is the ceiling on every downstream number, so it is built
and measured first.

**Pass 1 — vocabulary discovery.** Sample ~2,000 titles spanning eras,
formats, and popularity tiers. For each, prompt the model with the synopsis,
the AniList tags with their community ranks, and two or three review excerpts.
Let it emit mood descriptors freely. Collect everything.

**Pass 2 — consolidation (manual).** Cluster the emitted terms and collapse
synonyms into a fixed vocabulary of 100–200 mood tags. Write down the
inclusion criteria for each. This step is manual, unglamorous, and routinely
skipped — it is what turns a pile of strings into a schema.

**Pass 3 — full enrichment.** Re-run the entire catalogue *constrained* to the
fixed vocabulary, requesting an intensity bucket per tag. Use a batch API and
a small model; ~20,000 titles at one call each runs overnight and costs little.

```
media (20k)
   |
   +-- synopsis
   +-- AniList tags + ranks      -->  LLM  -->  mood tags + intensity
   +-- review excerpts                              |
                                                    v
                                        media_mood_tag rows
                                        stamped with vocab + model version
```

Feeding the AniList tags in as input matters. "Iyashikei 91%, Episodic 70%"
gives the model far more to work with than prose alone, and grounds the output
in community judgement rather than the model's read of a marketing blurb.

**Versioning.** Every row carries the vocabulary version and model identifier
that produced it. If the model changes mid-run, half the catalogue speaks a
different dialect and scores become incomparable. Never mix versions in a
single query.

### 4.2 Import pipeline — asynchronous

Runs on account connect and on a refresh schedule. Duration: minutes.

```
POST /import  ->  enqueue job  ->  202 Accepted + job id
                       |
                       v
              [ import queue ]
                       |
              worker pool (N workers)
                       |
              AniList GraphQL
              (shared token bucket)
                       |
                       v
              append to event log
                       |
                       v
   emit IMPORT_COMPLETE  ->  rebuild taste model  ->  notify user
```

The request returns immediately with a job id. The client polls or holds an
SSE connection, showing queue position and percentage. The user may navigate
away and is notified on completion.

This is where event-driven design earns its keep: the work is genuinely long,
genuinely failure-prone, and genuinely worth resuming.

### 4.3 Query pipeline — synchronous

Runs per search. Target: p95 under 200ms.

```
GET /search?q=...
     |
     v
canonicalise  (§7.2)
     |
     v
L1  exact hash          --hit-->  structured query  --+
     | miss                                           |
     v                                                |
L2  structural + semantic --hit-->                    |
     | miss                                           |
     v                                                |
L3  LLM extraction (300-800ms)                        |
     |                                                |
     +--> write L1 + L2 ------------------------------+
                                                      |
                                                      v
                                           SQL scoring (5-15ms)
                                                      |
                                                      v
                                           merge user taste model
                                                      |
                                                      v
                                           explained results
```

No queue. No notification. The whole path is a single request because the
whole path is sub-second.

---

## 5. Data model

### 5.1 Two tag layers

They do different jobs and both are kept.

| Layer | Source | Used for |
|---|---|---|
| `tag` | AniList, community-ranked | objective content, hard filters, enrichment input |
| `mood_tag` | LLM-derived, controlled vocabulary | affect, tone, pacing — the matching layer |

Discarding the AniList layer would be a mistake: it is the highest-quality
input to enrichment, and it carries community vote weight that a single model
pass cannot reproduce.

### 5.2 Catalogue (global, shared by all users)

```sql
media             id, anilist_id, title_romaji, title_english, format, status,
                  episodes, season, season_year, avg_score, popularity,
                  synopsis, source

tag               id, anilist_tag_id, name, category, is_adult
media_tag         media_id, tag_id, rank, is_spoiler
                  PRIMARY KEY (media_id, tag_id)

vocabulary        id, version, model_id, created_at, notes
                  -- one row per frozen vocabulary release

mood_tag          id, vocabulary_id, slug, label, definition, idf
                  UNIQUE (vocabulary_id, slug)
                  -- idf precomputed after enrichment, see §6.2

media_mood_tag    media_id, mood_tag_id, intensity, vocabulary_id
                  PRIMARY KEY (media_id, mood_tag_id)
                  INDEX ON (mood_tag_id)      -- load-bearing, see §6.2

relation          from_media_id, to_media_id, type
                  -- SEQUEL | PREQUEL | SIDE_STORY | ALTERNATIVE | ADAPTATION

franchise         id, root_media_id
media_franchise   media_id, franchise_id, depth
```

**`intensity` is a coarse bucket, not a float.** The model returns
high / medium / low, stored as 1.0 / 0.6 / 0.3. LLM self-reported confidence
is poorly calibrated at fine granularity; three buckets are measurably more
stable than a continuous 0–1 score and are all the ranking needs.

**`franchise` is derived, not ingested.** Union-find over `relation`, merging
on SEQUEL / PREQUEL / SIDE_STORY but not ADAPTATION. The entry point is the
node with no incoming PREQUEL edge. This prevents recommending season three of
an unstarted series.

### 5.3 User history (append-only)

```sql
list_event   id, user_id, media_id, event_type, payload, occurred_at
             -- STARTED | PROGRESSED | SCORED | PAUSED | RESUMED
             -- | DROPPED | COMPLETED | REWATCH_STARTED
             INDEX ON (user_id, occurred_at)
```

The conventional mutable `list_entry` row is a materialised view over this log
and can be rebuilt at any time. Every derived feature below depends on
temporal information that a mutable row destroys.

### 5.4 Derived taste model (per user, rebuilt on import)

```sql
user_taste   user_id, mean_score, score_stddev,
             drop_signature jsonb,     -- mood_tag slug -> penalty weight
             staff_affinity jsonb,     -- staff_id -> shrunk delta
             vocabulary_id,
             computed_at
```

**Drop signature.** For each mood tag, compare prevalence among the user's
drops against prevalence among their completions. Over-represented tags become
negative weights at query time.

**Staff affinity.** Per-director and per-studio mean score delta relative to
the user's own mean. Samples are small — often n=3 — so raw means are noise.
Apply empirical Bayes shrinkage toward the user's global mean, strength
inversely proportional to sample size. Note the honest consequence: for users
with thin histories this correctly outputs approximately zero (§9).

**Score normalisation.** Users occupy different ranges. Store mean and standard
deviation, z-score before any cross-user comparison.

---

## 6. Query pipeline in detail

### 6.1 Mood extraction

Symmetric with enrichment: same model, same vocabulary, same output shape.
The model's job is classification against a fixed list, not generation — the
vocabulary is 100–200 entries and fits comfortably in a prompt, so a small
fast model suffices.

```json
{
  "positive": [
    {"tag": "comforting",   "weight": 1.0},
    {"tag": "gently-funny", "weight": 0.4}
  ],
  "negative": [
    {"tag": "bleak", "weight": 0.8}
  ],
  "filters": {"max_episodes": 13}
}
```

Validate every returned slug against `mood_tag` for the active vocabulary
version. Anything unrecognised is dropped, not coerced.

**Fallback.** If nothing validates, fall back to full-text search over titles
and synopses rather than returning an error — and do not cache the result.

### 6.2 Scoring

```sql
WITH q(tag_slug, weight, polarity) AS (
  VALUES ('comforting',   1.0,  1),
         ('gently-funny', 0.4,  1),
         ('bleak',        0.8, -1)
)
SELECT m.id,
       m.title_romaji,
       SUM(mmt.intensity * mt.idf * q.weight * q.polarity) AS score
FROM q
JOIN mood_tag       mt  ON mt.slug = q.tag_slug
                       AND mt.vocabulary_id = $active_vocab
JOIN media_mood_tag mmt ON mmt.mood_tag_id = mt.id
JOIN media          m   ON m.id = mmt.media_id
WHERE m.episodes <= 13
GROUP BY m.id, m.title_romaji
ORDER BY score DESC
LIMIT 20;
```

Three multipliers, each doing distinct work:

| Term | Purpose |
|---|---|
| `mmt.intensity` | how strongly this title exhibits the mood |
| `mt.idf` | how distinctive the mood is across the catalogue |
| `q.weight` | how much the user asked for it |

`idf` is computed after enrichment as
`ln(total_media / count(media_mood_tag WHERE mood_tag_id = mt.id))`.

**Floor the document frequency.** A mood tag applied to three titles gets
enormous IDF weight, and at that frequency rarity usually means *badly
applied* rather than *highly distinctive*. Either exclude tags below a
minimum document count or cap the IDF term.

The index on `media_mood_tag(mood_tag_id)` is load-bearing: the query touches
only rows for the handful of moods named, not the full table.

Personalisation composes additively with no architectural change — the drop
signature appends negative rows to the `VALUES` list, staff affinity adds one
further term to the `SUM`.

### 6.3 Explanation

Read directly off the scoring output: the top contributing terms with their
intensity buckets. No second query, no generation.

---

## 7. Query cache

The cache is the difference between a 500ms product and a 15ms one. Three
mechanisms, organised on one principle:

> **Match structure exactly. Match meaning approximately.**

Grammar is rule-governed and cheap to compute exactly, so it is parsed.
Meaning is fuzzy and resists rules, so it is embedded. Most systems fail by
pushing both through a single mechanism.

### 7.1 Why hashing alone does not work

A cryptographic hash has the avalanche property by design: one changed
character produces an unrelated output. "Close hashes" cannot exist.

Locality-sensitive hashing (SimHash, MinHash) does produce comparable hashes
but measures *lexical* overlap. "cozy show" and "relaxing anime" share no
tokens and would be maximally distant despite being the same query.

Semantic embeddings solve vocabulary variance but fail on negation:

| Query | Meaning | Cosine similarity |
|---|---|---|
| "relaxing but not sad" | A | — |
| "relaxing and sad" | opposite of A | ~0.97 |

A naive semantic cache serves the wrong tag set with high confidence here.
The bug surfaces as bad rankings, not as a cache error, so it is expensive to
diagnose.

### 7.2 Canonicalisation

1. Lowercase, strip punctuation, collapse whitespace.
2. Expand contractions (`don't` -> `do not`) — must precede negation parsing.
3. Lemmatise.
4. Drop stopwords that carry no constraint.

`"Something relaxing, please!"` and `"i want something relaxing"` both collapse
to the same form. This is canonicalisation, not fuzzy matching: it makes exact
matching work far harder than it otherwise would.

### 7.3 Structural parsing

A dependency parse (spaCy, single-digit ms, no API call) extracts slots and
resolves negation scope. Scope resolution is the point — keyword-spotting for
"not" fails on coordinated structures:

> "relaxing but not sad or violent"

Does `not` govern both adjectives or only `sad`? Walking the parse tree from
the negation marker through the conjunction answers it; substring matching
guesses, and guesses wrong roughly half the time.

### 7.4 The composite key

```
structural_hash = sha256(
    vocabulary_version +
    sorted(constraints) +
    negation_arity +
    slot_shape
)

content vectors = embed(positive slots), embed(negated slots)
```

Structural hash must match exactly; vectors need only be close. This makes
"relaxing and sad" a guaranteed miss against "relaxing but not sad" —
different negation arity, different partition, never compared.

Because `structural_hash` partitions the cache and distinct structures are
few, each partition stays small. At the expected size (low thousands of
entries) a brute-force cosine scan within a partition beats an ANN index.
Do not build HNSW here until measurement justifies it.

### 7.5 Lookup path

```
canonicalise
     |
     v
L1  exact hash lookup ---------------- hit -> ~1ms
     | miss
     v
parse structure (confidence gated)
     |
     v
L2  same structural_hash
    AND cosine(positive) >= 0.95
    AND cosine(negated)  >= 0.95 ----- hit -> ~8ms
     | miss
     v
L3  LLM extraction ------------------- ~500ms
     |
     v
    write L1 + L2
```

Threshold rationale: retrieval systems tolerate loose matching around 0.8
because a human filters the results. A cache cannot — it substitutes an answer
without the user ever knowing. Start at 0.95, tune downward only against
logged hit-versus-click-through data.

### 7.6 Cache warming

The input space is unbounded; the output space is not. Generate paraphrases of
common mood queries offline, batch them through the LLM, populate both tiers
before any user arrives. Cold-start miss rate drops to near zero on day one.

### 7.7 Invalidation

Version-stamp every entry with extraction prompt version, model identifier,
and **vocabulary version**. The last one is easy to forget and the most
damaging to miss: enriching against a new vocabulary while serving cached
extractions from the old one produces slugs that no longer join.

### 7.8 Failure modes

| Failure | Degradation |
|---|---|
| Parse confidence low | Skip L2, go L1-or-miss |
| Embedding service down | L1 only |
| Extraction returns invalid slugs | Full-text fallback, do not cache |
| Bad extraction cached | TTL plus version stamp bounds blast radius |

Every L2 hit is logged with the original query so substitutions can be audited.

---

## 8. Performance

### 8.1 Budget

Target: p95 under 200ms, p99 under 900ms.

| Stage | L1 exact | L2 semantic | L3 miss |
|---|---|---|---|
| Canonicalise | <1ms | <1ms | <1ms |
| Hash lookup | ~1ms | ~1ms | ~1ms |
| Parse structure | — | ~4ms | ~4ms |
| Embed + scan | — | ~6ms | ~6ms |
| LLM extraction | — | — | 300–800ms |
| SQL scoring | 5–15ms | 5–15ms | 5–15ms |
| Taste model merge | 2–5ms | 2–5ms | 2–5ms |
| Explanation | ~0ms | ~0ms | ~0ms |
| **Total** | **~10ms** | **~20ms** | **~520ms** |

The design lives or dies on combined L1+L2 hit rate. 80% after warming is the
target, but it is an assumption, not a measurement — mood query distributions
may have a fatter tail than assumed. Ship L1 and measure before building L2.

Report hit rate per tier as a first-class metric, not a debug counter.

### 8.2 Import scaling

AniList rate-limits the *application*, not the user. Every concurrent import
competes for one shared budget.

- **Global token bucket in Redis**, not per-process. Per-process buckets
  collectively exceed the limit the moment you run more than one worker.
- **Fair queuing across users**, round-robin at chunk level rather than FIFO
  across whole jobs, or one 5,000-entry list starves everyone behind it.
- **Idempotent, checkpointed chunks** so a dying worker resumes rather than
  restarts.
- **Backpressure with visible queue position.** "340th in queue" beats an
  indefinite spinner.

Verify the current documented rate limit before sizing the bucket; it has been
revised downward previously.

---

## 9. Evaluation

Nothing here is asserted without a number.

**Enrichment accuracy — measure first, before anything is built on top.**
Hand-label a stratified sample of 100 titles and compare against the model's
mood tags. Report agreement.

The failure mode is systematic, not random. Community votes average out
individual mistakes; a single model mislabels *consistently* — it will have a
blind spot for, say, comedies with dark undertones, and every one of them will
be wrong the same way. Systematic error does not cancel, so sample across
strata (era, popularity, format) rather than uniformly.

**Retrieval quality.** Hand-label ~30 mood queries with expected relevant
titles; report nDCG@10 and recall@20 in CI on every scoring change.

Two honest caveats to publish alongside the numbers. Self-labelling biases
toward what the system already does, so get two or three independent labellers
and report inter-annotator agreement. And 30 queries gives wide confidence
intervals — report the interval, not just the point estimate. A smaller claim
with error bars is worth more than a larger one without.

**Cold start.** State plainly in the README that shrinkage correctly produces
near-zero affinity for users with thin histories. Better to document the limit
than let a reviewer discover it.

**Load.** k6 or Locust against seeded synthetic data (100k users, 20k titles,
~10M list events). Publish the latency curve *and the breaking point*, with
what the next step would be and why it has not been taken.

---

## 10. Alternatives considered and rejected

**AniList tags as the primary matching layer.** The original design. Rejected:
the vocabulary is content-descriptive, not affective — there is no `melancholy`
tag to match against. Retained as enrichment input and hard filters, where it
is genuinely better than anything derived.

**Free-form LLM tags without a fixed vocabulary.** Simpler, no manual
consolidation pass. Rejected: drift produces synonym families that break
matching between the query and catalogue sides, and makes IDF meaningless.
The manual pass in §4.1 is the cost of a usable schema.

**Asynchronous query path.** Queue the search, extract in a worker, emit an
event, notify on completion. Rejected: the operation completes in ~10ms cached
and under 900ms uncached, so notification delivery costs more than the work it
reports. The pattern is correct for import, where duration is minutes, and is
used there. Applying it uniformly would mean no threshold was reasoned about.

**Managed hybrid search (Weaviate, Elasticsearch, Vespa).** All support hybrid
retrieval and reranking natively and would work. Rejected for v1 because the
differentiator is the enrichment vocabulary and per-user taste model, which no
engine provides — adopting one removes the latency-engineering work without
removing the data modelling work.

**Dedicated vector database.** The catalogue is ~20k entries. pgvector with
HNSW is sufficient, and one Postgres for relational data, tags, full-text
search, and vectors removes a class of consistency problems.

**LLM reranking in the request path.** Improves top-5 precision but
reintroduces third-party latency into the critical path. If adopted, run it
offline over common queries and cache the ordering.

**Groundedness / hallucination checking.** Not applicable at request time. The
system reports computed values rather than generating claims. The place
hallucination actually matters is enrichment, and it is handled there by
measurement (§9) rather than by runtime verification.

---

## 11. Build order

Each phase is demonstrable on its own. Phases 1–5 are a complete, defensible
project; 6 onward are optional.

1. **Catalogue ingest.** Resumable, checkpointed, rate-limited. No users.
   Franchise resolution via union-find.
2. **Vocabulary construction.** Sample 2,000 titles, free generation,
   consolidate by hand to 100–200 tags with written definitions. Freeze and
   version it.
3. **Full enrichment + accuracy measurement.** Batch the catalogue against the
   frozen vocabulary. Hand-check 100 stratified titles and publish the number.
   **If accuracy is poor, stop here** — nothing downstream recovers from bad
   labels.
4. **Mood search.** Extraction plus the scoring query from §6. No cache, no
   vectors, no personalisation. Measure nDCG — this is the baseline every
   later number is reported against.
5. **Cache, tier by tier.** L1 first; record hit rate before building anything
   else. If canonicalisation plus exact hashing reaches 80%, L2 buys little
   and the parser dependency is not worth carrying.
6. **Users and import.** Auth, job queue, token bucket, fair scheduling, event
   log, notification on completion. Seed 2–3 demo personas with rich histories
   so visitors without accounts see the personalised version.
7. **Taste model.** Drop signature and staff affinity with shrinkage.
8. **Dense arm.** pgvector embeddings of vibe documents, RRF fusion. Report the
   nDCG delta against phase 4.
9. **Load testing.** Synthetic data, latency curves, documented breaking point.

---

## 12. Open questions

Resolve before phase 2.

- **Does the AniList API expose tag vote counts?** If not, an 88% from five
  voters is indistinguishable from an 88% from five hundred, and enrichment
  input for obscure titles is noisier than it appears. May require a
  popularity floor on enrichment input.
- **Terms of service on bulk catalogue caching.** Fine for a local portfolio
  project; verify before hosting anything public.
- **Enrichment cost at full catalogue scale.** Price the batch run before
  committing to a model tier.
