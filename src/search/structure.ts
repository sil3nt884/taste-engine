import { createHash } from 'node:crypto';
import { NEGATION } from './canonicalise.js';
import type { ParsedStructure } from '../types';

const CONJ_FLIP = new Set(['but', 'however', 'yet', 'except']);
const CONJ_KEEP = new Set(['and', 'or', 'nor']);
const FILLER = new Set([
  'i', 'me', 'my', 'we', 'you', 'a', 'an', 'the', 'some', 'something', 'anything',
  'please', 'want', 'wanna', 'looking', 'look', 'for', 'to', 'of', 'in', 'on', 'at',
  'that', 'this', 'it', 'is', 'am', 'are', 'be', 'would', 'will', 'have', 'has', 'do',
  'make', 'show', 'shows', 'anime', 'series', 'watch', 'give', 'find', 'recommend',
  'mood', 'feel', 'feeling', 'like', 'kind', 'sort', 'with', 'so', 'really', 'very',
  'under', 'below', 'over', 'above', 'less', 'fewer', 'more', 'than', 'most', 'least',
  'episode', 'episodes', 'ep', 'eps', 'or',
]);

function parseEpisodeLimit(text: string): number | undefined {
  const upper =
    /\b(?:under|below|less than|fewer than|at most|no more than|shorter than|max|<=?)\s*(\d+)/.exec(text);
  if (upper) return Number(upper[1]);
  const suffix = /\b(\d+)\s*(?:episodes?|eps?)\s*(?:or (?:less|fewer))\b/.exec(text);
  if (suffix) return Number(suffix[1]);
  return undefined;
}

export function parseStructure(query: string): ParsedStructure {
  const lowered = query.toLowerCase();
  const words = lowered
    .replace(/\bn['’]t\b/g, ' not')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const positive: string[] = [];
  const negated: string[] = [];
  let negateScope = false;
  let negationArity = 0;

  for (const word of words) {
    if (NEGATION.has(word)) { negateScope = true; negationArity++; continue; }
    if (CONJ_FLIP.has(word)) { negateScope = false; continue; }
    if (CONJ_KEEP.has(word)) { continue; }
    if (FILLER.has(word) || /^\d+$/.test(word)) continue;
    (negateScope ? negated : positive).push(word);
  }

  const constraints: { max_episodes?: number } = {};
  const maxEp = parseEpisodeLimit(lowered);
  if (maxEp !== undefined) constraints.max_episodes = maxEp;

  let confidence = 1 - 0.2 * Math.max(0, negationArity - 1);
  if (negationArity > 0 && negated.length === 0) confidence -= 0.2;
  confidence = Math.max(0.1, Math.min(1, confidence));

  return {
    positive,
    negated,
    negationArity,
    hasNegation: negationArity > 0,
    constraints,
    confidence,
  };
}

export function structuralHash(
  structure: ParsedStructure,
  vocabularyVersion: number,
  promptVersion = 1,
): string {
  return createHash('sha256')
    .update(
      [
        `v${vocabularyVersion}`,
        `p${promptVersion}`,
        `arity:${structure.negationArity}`,
        `pos:${structure.positive.length > 0 ? 1 : 0}`,
        `neg:${structure.negated.length > 0 ? 1 : 0}`,
        `ep:${structure.constraints.max_episodes ?? ''}`,
      ].join('␟'),
    )
    .digest('hex');
}
