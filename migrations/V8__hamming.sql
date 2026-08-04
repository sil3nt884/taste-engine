-- Hamming distance between two 64-bit SimHashes stored as signed bigint
-- (media_enrichment.mood_simhash and the query's mood_simhash). XOR the two,
-- reinterpret the bit pattern as a 64-bit string, and count the set bits. Small
-- distance = similar mood. IMMUTABLE so the planner can use it freely.
CREATE OR REPLACE FUNCTION hamming64(a bigint, b bigint) RETURNS integer AS $$
  SELECT length(translate((a # b)::bit(64)::text, '0', ''));
$$ LANGUAGE sql IMMUTABLE;
