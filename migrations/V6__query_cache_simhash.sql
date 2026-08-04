-- Perceptual hash of the query's extracted mood set (DESIGN.md §7). `mood_hash`
-- is an EXACT sha256 — great for "identical meaning", useless for "similar".
-- `mood_simhash` is a 64-bit Charikar SimHash over the positive mood slugs, so
-- Hamming distance ≈ mood distance: "i want a sad anime" and "something that
-- makes me cry" differ in only a few bits. This is the query-side counterpart of
-- media_enrichment.mood_simhash, so query-feel and title-feel live in the same
-- space and can be compared with a bit-count.
ALTER TABLE query_cache ADD COLUMN IF NOT EXISTS mood_simhash bigint;

CREATE INDEX IF NOT EXISTS query_cache_mood_simhash_idx ON query_cache (mood_simhash);
