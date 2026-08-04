-- Backs GET /media browsing + pagination: ORDER BY popularity DESC NULLS LAST, id
-- with LIMIT/OFFSET. The composite matches the sort so Postgres can walk the index
-- instead of sorting the whole table per page.
CREATE INDEX IF NOT EXISTS media_browse_idx ON media (popularity DESC NULLS LAST, id);
