-- L1 query cache (DESIGN.md §7.5). Maps a canonicalised query to the mood
-- extraction it produced, so a repeat query skips the model entirely.
--
-- The row is keyed by an EXACT hash of the canonical form. `structural_hash`
-- (the negation-safe partition, §7.4) is stored for the future L2 semantic
-- tier but is not the primary key here. Everything is version-stamped:
-- serving an extraction against a newer vocabulary produces slugs that no
-- longer join (§7.7), so vocabulary_id + prompt_version bound the blast radius.
CREATE TABLE IF NOT EXISTS query_cache (
  cache_key       text PRIMARY KEY,              -- sha256(canonical form + vocab + prompt)
  canonical       text NOT NULL,
  structural_hash text NOT NULL,                 -- negation-safe partition (§7.4)
  vocabulary_id   bigint NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  prompt_version  integer NOT NULL,
  model_id        text NOT NULL,
  extraction      jsonb NOT NULL,                -- {positive:[{slug,weight}],negative:[...],filters:{}}
  hits            integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_cache_structural_idx ON query_cache (structural_hash);
