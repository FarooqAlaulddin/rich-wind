import { describe, it, expect } from 'vitest';
import { buildCssIndex } from '../lexical-demo/src/inspect/cssIndex.js';

describe('buildCssIndex', () => {
  it('finds a class at the start of a selector', () => {
    const index = buildCssIndex('.p-4 { padding: 1rem; }');
    expect(index.rulesFor('p-4')[0].groups).toEqual([{ context: [], decls: [{ prop: 'padding', value: '1rem', internal: false }] }]);
  });

  it('finds an arbitrary-variant class that comes after its ancestor, and names the ancestor', () => {
    const css = '@layer utilities { .theme-dark .\\[\\.theme-dark_\\&\\]\\:border-slate-700 { border-color: var(--color-slate-700); } }';
    const index = buildCssIndex(css);
    const [rule] = index.rulesFor('[.theme-dark_&]:border-slate-700');
    expect(rule.groups[0].context).toEqual(['inside .theme-dark']);
    expect(rule.groups[0].decls[0].prop).toBe('border-color');
    expect(index.has('theme-dark')).toBe(false);
  });

  it('splits at the last combinator outside brackets and escapes', () => {
    const index = buildCssIndex('.a > .b\\:c\\[x\\ y\\] { color: red; }');
    expect(index.rulesFor('b:c[x y]')[0].groups[0].context).toEqual(['inside .a']);
  });
});
