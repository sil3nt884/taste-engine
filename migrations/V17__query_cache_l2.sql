-- L2 semantic query cache (DESIGN.md §7.4–7.5) + mood-slug embeddings (E).
--
-- F (skip the LLM on similar queries): store the query's positive/negated SLOT
-- embeddings so a later query in the same structural partition can reuse this
-- extraction when its slots are cosine-close. `structural_hash` is now the
-- partition (negation arity + hard filters), matched exactly; slots are matched
-- approximately. An index on it keeps the per-partition cosine scan small.
--
-- E (same-feel validation + cache inspection): store an embedding per mood slug
-- and the extraction's mood centroid, so "cathartic/sad/tearjerker" cluster and
-- "romantic" stays an outlier.

ALTER TABLE mood_tag
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

ALTER TABLE query_cache
  ADD COLUMN IF NOT EXISTS positive_embedding vector(1024),
  ADD COLUMN IF NOT EXISTS negated_embedding  vector(1024),
  ADD COLUMN IF NOT EXISTS mood_embedding     vector(1024);

CREATE INDEX IF NOT EXISTS query_cache_structural_idx
  ON query_cache (structural_hash, vocabulary_id);
