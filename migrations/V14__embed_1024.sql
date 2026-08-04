-- Switch the semantic layer to mxbai-embed-large (1024-dim) for stronger retrieval.
-- The old 768-dim nomic vectors can't be cast to the new width (and the model
-- changed anyway), so clear the table and widen the column; re-embed afterwards
-- with `npm run embed:catalogue` (needs `ollama pull mxbai-embed-large`).
DELETE FROM media_embedding;
ALTER TABLE media_embedding ALTER COLUMN embedding TYPE vector(1024);
