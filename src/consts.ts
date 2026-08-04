import {config} from "./config";

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co' as const;
export const KEYLEN = 64 as const
export const CHUNK_CHARS = 1000 as const
export const OLLAMA_HOST = `${config.OLLAMA_HOST}/api/embeddings` as const;
export const ANILIST_PER_PAGE = 50 as const
// AniList refuses pagination past 5000 entries (returns a 400), even though it
// keeps reporting hasNextPage. Stop before crossing it.
export const ANILIST_MAX_ENTRIES = 5000 as const

export const JIKAN_ENDPOINT = 'https://api.jikan.moe/v4' as const;
export const MEILI_INDEX = 'media' as const;

// Fetch resilience.
export const COVER_FAILURE_COOLDOWN_MS = 60_000 as const;

export const MIN_DF = 5 as const;                         // IDF document-frequency floor (score.ts)

// Scoring / personalisation (query.ts).
export const MIN_AVG_SCORE = 60 as const;                 // quality gate
export const PERSONALISATION = 0.3 as const;              // taste nudge, relative to the query
export const TASTE_WEIGHT = Number((0.06 * PERSONALISATION).toFixed(4)); // 0.018 per matched affinity mood

// L2 semantic cache thresholds (query.ts, §7.5).
export const L2_SIMILARITY = 0.9 as const;
export const L2_MIN_CONFIDENCE = 0.7 as const;