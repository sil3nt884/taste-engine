export type MediaListStatus =
    | 'CURRENT'
    | 'PLANNING'
    | 'COMPLETED'
    | 'DROPPED'
    | 'PAUSED'
    | 'REPEATING';

export interface MediaTitle {
    userPreferred: string;
    romaji: string | null;
    english: string | null;
}

export interface MediaCoverImage {
    extraLarge: string | null;
    large: string | null;
    medium: string | null;
}

export interface MediaTag {
    name: string;
    rank: number | null;
    isMediaSpoiler: boolean;
}

export interface MediaStartDate {
    year: number | null;
}

export interface ListMedia {
    id: number;
    title: MediaTitle;
    coverImage: MediaCoverImage;
    bannerImage: string | null;
    genres: string[];
    tags: MediaTag[];
    averageScore: number | null;
    popularity: number | null;
    format: string | null;
    episodes: number | null;
    startDate: MediaStartDate;
}

export interface MediaListEntry {
    media: ListMedia;
}

export interface MediaListGroup {
    name: string;
    entries: MediaListEntry[];
}

export interface MediaListCollectionResponse {
    MediaListCollection: {
        lists: MediaListGroup[];
    };
}

export interface JwtPayload {
    sub: string;
    username: string;
    iat: number;
    exp: number;
}

export interface EmbedRow {
    id: string;
    title_romaji: string | null;
    title_english: string | null;
    synopsis: string | null;
    genres: string | null;
    tags: string | null;
}


export interface AniListTag {
    name: string;
    rank: number | null;
    isMediaSpoiler: boolean;
    category: string | null;
    isAdult: boolean | null;
}

export interface AniListRelationEdge {
    relationType: string | null;
    node: { id: number; type: string | null } | null;
}

export interface AniListMedia {
    id: number;
    idMal: number | null;
    title: { romaji: string | null; english: string | null };
    format: string | null;
    status: string | null;
    episodes: number | null;
    season: string | null;
    seasonYear: number | null;
    averageScore: number | null;
    popularity: number | null;
    description: string | null;
    source: string | null;
    isAdult: boolean | null;
    genres: string[];
    tags: AniListTag[];
    relations: { edges: AniListRelationEdge[] } | null;
}

export interface PageResponse {
    Page: {
        pageInfo: { hasNextPage: boolean; currentPage: number; lastPage: number };
        media: AniListMedia[];
    };
}

export interface MoodTag {
  slug: string;
  intensity: number;
}

export interface VocabEntry { slug: string; label: string; definition: string }
export interface Suggestion extends VocabEntry { frequency: number }

export interface MediaRow {
  id: string;
  title_romaji: string | null;
  format: string | null;
  episodes: number | null;
  synopsis: string | null;
  community_tags: string | null;
}

export interface EmbedCounters { ok: number; skipped: number; failed: number }
export interface EnrichCounters {
  ok: number; failed: number; skipped: number; invalidSlugs: number; suggested: number;
}

export interface Canonical {
  form: string;
  tokens: string[];
  hasNegation: boolean;
}

export interface ParsedStructure {
  positive: string[];
  negated: string[];
  negationArity: number;
  hasNegation: boolean;
  constraints: { max_episodes?: number };
  confidence: number;
}

export interface ExtractionTerm { slug: string; weight: number }
export interface Extraction {
  positive: ExtractionTerm[];
  negative: ExtractionTerm[];
  filters: { max_episodes?: number };
}

export interface TasteTerm { slug: string; weight: number }

export interface SearchResult {
  media_id: string;
  title: string | null;
  description: string;
  why: string;
}

export interface Recommendation {
  media_id: string;
  title: string;
  description: string;
  why: string;
}

export interface SearchResponse {
  source: 'l1-cache' | 'l2-cache' | 'model';
  extraction: Extraction | null;
  results: SearchResult[];
  recommendations: Recommendation[];
}

export interface WhyTarget {
  media_id: string;
  title: string | null;
  description: string;
  why: string;
}

export interface CatalogDoc {
  id: string;
  title: string;
  title_romaji: string | null;
  title_english: string | null;
  synopsis: string;
  genres: string[];
  tags: string[];
  format: string | null;
  episodes: number | null;
  popularity: number | null;
  avg_score: number | null;
  is_adult: boolean;
}

export interface ListItem {
  media_id: string;
  coverImage: string | null;
  title: string | null;
  episodes: number | null;
  avgScore: number | null;
  userScore: number | null;
}

export interface RelationEdge { from: number; to: number; type: string }
export interface FranchiseRow {
  id: string;
  anilist_id: number;
  season_year: number | null;
  popularity: number | null;
  format: string | null;
}

export interface JikanPage {
  data: Array<{ entry: { mal_id: number } }>;
  pagination?: { has_next_page?: boolean };
}

export interface MalImportResult {
  userId: string;
  completed: number;
  planning: number;
  matchedCompleted: number;
  matchedPlanning: number;
}

export interface DebeziumPayload {
  op?: 'create' | 'update' | 'delete' | 'read';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

export type JsonSchema = Record<string, unknown>;