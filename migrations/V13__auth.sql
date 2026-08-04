-- Auth + external identities on user_account. Until now a user was just an
-- AniList handle (import-only). Add real accounts: username/password/email, plus
-- MAL identity, with 1-to-1 uniqueness across username/email/mal/anilist.
ALTER TABLE user_account
  ADD COLUMN IF NOT EXISTS username      text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS mal_name      text;

-- anilist_name was NOT NULL (import-only users); it's optional at signup now.
ALTER TABLE user_account ALTER COLUMN anilist_name DROP NOT NULL;

-- Case-insensitive uniqueness, partial so multiple NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS user_account_username_uidx ON user_account (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_account_email_uidx    ON user_account (lower(email))    WHERE email    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_account_mal_uidx      ON user_account (lower(mal_name)) WHERE mal_name IS NOT NULL;
-- anilist_name already carries a UNIQUE constraint from V3 (NULLs are distinct).

-- MyAnimeList id on media, to resolve MAL imports to our catalogue. Populated
-- from AniList's idMal on the next ingest; NULL until then.
ALTER TABLE media ADD COLUMN IF NOT EXISTS mal_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS media_mal_id_uidx ON media (mal_id) WHERE mal_id IS NOT NULL;
