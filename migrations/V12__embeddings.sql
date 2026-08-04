-- Semantic layer (the "5,000+ words" answer). Instead of matching discrete mood
-- slugs, embed each title's mood/description into a vector and match queries by
-- cosine similarity — a continuous space that covers effectively unlimited
-- vocabulary, where synonyms sit near each other. Requires the pgvector extension.
CREATE EXTENSION IF NOT EXISTS vector;

-- nomic-embed-text = 768 dims. A different model (e.g. mxbai-embed-large = 1024)
-- needs a different column width, hence model_id is part of the key.
CREATE TABLE IF NOT EXISTS media_embedding (
  media_id   bigint NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  model_id   text   NOT NULL,
  embedding  vector(768) NOT NULL,
  input_hash text   NOT NULL,            -- idempotency: skip re-embed if input unchanged
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, model_id)
);

-- No ANN index yet: a few thousand rows cosine-scan in single-digit ms. Add an
-- HNSW index once the catalogue is much larger:
--   CREATE INDEX ON media_embedding USING hnsw (embedding vector_cosine_ops);
