import { describe, it, expect, beforeAll } from 'vitest';
import { loadFullCatalog } from '../lexical-demo/src/search/catalogStore.js';
import { repairVariation, repairAll, aliasOf, splitItems, editDistance } from '../lexical-demo/src/ai/repair.js';
import { repairContext } from '../lexical-demo/src/ai/context.js';

beforeAll(async () => { await loadFullCatalog(); });
const ctx = (classes = [], extra = {}) => repairContext({ classes, drawable: () => true, ...extra });

describe('measured bad outputs', () => {
  it('pricing card: merged strings are split, no-width border is completed, variants dropped', () => {
    const r = repairVariation({
      label: 'Pricing',
      add: ['bg-white rounded-lg shadow-md p-4', 'text-gray-700', 'font-semibold', 'border-gray-300', 'md:flex', 'md:justify-between', 'md:items-center'],
      remove: [],
    }, ctx(['p-2', 'text-base']));
    // 8+ tokens after pairs is over the cap of 7
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-many');
  });
  it('pricing card trimmed: border gets its width, merged string splits', () => {
    const r = repairVariation({ add: ['bg-white rounded-lg shadow-md p-4', 'border-gray-300'] }, ctx(['p-2']));
    expect(r.ok).toBe(true);
    expect(r.final).toEqual(expect.arrayContaining(['bg-white', 'rounded-lg', 'shadow-md', 'p-4', 'border', 'border-gray-300']));
    expect(r.final).not.toContain('p-2');
  });
  it('calmer and more elegant: invented font-halfeye is dropped, removals intersect the target', () => {
    const r = repairVariation({ add: ['text-indigo-600', 'font-halfeye'], remove: ['text-slate-900', 'font-bold', 'italic'] },
      ctx(['text-slate-900', 'font-bold']));
    expect(r.ok).toBe(true);
    expect(r.dropped).toContain('font-halfeye');
    expect(r.remove).toEqual(expect.arrayContaining(['font-bold']));
    expect(r.remove).not.toContain('italic');
  });
  it('warning banner on an empty target: merged bg/text string splits', () => {
    const r = repairVariation({ add: ['bg-red-500 text-white', 'rounded-lg', 'p-3', 'font-bold', 'text-lg', 'mb-4'] }, ctx([]));
    expect(r.ok).toBe(true);
    expect(r.final).toEqual(expect.arrayContaining(['bg-red-500', 'text-white', 'p-3']));
  });
});

describe('rules', () => {
  it('aliases', () => {
    expect(aliasOf('bg-gradient-to-r')).toBe('bg-linear-to-r');
    expect(aliasOf('break-words')).toBe('wrap-break-word');
    expect(aliasOf('flex-shrink-0')).toBe('shrink-0');
    expect(aliasOf('flex-grow')).toBe('grow');
    expect(aliasOf('text-grey-500')).toBe('text-gray-500');
    expect(aliasOf('border-1')).toBe('border');
    expect(aliasOf('ring-3')).toBe('ring-2');
    expect(aliasOf('rounded')).toBe('rounded-sm');
    expect(aliasOf('shadow-small')).toBe('shadow-sm');
  });
  it('stem repair stays inside the stem', () => {
    const r = repairVariation({ add: ['shadow-med'] }, ctx([]));
    expect(r.ok).toBe(true);
    expect(r.add).toContain('shadow-md');
  });
  it('splits on commas and whitespace and lower-cases', () => {
    expect(splitItems(['P-4, M-2 text-lg'])).toEqual(['p-4', 'm-2', 'text-lg']);
    expect(editDistance('med', 'md')).toBe(1);
  });
  it('rejects forbidden, empty, no-change, not drawable and protected', () => {
    expect(repairVariation({ add: ['hidden'] }, ctx([])).reason).toBe('forbidden');
    expect(repairVariation({ add: ['zzz-nothing'] }, ctx([])).reason).toBe('empty');
    expect(repairVariation({ add: ['p-4'] }, ctx(['p-4'])).reason).toBe('no-change');
    expect(repairVariation({ add: ['p-4'] }, ctx([], { drawable: () => false })).reason).toBe('not-drawable');
    expect(repairVariation(null, ctx([])).reason).toBe('malformed');
    const c = ctx(['p-4']);
    const g = c.groupOf('p-4');
    expect(repairVariation({ add: ['p-8'] }, ctx(['p-4'], { protects: [g] })).reason).toBe('protected');
  });
  it('dedupes against the deterministic delta', () => {
    const a = repairVariation({ add: ['p-8'] }, ctx(['p-4']));
    const out = repairAll([{ add: ['p-8'] }, { add: ['p-8'] }], ctx(['p-4']), [a.key]);
    expect(out).toEqual([]);
    expect(repairAll([{ add: ['p-8'] }, { add: ['p-8'] }], ctx(['p-4'])).length).toBe(1);
  });
});
