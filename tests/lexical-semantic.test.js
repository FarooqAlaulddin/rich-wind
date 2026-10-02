import { describe, it, expect, beforeAll } from 'vitest';
import { loadFullCatalog } from '../lexical-demo/src/search/catalogStore.js';
import { blockedWords, rank, cosine, nearest, resetSemanticForTests, MIN_SCORE, TOP } from '../lexical-demo/src/search/semantic.js';

beforeAll(async () => { await loadFullCatalog(); });

describe('semantic guards and ranking', () => {
  it('blocks direction, negation and undo utterances', () => {
    for (const q of ['bigger', 'remove the shadow', 'undo that', 'too big', 'soften the edges less']) expect(blockedWords(q)).toBe(true);
    expect(blockedWords('zen vibes')).toBe(false);
  });
  it('rank returns top 2 distinct ids above the cutoff', () => {
    const idx = [
      { id: 'a', phrase: 'p1', vec: [1, 0] }, { id: 'a', phrase: 'p2', vec: [0.9, 0.43] },
      { id: 'b', phrase: 'p3', vec: [0.8, 0.6] }, { id: 'c', phrase: 'p4', vec: [0, 1] }, { id: 'd', phrase: 'p5', vec: [0.7, 0.71] },
    ];
    const r = rank([1, 0], idx);
    expect(r.length).toBeLessThanOrEqual(TOP);
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(rank([0, 1], [{ id: 'z', phrase: 'z', vec: [1, 0] }])).toEqual([]);
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(MIN_SCORE).toBeGreaterThan(0);
  });
  it('resolves nothing for blocked queries without loading anything', async () => {
    resetSemanticForTests();
    expect(await nearest('make it bigger')).toEqual([]);
  });
});
