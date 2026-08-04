import type { Canonical } from '../types';

export const NEGATION = new Set(['not', 'no', 'never', 'without', 'nor', 'cannot']);

const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'you', 'a', 'an', 'the', 'some', 'something', 'anything',
  'please', 'want', 'wanna', 'looking', 'look', 'for', 'to', 'of', 'in', 'on', 'at',
  'that', 'this', 'it', 'its', 'is', 'am', 'are', 'be', 'been', 'would', 'will',
  'have', 'has', 'had', 'do', 'does', 'did', 'make', 'makes', 'made', 'show', 'shows',
  'anime', 'series', 'watch', 'watching', 'give', 'find', 'recommend', 'recommendation',
  'mood', 'feel', 'feeling', 'like', 'kind', 'sort', 'with', 'and', 'or', 'but', 'so',
  'get', 'me', 'about', 'really', 'very', 'quite', 'bit', 'little',
]);

const LEMMA: Record<string, string> = {
  episodes: 'episode', eps: 'episode', ep: 'episode',
  movies: 'movie', films: 'film', comedies: 'comedy',
};

function expandContractions(text: string): string {
  return text
    .replace(/\bwon['’]t\b/g, 'will not')
    .replace(/\bcan['’]t\b/g, 'can not')
    .replace(/\bshan['’]t\b/g, 'shall not')
    .replace(/n['’]t\b/g, ' not')
    .replace(/['’]re\b/g, ' are')
    .replace(/['’]m\b/g, ' am')
    .replace(/['’]ll\b/g, ' will')
    .replace(/['’]ve\b/g, ' have')
    .replace(/['’]d\b/g, ' would')
    .replace(/['’]s\b/g, ' is');
}

const lemma = (word: string): string => LEMMA[word] ?? word;

export function canonicalise(query: string): Canonical {
  const expanded = expandContractions(query.toLowerCase());
  const words = expanded
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(lemma);

  const tokens = words.filter((word) => NEGATION.has(word) || !STOPWORDS.has(word));

  const form = [...tokens].sort().join(' ');
  const hasNegation = tokens.some((token) => NEGATION.has(token));
  return { form, tokens, hasNegation };
}
