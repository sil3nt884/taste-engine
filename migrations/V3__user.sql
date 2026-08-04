-- User identity, list snapshot, and derived taste model.
--
-- DESIGN.md §5.3 models history as an append-only `list_event` log. A one-shot
-- AniList import only gives us the CURRENT snapshot (status + maybe score), not
-- the temporal events, so this cut stores `list_entry` directly — the design's
-- "materialised view" is here the source of truth. When we add incremental
-- refresh, `list_event` becomes the log and this becomes a view over it.

CREATE TABLE IF NOT EXISTS user_account (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anilist_name text UNIQUE NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS list_entry (
  user_id    bigint NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  media_id   bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  status     text NOT NULL,   -- COMPLETED | PLANNING | CURRENT | PAUSED | DROPPED | REPEATING
  score      integer,         -- the user's own score, 0-100; NULL when unknown
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id)
);

CREATE INDEX IF NOT EXISTS list_entry_user_idx ON list_entry (user_id, status);

-- Derived per-user taste (DESIGN.md §5.4), rebuilt on import.
--
-- Rough first pass: we have no per-title scores yet, so mean_score /
-- score_stddev / drop_signature / staff_affinity stay NULL, and taste is the
-- `mood_affinity` vector — the mood tags of what the user has completed,
-- normalised. This is the honest cold-start model: thin histories yield a
-- near-empty affinity (§9), which composes additively at query time (§6.2).
CREATE TABLE IF NOT EXISTS user_taste (
  user_id        bigint PRIMARY KEY REFERENCES user_account(id) ON DELETE CASCADE,
  vocabulary_id  bigint NOT NULL REFERENCES vocabulary(id),
  mean_score     double precision,
  score_stddev   double precision,
  mood_affinity  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- mood slug -> weight 0..1
  drop_signature jsonb NOT NULL DEFAULT '{}'::jsonb,   -- reserved (§5.4)
  staff_affinity jsonb NOT NULL DEFAULT '{}'::jsonb,   -- reserved (§5.4)
  completed_count integer NOT NULL DEFAULT 0,
  computed_at    timestamptz NOT NULL DEFAULT now()
);
