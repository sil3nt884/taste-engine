-- The hamming64 SQL function only served the mood-hash scorer (removed: search
-- is hybrid-only) over media_enrichment.mood_simhash / query_cache.mood_simhash
-- (dropped in V19). Nothing references it any more.
DROP FUNCTION IF EXISTS hamming64(bigint, bigint);
