-- Drop the now write-only mood SimHash + exact mood-signature. Nothing reads
-- them any more: the mood-hash scorer that used them was removed (search is
-- hybrid-only), and cache "same-feel" clustering moved to mood_embedding (a
-- semantic centroid), which is less brittle than a lexical SimHash. mood_hash
-- (the exact extraction hash, why-cache key) is kept.
DROP INDEX IF EXISTS media_enrichment_simhash_idx;
ALTER TABLE media_enrichment DROP COLUMN IF EXISTS mood_simhash;
ALTER TABLE media_enrichment DROP COLUMN IF EXISTS mood_signature;

DROP INDEX IF EXISTS query_cache_mood_simhash_idx;
ALTER TABLE query_cache DROP COLUMN IF EXISTS mood_simhash;
