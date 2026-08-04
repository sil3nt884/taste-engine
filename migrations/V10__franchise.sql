-- Franchise resolution (DESIGN.md §5.2). AniList relations between titles, plus
-- each title's resolved "franchise root" (entry-point series). Search collapses a
-- franchise to that root so a sequel/continuation film surfaces as the series to
-- start, not the sequel itself.

-- Relations stored by anilist_id so an edge to a title not yet ingested still
-- records (resolution just ignores edges whose endpoints aren't in the catalogue).
CREATE TABLE IF NOT EXISTS media_relation (
  from_anilist_id integer NOT NULL,
  to_anilist_id   integer NOT NULL,
  relation_type   text    NOT NULL,   -- PREQUEL | SEQUEL | PARENT | SIDE_STORY | ...
  PRIMARY KEY (from_anilist_id, to_anilist_id, relation_type)
);

CREATE INDEX IF NOT EXISTS media_relation_from_idx ON media_relation (from_anilist_id);

-- Resolved entry-point of each title's franchise. NULL until resolved; a
-- standalone title resolves to itself. Recomputed by resolveFranchiseRoots().
ALTER TABLE media ADD COLUMN IF NOT EXISTS franchise_root_id bigint
  REFERENCES media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_franchise_root_idx ON media (franchise_root_id);
