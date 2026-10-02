import { describe, it, expect, beforeAll } from 'vitest';
import { loadFullCatalog, lookup } from '../lexical-demo/src/search/catalogStore.js';
import { isKnownBase } from '../lexical-demo/src/classCatalog.js';
import { search } from '../lexical-demo/src/classSearch.js';
import { parseClause } from '../lexical-demo/src/search/phrase.js';
import { completePairs } from '../lexical-demo/src/search/pairs.js';
import { RECIPE_BY_ID, ROUTER_RECIPE, recipeClasses, matchRecipes, resolveRecipes } from '../lexical-demo/src/search/recipes.js';
import { resolveReference } from '../lexical-demo/src/search/reference.js';
import { scrubClass } from '../lexical-demo/src/search/relative.js';

beforeAll(async () => { await loadFullCatalog(); });

const bases = (q, o = {}) => search(q, o).items.map((i) => i.cls);
const allToks = (q, o = {}) => search(q, o).items.flatMap((i) => i.bundle || [i.cls]);

describe('phrase grammar', () => {
  it('relative steps move one step, skipping the current value', () => {
    expect(bases('make it bigger', { classes: ['text-base', 'p-4'] })).toContain('text-lg');
    expect(bases('bolder', { classes: ['text-base', 'font-bold'] })).not.toContain('font-bold');
    expect(bases('bigger text', { classes: ['text-4xl'] }).every((c) => !/^text-(xs|sm|base|lg|xl|2xl|3xl)$/.test(c))).toBe(true);
  });
  it('removal words offer a removal', () => {
    const r = search('remove the shadow', { classes: ['shadow-md', 'p-4'] }).items;
    expect(r.some((i) => (i.removed || []).includes('shadow-md'))).toBe(true);
  });
  it('colour aliases resolve', () => {
    expect(bases('sky blue')).toContain('text-sky-400');
    expect(allToks('burgundy').some((c) => /rose-900/.test(c))).toBe(true);
    expect(allToks('baby blue').some((c) => /sky-200/.test(c))).toBe(true);
  });
  it('blur px maps to a named step', () => {
    expect(allToks('blur 4 px')).toContain('blur-xs');
  });
  it('undo clauses are parsed', () => {
    expect(parseClause(['undo', 'that']).kind).toBe('undo');
    expect(parseClause(['too', 'big']).which).toBe('too');
  });
});

describe('pairs', () => {
  it('completes border colour, ring colour, gradient stops and grid', () => {
    expect(completePairs(['border-red-500'])).toContain('border');
    expect(completePairs(['ring-red-500'])).toContain('ring-2');
    expect(completePairs(['from-red-500'])).toContain('bg-linear-to-r');
    expect(completePairs(['grid-cols-3'])).toContain('grid');
    expect(completePairs(['justify-between'])).toContain('flex');
  });
});

describe('recipes', () => {
  it('every class used by a recipe is real', () => {
    const bad = recipeClasses().map((c) => c.replace(/^(?:[a-z-]+:)+/, '')).filter((c) => !isKnownBase(c) && !lookup(c));
    expect(bad).toEqual([]);
  });
  it('every router id maps to a recipe', () => {
    for (const r of Object.values(ROUTER_RECIPE)) expect(RECIPE_BY_ID.get(r)).toBeTruthy();
    expect(Object.keys(ROUTER_RECIPE).length).toBe(22);
  });
  it('card resolves on an empty target and keeps the target group-clean', () => {
    const m = matchRecipes(['card']);
    const r = resolveRecipes(m.recipes, { classes: [], prefix: '', level: 1, hedged: false, kind: 'block' });
    expect(r.tokens.length).toBeGreaterThan(1);
    expect(new Set(r.tokens).size).toBe(r.tokens.length);
  });
});

describe('reference', () => {
  const mk = (tag, cls, sibs) => ({ tagName: tag.toUpperCase(), className: cls, previousElementSibling: sibs, nextElementSibling: null });
  it('"like the heading" copies visual classes only', () => {
    const h = mk('h2', 'text-2xl font-bold md:text-3xl text-[#123]');
    const p = mk('p', '');
    const root = { querySelectorAll: () => [h, p] };
    const r = resolveReference({ kind: 'reference', facet: null, target: 'heading', pos: null }, { root, el: p, classes: [], last: null });
    if (r.tokens) {
      expect(r.tokens).toContain('text-2xl');
      expect(r.tokens.some((t) => t.includes('md:') || t.includes('['))).toBe(false);
    } else expect(typeof r.message).toBe('string');
  });
});

describe('scales of mixed groups', () => {
  it('steps among siblings of the same kind', () => {
    expect(scrubClass('shadow-lg', -1)).toBe('shadow-md');
    expect(scrubClass('leading-tight', -1)).toBe('leading-none');
    expect(scrubClass('leading-6', 1)).toBe('leading-7');
    expect(scrubClass('max-w-md', 1)).toBe('max-w-lg');
    expect(scrubClass('p-4', 1)).toBe('p-5');
    expect(search('tone it down', { classes: ['font-bold', 'shadow-lg'] }).items[0].bundle).toEqual(['shadow-md']);
  });
});

describe('review regressions', () => {
  it('compound relative phrases do not throw', () => {
    expect(() => search('bigger and calmer', { classes: ['text-base', 'p-4'] })).not.toThrow();
    expect(allToks('much bigger and calmer', { classes: ['text-base', 'p-4'] }).length).toBeGreaterThan(0);
  });
  it('hints are not shared between searches', () => {
    search('again');
    expect(search('p-4').hints).toEqual([]);
    expect(search('again').hints.length).toBe(1);
  });
  it('"that" is a reference target and "text color" is a facet, not a target', () => {
    expect(parseClause(['copy', 'that']).target).toBe('last');
    expect(search('same as that').reference.target).toBe('last');
    expect(search('make it look like the heading above').reference).toMatchObject({ target: 'heading', pos: 'above' });
    expect(search('same text color as the heading').reference).toMatchObject({ target: 'heading', facet: 'color' });
  });
  it('"too X" never applies X', () => {
    expect(parseClause(['too', 'playful'])).toMatchObject({ kind: 'negation', recipe: 'serious' });
    expect(parseClause(['too', 'zany']).kind).toBe('undo');
    const r = search('too dark', { classes: ['text-gray-900'] });
    expect(r.items.some((i) => (i.bundle || [i.cls]).some((c) => /^dark:/.test(c)))).toBe(false);
    expect(r.items.length).toBeGreaterThan(0);
  });
  it('recipes under a variant scope do not double the variant', () => {
    const toks = allToks('button', { variantIds: ['hover'], classes: [] });
    expect(toks.length).toBeGreaterThan(0);
    expect(toks.some((c) => /hover:hover:/.test(c))).toBe(false);
  });
});

describe('too + mood word', () => {
  it('moves to the opposite mood instead of asking for an undo', () => {
    const c = { classes: ['text-base', 'p-4', 'font-bold', 'text-red-600'] };
    for (const q of ['too playful', 'too serious', 'too warm', 'less playful']) {
      const items = search(q, c).items;
      expect(items.length, q).toBeGreaterThan(0);
      expect(items[0].bundle || items[0].removed, q).toBeTruthy();
    }
  });
});
