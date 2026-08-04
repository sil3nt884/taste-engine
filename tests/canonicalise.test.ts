import { describe, it, expect } from 'vitest';
import { canonicalise } from '../src/search/canonicalise.js';
import { parseStructure, structuralHash } from '../src/search/structure.js';

describe('canonicalise', () => {
  it('collapses surface variation to the same form', () => {
    const a = canonicalise('Something relaxing, please!');
    const b = canonicalise('i want something relaxing');
    expect(a.form).toBe(b.form);
  });

  it('expands contractions before negation is read', () => {
    expect(canonicalise("don't make it sad").tokens).toContain('not');
  });

  it('keeps negation words out of the stopword list', () => {
    expect(canonicalise('relaxing but not sad').hasNegation).toBe(true);
  });
});

describe('structural key', () => {
  it('separates opposite polarity into different partitions', () => {
    const a = parseStructure('relaxing but not sad');
    const b = parseStructure('relaxing and sad');
    expect(structuralHash(a, 1, 1)).not.toBe(structuralHash(b, 1, 1));
  });

  it('gives the same partition regardless of clause order', () => {
    const a = parseStructure('relaxing but not sad');
    const b = parseStructure('not sad but relaxing');
    expect(structuralHash(a, 1, 1)).toBe(structuralHash(b, 1, 1));
  });

  it('reports low confidence on multiply-negated queries', () => {
    const q = parseStructure('not sad not violent not bleak and not slow');
    expect(q.confidence).toBeLessThan(0.7);
  });

  it('extracts episode constraints', () => {
    expect(parseStructure('relaxing under 13 episodes').constraints.max_episodes).toBe(13);
  });
});
