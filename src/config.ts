import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  JWT_SECRET: z.string().min(1),
  JWT_TTL_SECONDS: z.coerce.number().default(7 * 24 * 3600),
  ACTIVE_VOCABULARY_VERSION: z.coerce.number().default(2),
  BASE_VOCABULARY_VERSION: z.coerce.number().default(2),
  ANILIST_RATE_PER_MIN: z.coerce.number().default(30),
  OLLAMA_HOST:  z.url().default('http://localhost:11434'),
  OLLAMA_TOKEN: z.string().default(''),   // bearer for a reverse proxy in front of Ollama (home/DDNS)
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  EXPLAIN_MODEL: z.string().default('llama3.2:3b'),
  EMBED_MODEL: z.string().default('mxbai-embed-large'),
  ENRICH_CONCURRENCY: z.coerce.number().default(3),
  MEILI_HOST: z.url().default('http://localhost:7700'),
  MEILI_KEY: z.string().default('masterKeyChangeMe'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  CDC_TOPIC_PREFIX: z.string().default('taste'),
});

export const config = schema.parse(process.env);

if (config.JWT_SECRET && config.JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is weak or default — use a strong random 32+ char secret before production.');
}

export const LOCAL_MODEL_ID = `ollama:${config.OLLAMA_MODEL}`;
export const EMBED_MODEL_ID = `ollama:${config.EMBED_MODEL}`;
export const PROMPT_VERSION = 4;
