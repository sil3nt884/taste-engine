-- Catalogue + enrichment schema. See DESIGN.md §5.2.
-- Franchise/relation resolution (§5.2) is intentionally deferred — this cut
-- backfills the metadata (title, genre, community tags) and the derived mood
-- layer, which is what the enrichment pipeline needs.

-- ---------------------------------------------------------------------------
-- Catalogue (global, shared by all users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS media (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anilist_id   integer UNIQUE NOT NULL,
  title_romaji  text,
  title_english text,
  format       text,
  status       text,
  episodes     integer,
  season       text,
  season_year  integer,
  avg_score    integer,
  popularity   integer,
  synopsis     text,
  source       text,
  is_adult     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- AniList "genres" are a small closed set of coarse strings (Action, Slice of
-- Life, ...). Kept distinct from community `tag`s, which are fine-grained and
-- vote-ranked.
CREATE TABLE IF NOT EXISTS genre (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS media_genre (
  media_id bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  genre_id bigint NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, genre_id)
);

-- Community-ranked content tags. AniList exposes these by name (no stable id
-- in the media query), so name is the natural key.
CREATE TABLE IF NOT EXISTS tag (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name     text UNIQUE NOT NULL,
  category text,
  is_adult boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS media_tag (
  media_id   bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  tag_id     bigint NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  rank       integer,
  is_spoiler boolean NOT NULL DEFAULT false,
  PRIMARY KEY (media_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Controlled mood vocabulary + derived mood layer (§5.1, §5.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vocabulary (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version    integer UNIQUE NOT NULL,
  model_id   text NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  frozen_at  timestamptz
);

CREATE TABLE IF NOT EXISTS mood_tag (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vocabulary_id bigint NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  label         text NOT NULL,
  definition    text NOT NULL,
  idf           double precision NOT NULL DEFAULT 0,  -- recomputed post-enrichment, §6.2
  UNIQUE (vocabulary_id, slug)
);

CREATE TABLE IF NOT EXISTS media_mood_tag (
  media_id      bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  mood_tag_id   bigint NOT NULL REFERENCES mood_tag(id) ON DELETE CASCADE,
  intensity     double precision NOT NULL,  -- 1.0 / 0.6 / 0.3, §5.2
  vocabulary_id bigint NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, mood_tag_id)
);

-- Load-bearing: the scoring query touches only rows for the named moods (§6.2).
CREATE INDEX IF NOT EXISTS media_mood_tag_mood_idx ON media_mood_tag (mood_tag_id);

-- Per-title enrichment record: the idempotency fingerprint + the two mood
-- hashes. Versioned by vocabulary so a re-freeze re-enriches cleanly.
CREATE TABLE IF NOT EXISTS media_enrichment (
  media_id       bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  vocabulary_id  bigint NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
  model_id       text NOT NULL,
  input_hash     text NOT NULL,          -- fingerprint of the prompt input; skip re-run if unchanged
  mood_simhash   bigint,                 -- 64-bit perceptual hash of the mood set (Hamming ≈ mood distance)
  mood_signature text,                   -- sha256 of the sorted (slug,bucket) set: exact "same mood profile"
  enriched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, vocabulary_id)
);

CREATE INDEX IF NOT EXISTS media_enrichment_simhash_idx ON media_enrichment (mood_simhash);

-- Bookkeeping for a batch/backfill run (resumable, auditable).
CREATE TABLE IF NOT EXISTS enrichment_run (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vocabulary_id bigint NOT NULL REFERENCES vocabulary(id),
  model_id      text NOT NULL,
  media_count   integer NOT NULL DEFAULT 0,
  ok            integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0,
  invalid_slugs integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'running',
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
