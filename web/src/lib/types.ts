export type ListName = 'watched' | 'planning';

export interface Recommendation {
  media_id: string;
  title: string;
  description: string;
  why: string;
}

export interface MoodSearchState {
  query: string;
  recs: Recommendation[];
  error: string | null;
  submitted: boolean;
}

export const initialMoodSearch: MoodSearchState = {
  query: '',
  recs: [],
  error: null,
  submitted: false,
};

export interface ListItem {
  media_id: string;
  coverImage: string | null;
  title: string | null;
  episodes: number | null;
  avgScore: number | null;
  userScore: number | null;
}

export interface Lists {
  watched: ListItem[];
  planning: ListItem[];
}

export interface WhyResult {
  media_id: string;
  why: string;
}

export interface CatalogItem {
  media_id: string;
  anilistId?: number | null;
  coverImage?: string | null;
  title: string | null;
  description: string;
  format: string | null;
  episodes: number | null;
  seasonYear?: number | null;
  avgScore: number | null;
  popularity: number | null;
}

export interface MediaDetail extends CatalogItem {
  anilistId: number;
  titleEnglish: string | null;
  titleRomaji: string | null;
  status: string | null;
  season: string | null;
}

export interface MediaPage {
  total: number;
  limit: number;
  offset: number;
  results: CatalogItem[];
}

export interface CatalogSearchResponse {
  total: number;
  results: CatalogItem[];
}
