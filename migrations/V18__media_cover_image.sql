-- Cache the AniList cover-image URL per title. Fetched once (lazily on read or
-- via `npm run covers:backfill`) and stored, so the frontend is served the URL
-- in the payload and we never refetch AniList on every request.
ALTER TABLE media ADD COLUMN IF NOT EXISTS cover_image text;
