-- Vocabulary suggestions surfaced BY enrichment (DESIGN.md §4.1 feedback loop).
-- When the model labels a title and hits a STRONG feeling the frozen vocabulary
-- can't express, it proposes a new tone here. It never edits the live vocabulary
-- — that would break the frozen per-version invariant and let synonyms creep in.
-- Suggestions accumulate with a frequency; the frequent, distinct ones are later
-- folded into a NEW vocabulary version (deduped against the seed) and re-enriched.
CREATE TABLE IF NOT EXISTS vocab_suggestion (
  slug             text PRIMARY KEY,
  label            text NOT NULL,
  definition       text NOT NULL,
  frequency        integer NOT NULL DEFAULT 1,   -- how many titles wanted it
  base_version     integer NOT NULL,             -- vocabulary version it was suggested against
  example_media_id bigint REFERENCES media(id) ON DELETE SET NULL,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocab_suggestion_freq_idx ON vocab_suggestion (base_version, frequency DESC);
