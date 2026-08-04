-- Store the hash of the AI-produced mood extraction alongside the query hash
-- (DESIGN.md §7.5). `cache_key` already fingerprints the canonical *query*;
-- `mood_hash` fingerprints what the model *extracted* from it — the sorted,
-- weight-bucketed (slug, polarity) set. Two different phrasings that extract to
-- the same moods share a mood_hash, which makes it the query-side counterpart
-- of media_enrichment.mood_signature and the grouping key for reused results.
ALTER TABLE query_cache ADD COLUMN IF NOT EXISTS mood_hash text;

CREATE INDEX IF NOT EXISTS query_cache_mood_hash_idx ON query_cache (mood_hash);
