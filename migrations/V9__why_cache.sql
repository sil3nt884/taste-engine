-- Cache for AI-written recommendation reasons ("why"). Keyed by the query's
-- mood hash (the normalised intent) + the title, so the same reason is reused
-- across users and phrasings that resolve to the same moods — the model only
-- writes a reason once per (intent, title).
CREATE TABLE IF NOT EXISTS why_cache (
  mood_hash  text   NOT NULL,
  media_id   bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  why        text   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mood_hash, media_id)
);
