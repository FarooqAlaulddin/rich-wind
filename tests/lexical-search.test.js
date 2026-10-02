// Table tests for the Lexical demo's class search. They live under tests/ so
// the root vitest include picks them up; the demo's src modules import each
// other without extensions, which vite (vitest) resolves and plain node does not.
// The full generated catalog is loaded once, the way the app does it lazily.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadFullCatalog, isFullCatalog, allLabels, lookup } from '../lexical-demo/src/search/catalogStore';
import { search, searchClasses, sectionEntries } from '../lexical-demo/src/classSearch';

beforeAll(async () => {
  await loadFullCatalog();
  expect(isFullCatalog()).toBe(true);
});

const clsOf = (q, opts) => search(q, opts).items.map((i) => i.cls);

describe('required queries', () => {
  const first = [
    ['bgbl5', 'bg-blue-500'],
    ['bold', 'font-bold'],
    ['font weight 600', 'font-semibold'],
    ['padding 16px', 'p-4'],
    ['p 13px', 'p-[13px]'],
    ['text 18px', 'text-lg'],
    ['center', 'text-center'],
    ['circle', 'rounded-full'],
    ['dark mode background black', 'dark:bg-black'],
    ['side by side', 'flex'],
    ['rotate 45', 'rotate-45'],
    ['hide on mobile', 'max-sm:hidden'],
    ['uppercase', 'uppercase'],
    ['line clamp 2', 'line-clamp-2'],
    ['grid 3 columns', 'grid-cols-3'],
    ['50% opacity', 'opacity-50'],
  ];
  it.each(first)('%s -> %s first', (q, want) => {
    expect(clsOf(q)[0]).toBe(want);
  });

  it('hover red offers hover: color classes', () => {
    const list = clsOf('hover red');
    expect(list[0]).toMatch(/^hover:(text|bg|border)-red-/);
    expect(list.every((c) => c.startsWith('hover:'))).toBe(true);
  });
  it('#3b82f6 gives the arbitrary class and a blue palette class', () => {
    const list = clsOf('#3b82f6');
    expect(list).toContain('bg-[#3b82f6]');
    expect(list.some((c) => /^bg-blue-/.test(c))).toBe(true);
  });
  it('margin top gives mt-* classes', () => {
    expect(clsOf('margin top')[0]).toMatch(/^mt-/);
  });
  it('relative: bigger on text-base gives text-lg', () => {
    expect(clsOf('bigger', { classes: ['text-base'] })[0]).toBe('text-lg');
  });
  it('relative: more padding on p-4 gives p-5 or p-6', () => {
    expect(['p-5', 'p-6']).toContain(clsOf('more padding', { classes: ['p-4'] })[0]);
  });
  it('relative: darker on bg-blue-500 gives bg-blue-600', () => {
    expect(clsOf('darker', { classes: ['bg-blue-500'] })[0]).toBe('bg-blue-600');
  });
  it('light blue gives a light shade', () => {
    expect(clsOf('light blue')[0]).toMatch(/-blue-200$/);
  });
  it('dark blue is a shade, not the dark variant', () => {
    const r = search('dark blue');
    expect(r.variants).toEqual([]);
    expect(r.items[0].cls).toMatch(/-blue-700$/);
  });
  it('justify-content center', () => {
    expect(clsOf('justify-content center')[0]).toBe('justify-center');
  });
  it('display flex', () => {
    expect(clsOf('display flex')[0]).toBe('flex');
  });
  it('a class used in the project ranks above a catalog match', () => {
    const list = clsOf('bgbl', { used: ['bg-blue-200'] });
    expect(list[0]).toBe('bg-blue-200');
  });
  it('a loose letter match in a used class does not outrank real results', () => {
    expect(clsOf('hover red', { used: ['rounded-xl', 'border-emerald-500'] })[0]).toMatch(/^hover:(text|bg|border)-red-/);
  });
  it('searchClasses keeps the flat shape with desc', () => {
    const list = searchClasses('p4');
    expect(list[0].cls).toBe('p-4');
    expect(list[0].desc).toMatch(/padding/);
  });
  it('rows describe themselves', () => {
    const it0 = search('rounded xl').items[0];
    expect(it0.cls).toBe('rounded-xl');
    expect(it0.css).toMatch(/border-radius/);
    expect(it0.label).toBe('Border radius');
  });
  it('a color row carries a swatch', () => {
    expect(search('bg blue 500').items[0].color).toMatch(/oklch|#/);
  });
});

describe('browse (category words)', () => {
  it('colors opens the palette on Text', () => {
    const r = search('colors');
    expect(r.browse.category).toBe('colors');
    expect(r.palette.prop).toBe('text');
  });
  it('background opens the palette on Background and lists sections', () => {
    const r = search('background');
    expect(r.palette.prop).toBe('bg');
    expect(r.browse.sections.length).toBeGreaterThan(0);
    expect(r.browse.sections.every((s) => s.entries.length > 0)).toBe(true);
  });
  it('background blue puts bg-blue-500 first and highlights blue', () => {
    const r = search('background blue');
    expect(r.items[0].cls).toBe('bg-blue-500');
    expect(r.palette).toMatchObject({ prop: 'bg', family: 'blue' });
  });
  it('border has width and radius sections and the border palette', () => {
    const r = search('border');
    const labels = r.browse.sections.map((s) => s.label);
    expect(labels).toContain('Border width');
    expect(labels).toContain('Border radius');
    expect(r.palette.prop).toBe('border');
  });
  it('border 2px narrows to border-2', () => {
    const r = search('border 2px');
    expect(r.items[0].cls).toBe('border-2');
  });
  it('border color opens the palette on Border', () => {
    expect(search('border color').palette.prop).toBe('border');
  });
  it('red highlights the red row', () => {
    expect(search('red').palette.family).toBe('red');
  });
  it('spacing lists padding, margin and gap sections', () => {
    const labels = search('spacing').browse.sections.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['Padding', 'Margin', 'Gap']));
  });
  it('hover background keeps the variant on every row', () => {
    const r = search('hover background');
    expect(r.variants).toEqual(['hover']);
    expect(r.applied).toBe('hover:');
    expect(r.items.every((i) => i.cls.startsWith('hover:'))).toBe(true);
    expect(r.browse.sections.every((s) => s.entries.every((c) => c.startsWith('hover:')))).toBe(true);
  });
  it('show all N: a section lists every entry', () => {
    const s = search('spacing').browse.sections.find((x) => x.label === 'Padding');
    expect(sectionEntries('Padding').length).toBe(s.total);
    expect(s.total).toBeGreaterThan(s.entries.length);
  });
});

describe('catalog and word map integrity', () => {
  it('has the whole of Tailwind', () => {
    expect(lookup('bg-blue-500')).toBeTruthy();
    expect(lookup('line-clamp-2')).toBeTruthy();
    expect(allLabels().length).toBeGreaterThan(100);
  });
});

describe('performance', () => {
  it('p95 of a query mix is under 10 ms', () => {
    const queries = ['p4', 'bgbl5', 'bold', 'padding 16px', 'font weight 600', 'hover red', 'dark mode background black', 'center', 'rounded xl', 'colors', 'background blue', 'bigger', 'margin top', '#3b82f6', 'flex', 'text', 'sh', 'grid 3 columns'];
    for (const q of queries) search(q, { classes: ['text-base', 'p-4'] }); // warm indexes
    const times = [];
    for (let r = 0; r < 8; r++) {
      for (const q of queries) {
        const t = performance.now();
        search(q, { classes: ['text-base', 'p-4'] });
        times.push(performance.now() - t);
      }
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    require('node:fs').appendFileSync('/tmp/probe.out', `search p95 ${p95.toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms over ${times.length} queries\n`);
    expect(p95).toBeLessThan(10);
  });
});

import { CATEGORIES, INTENTS, PATTERN_INTENTS } from '../lexical-demo/src/search/wordMap';
import { PALETTE_PROPS, paletteGrid, colorsInUse, defaultProp, cycleProp, moveCursor, cellAt, FAMILIES, SHADES, SPECIAL } from '../lexical-demo/src/search/palette';
import {
  parseVariantWords, toggleVariant, stackPrefix, canonicalOrder, appliesAs, variantGroups, COMMON_VARIANTS, normalizePrefix, previewNote,
} from '../lexical-demo/src/search/variants';
import { scrubClass, scalePosition } from '../lexical-demo/src/search/relative';
import { synthEntry } from '../lexical-demo/src/search/cssQuery';
import { groupOf, entryFor } from '../lexical-demo/src/classCatalog';
import { allStripClasses } from '../lexical-demo/src/shelf/strips';
import { analyzeInput } from '../lexical-demo/src/classSearch';
import seed from '../lexical-demo/src/catalogSeed';

describe('word map coverage', () => {
  it('every group label is reachable by some category word', () => {
    const reachable = new Set(CATEGORIES.flatMap((c) => c.labels));
    PALETTE_PROPS.forEach((p) => reachable.add(p.label));
    const missing = allLabels().filter((l) => !reachable.has(l));
    expect(missing).toEqual([]);
  });
  it('every category label exists in the catalog', () => {
    const have = new Set(allLabels());
    const bad = CATEGORIES.flatMap((c) => c.labels.filter((l) => !have.has(l)).map((l) => `${c.id}:${l}`));
    expect(bad).toEqual([]);
  });
  it('every category has words and opens something', () => {
    for (const c of CATEGORIES) {
      expect(c.words.length, c.id).toBeGreaterThan(0);
      const r = search(c.words[0]);
      expect(r.browse || r.items.length, c.id).toBeTruthy();
    }
  });
  it('every intent class exists in the catalog or is an arbitrary value', () => {
    const missing = INTENTS.flatMap((i) => i.classes.filter((c) => !lookup(c.replace(/\/\d+$/, '')) && !/\[/.test(c)).map((c) => `${i.words[0]} -> ${c}`));
    expect(missing).toEqual([]);
  });
  it('every pattern intent produces real classes for a sample number', () => {
    for (const p of PATTERN_INTENTS) {
      for (const c of p.classes) expect(c.includes('$1') || lookup(c)).toBeTruthy();
    }
  });
  it('every intent word finds its first class somewhere in the results', () => {
    const bad = [];
    for (const i of INTENTS) {
      const want = i.classes[0];
      if (!search(i.words[0]).items.some((it) => it.base === want || (it.bundle || []).includes(want))) bad.push(`${i.words[0]} -> ${want}`);
    }
    expect(bad).toEqual([]);
  });
  it('reports the word count', () => {
    const words = new Set([...CATEGORIES.flatMap((c) => c.words), ...INTENTS.flatMap((i) => i.words)]);
    require('node:fs').appendFileSync('/tmp/probe.out', `word map: ${words.size} words and phrases, ${INTENTS.length} intents, ${CATEGORIES.length} categories covering ${new Set(CATEGORIES.flatMap((c) => c.labels)).size} of ${allLabels().length} groups\n`);
    expect(words.size).toBeGreaterThan(300);
  });
});

describe('variants', () => {
  it('typed words switch variants on', () => {
    expect(parseVariantWords('hover red')).toMatchObject({ ids: ['hover'], rest: 'red' });
    expect(parseVariantWords('on mobile hide').ids).toEqual(['max-sm']);
    expect(parseVariantWords('md:dark:hover:bg-red-500')).toMatchObject({ ids: ['md', 'dark', 'hover'], rest: 'bg-red-500' });
    expect(parseVariantWords('dark mode text white').ids).toEqual(['dark']);
  });
  it('stacks in canonical order', () => {
    expect(stackPrefix(['hover', 'dark', 'md'])).toBe('md:dark:hover:');
    expect(canonicalOrder(['focus', 'sm', 'dark'])).toEqual(['sm', 'dark', 'focus']);
    expect(appliesAs(['hover', 'md'])).toBe('applies as md:hover:');
    expect(appliesAs([])).toBe('applies everywhere');
  });
  it('typed words in any order give the canonical prefix on the rows', () => {
    const r = search('hover dark tablet red');
    expect(r.applied).toBe('md:dark:hover:');
    expect(r.items[0].cls.startsWith('md:dark:hover:')).toBe(true);
  });
  it('toggle keeps one min and one max screen', () => {
    expect(toggleVariant(['sm'], 'lg')).toEqual(['lg']);
    expect(toggleVariant(['sm'], 'max-md')).toEqual(['sm', 'max-md']);
    expect(toggleVariant(['hover'], 'hover')).toEqual([]);
  });
  it('bar variant ids are merged with typed words', () => {
    const r = search('red', { variantIds: ['hover'] });
    expect(r.items[0].cls).toMatch(/^hover:/);
  });
  it('six common chips and grouped rest from the generated list', () => {
    expect(COMMON_VARIANTS).toEqual(['sm', 'md', 'lg', 'dark', 'hover', 'focus']);
    const g = variantGroups();
    expect(g.map((x) => x.id)).toEqual(['Screen', 'State', 'Structure', 'Theme', 'Other']);
    expect(g.find((x) => x.id === 'Screen').ids).toEqual(expect.arrayContaining(['sm', 'md', 'lg', 'max-sm']));
    expect(g.find((x) => x.id === 'State').ids).toEqual(expect.arrayContaining(['hover', 'focus', 'active']));
    expect(g.every((x) => x.ids.length > 0)).toBe(true);
  });
  it('dark normalizes to the demo form and explains previews', () => {
    expect(normalizePrefix('dark:')).toBe('[.theme-dark_&]:');
    expect(previewNote(['hover'], {})).toMatch(/hover/);
  });
});

describe('palette', () => {
  it('has twelve property chips and a families x shades grid', () => {
    expect(PALETTE_PROPS.map((p) => p.id)).toEqual(['text', 'bg', 'border', 'ring', 'outline', 'decoration', 'shadow', 'fill', 'stroke', 'from', 'via', 'to']);
    const g = paletteGrid('bg', 'hover:');
    expect(g.rows.length).toBe(FAMILIES.length);
    expect(g.rows[0].cells.length).toBe(SHADES.length);
    expect(g.rows[0].cells[0].cls).toBe(`hover:bg-${FAMILIES[0]}-50`);
    expect(g.specials.map((s) => s.cls)).toEqual(SPECIAL.map((s) => `hover:bg-${s}`));
  });
  it('switching the chip changes the prefix of the same swatch', () => {
    expect(paletteGrid('text').rows[5].cells[5].cls).toMatch(/^text-/);
    expect(paletteGrid('border').rows[5].cells[5].cls).toMatch(/^border-/);
    expect(paletteGrid('to').rows[5].cells[5].cls).toMatch(/^to-/);
  });
  it('shows what the target uses per property', () => {
    expect(colorsInUse(['text-blue-600', 'bg-white', 'p-4', 'hover:bg-red-500'], '')).toEqual({ text: 'blue-600', bg: 'white' });
    expect(colorsInUse(['hover:bg-red-500'], 'hover:')).toEqual({ bg: 'red-500' });
  });
  it('defaults to Text, else the last used property; chips cycle', () => {
    expect(defaultProp()).toBe('text');
    expect(defaultProp('border')).toBe('border');
    expect(defaultProp('nonsense')).toBe('text');
    expect(cycleProp('text', -1)).toBe('to');
    expect(cycleProp('to', 1)).toBe('text');
  });
  it('the cursor moves across swatches and clamps', () => {
    const g = paletteGrid('bg');
    expect(moveCursor({ row: 0, col: 0 }, 0, -1)).toEqual({ row: 0, col: 0 });
    expect(cellAt(g, moveCursor({ row: 0, col: 0 }, 0, 1)).cls).toBe(`bg-${FAMILIES[0]}-100`);
    expect(cellAt(g, { row: FAMILIES.length, col: 0 }).cls).toBe('bg-white');
  });
  it('the property chips give the same class as search', () => {
    expect(search('background blue').palette.prop).toBe('bg');
    expect(search('ring red').items[0].cls).toBe('ring-red-500');
  });
});

describe('scrub and picker support', () => {
  it('scrub steps along the scale and keeps the variant', () => {
    expect(scrubClass('p-4', 1)).toBe('p-5');
    expect(scrubClass('p-4', -1)).toBe('p-3.5');
    expect(scrubClass('hover:text-base', 1)).toBe('hover:text-lg');
    expect(scrubClass('text-9xl', 1)).toBeNull();
    expect(scalePosition('text-base').size).toBeGreaterThan(5);
  });
  it('arbitrary classes get an entry for the preview', () => {
    expect(synthEntry('p-[13px]').d).toEqual([['padding', '13px']]);
    expect(synthEntry('bg-[#3b82f6]').color).toBe('#3b82f6');
    expect(synthEntry('text-[18px]').d).toEqual([['font-size', '18px']]);
  });
  it('every class the shelf offers is in the seed (search works before the lazy chunk)', () => {
    const inSeed = new Set(seed.n.split(' '));
    expect(allStripClasses().filter((c) => !inSeed.has(c))).toEqual([]);
  });
  it('keeps the picker conflict groups', () => {
    expect(groupOf('p-4')).toBe('p');
    expect(groupOf('text-lg')).toBe('text-size');
    expect(groupOf('flex')).toBe('display');
    expect(entryFor('text-lg').desc).toMatch(/font-size/);
  });
  it('analyzeInput splits finished tokens from the query', () => {
    expect(analyzeInput('p-4 bg blue')).toEqual({ done: ['p-4'], query: 'bg blue' });
    expect(analyzeInput('p-4 ')).toEqual({ done: ['p-4'], query: '' });
  });
});
