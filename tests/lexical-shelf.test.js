// Pure logic of the Selection Shelf: plain-word chip labels, which intent a
// class or a typed word belongs to, disambiguation of vague words, typed
// variants setting the scope, and the two search fixes (gradient CSS text and
// "focus ring"). The shelf's React components are checked in the browser.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadFullCatalog, lookup, shortCss } from '../lexical-demo/src/search/catalogStore';
import { search, readVariants } from '../lexical-demo/src/classSearch';
import {
  chipWord, chipLabel, describeClassIntent, prepareQuery, disambiguate, routeResult, INTENT_TABS,
} from '../lexical-demo/src/shelf/intents';
import {
  allStripClasses, spaceClasses, spaceStem, LAYOUT_OPTIONS, TYPE_STRIPS, SHAPE_STRIPS, EFFECT_STRIPS,
} from '../lexical-demo/src/shelf/strips';
import { canonicalOrder, stackPrefix, stripVariantWords, previewNote } from '../lexical-demo/src/search/variants';
import { groupOf } from '../lexical-demo/src/classCatalog';

beforeAll(async () => { await loadFullCatalog(); });

describe('chip labels', () => {
  it.each([
    ['p-6', 'roomy'],
    ['p-0', 'none'],
    ['px-4', 'cozy'],
    ['gap-2', 'snug'],
    ['m-16', 'huge'],
    ['rounded-xl', 'soft'],
    ['rounded-full', 'pill'],
    ['rounded-none', 'square'],
    ['rounded-t-lg', 'soft'],
    ['bg-blue-50', 'light blue surface'],
    ['text-blue-600', 'blue text'],
    ['border-red-300', 'soft red border'],
    ['bg-gray-900', 'deep gray surface'],
    ['bg-white', 'white surface'],
    ['text-lg', 'large'],
    ['shadow-md', 'lifted'],
    ['opacity-50', '50%'],
    ['font-bold', 'bold'],
    ['border-2', 'medium'],
    ['hover:p-8', 'roomy'],
  ])('%s reads %s', (cls, word) => {
    expect(chipWord(cls)).toBe(word);
  });
  it('joins class and word', () => {
    expect(chipLabel('p-6')).toBe('p-6 roomy');
    expect(chipLabel('md:rounded-xl')).toBe('rounded-xl soft');
  });
  it('falls back to the group label, then to nothing', () => {
    expect(chipWord('w-64')).toBe('width');
    expect(chipWord('not-a-class')).toBe('');
  });
});

describe('class to intent', () => {
  it.each([
    ['p-4', { intent: 'space', kind: 'padding', side: '' }],
    ['py-2', { intent: 'space', kind: 'padding', side: 'y' }],
    ['mt-8', { intent: 'space', kind: 'margin', side: 't' }],
    ['gap-x-4', { intent: 'space', kind: 'gap', side: 'x' }],
    ['text-lg', { intent: 'type' }],
    ['font-bold', { intent: 'type' }],
    ['text-center', { intent: 'type' }],
    ['bg-blue-50', { intent: 'color', prop: 'bg' }],
    ['text-blue-600', { intent: 'color', prop: 'text' }],
    ['ring-red-500', { intent: 'color', prop: 'ring' }],
    ['rounded-xl', { intent: 'shape' }],
    ['border-2', { intent: 'shape' }],
    ['shadow-md', { intent: 'shape' }],
    ['flex', { intent: 'layout' }],
    ['grid-cols-3', { intent: 'layout' }],
    ['opacity-50', { intent: 'effects' }],
    ['duration-200', { intent: 'effects' }],
    ['w-full', { intent: 'anything', query: 'w-full' }],
  ])('%s opens %j', (cls, want) => {
    expect(describeClassIntent(cls)).toEqual(want);
  });
  it('ignores the variant prefix', () => {
    expect(describeClassIntent('hover:bg-blue-50')).toEqual({ intent: 'color', prop: 'bg' });
  });
});

describe('vague words follow the open intent', () => {
  it('"bigger" means text size under Type and padding under Space', () => {
    expect(prepareQuery('bigger', { intent: 'type' })).toBe('bigger text');
    expect(prepareQuery('bigger', { intent: 'space', kind: 'padding' })).toBe('bigger padding');
    expect(prepareQuery('smaller', { intent: 'space', kind: 'gap' })).toBe('smaller gap');
    expect(prepareQuery('a bit bigger', { intent: 'shape' })).toBe('a bit bigger rounded');
  });
  it('leaves words that already carry a noun, and classes, alone', () => {
    expect(prepareQuery('bigger padding', { intent: 'type' })).toBe('bigger padding');
    expect(prepareQuery('p-6', { intent: 'type' })).toBe('p-6');
    expect(prepareQuery('bold', { intent: 'space' })).toBe('bold');
  });
  it('the prepared query steps the target own classes', () => {
    const r = search(prepareQuery('bigger', { intent: 'type' }), { classes: ['text-base', 'p-4'] });
    expect(r.items[0].cls).toBe('text-lg');
    const s = search(prepareQuery('bigger', { intent: 'space', kind: 'padding' }), { classes: ['text-base', 'p-4'] });
    expect(s.items[0].cls).toBe('p-5');
  });
});

describe('disambiguation', () => {
  it('asks text size / padding / width when no intent is open', () => {
    const d = disambiguate('bigger', null);
    expect(d.options.map((o) => o.label)).toEqual(['text size', 'padding', 'width']);
    expect(d.options[0].query).toBe('bigger text');
    expect(disambiguate('smaller', 'anything').options[1].query).toBe('smaller padding');
  });
  it('does not ask when an intent is open or the words are concrete', () => {
    expect(disambiguate('bigger', 'type')).toBeNull();
    expect(disambiguate('bigger padding', null)).toBeNull();
    expect(disambiguate('bold', null)).toBeNull();
    expect(disambiguate('', null)).toBeNull();
  });
});

describe('category words choose the intent', () => {
  const route = (q, opts) => routeResult(search(q, opts));
  it('"background blue" is Color on Background filtered to blue', () => {
    expect(route('background blue')).toMatchObject({ intent: 'color', prop: 'bg', family: 'blue' });
  });
  it('"text red" is Color on Text', () => {
    expect(route('text red')).toMatchObject({ intent: 'color', prop: 'text', family: 'red' });
  });
  it('plain category words', () => {
    expect(route('padding')).toMatchObject({ intent: 'space', kind: 'padding' });
    expect(route('gap')).toMatchObject({ intent: 'space', kind: 'gap' });
    expect(route('flex')).toMatchObject({ intent: 'layout' });
    expect(route('corners')).toMatchObject({ intent: 'shape' });
    expect(route('opacity')).toMatchObject({ intent: 'effects' });
    expect(route('colors')).toMatchObject({ intent: 'color' });
  });
  it('shorthand, classes and hex values do not switch the intent', () => {
    expect(route('bgbl5')).toBeNull();
    expect(route('p-6')).toBeNull();
    expect(route('#3b82f6')).toBeNull();
    expect(route('bold')).toBeNull();
  });
  it('the route key changes only with the destination', () => {
    expect(route('background blue').key).toBe(route('background blue').key);
    expect(route('background blue').key).not.toBe(route('background red').key);
  });
});

describe('typed variants set the scope', () => {
  it('words in the field become scope ids in canonical order', () => {
    expect(readVariants('hover red').ids).toEqual(['hover']);
    expect(readVariants('hover on tablet').ids).toEqual(['md', 'hover']);
    expect(readVariants('dark mode hover blue').ids).toEqual(['dark', 'hover']);
    expect(readVariants('hide on mobile').ids).toEqual(['max-sm']);
    expect(readVariants('dark blue').ids).toEqual([]);
  });
  it('typed ids join the chips already on', () => {
    const typed = readVariants('hover red').ids;
    const scope = canonicalOrder(['md', ...typed]);
    expect(stackPrefix(scope)).toBe('md:hover:');
  });
  it('results carry the scope from chips and typed words together', () => {
    const r = search('hover bg blue', { variantIds: ['md'] });
    expect(r.variants).toEqual(['md', 'hover']);
    expect(r.items[0].cls.startsWith('md:hover:')).toBe(true);
  });
  it('clicking a typed chip off strips the words', () => {
    expect(stripVariantWords('hover red', 'hover')).toBe('red');
  });
});

describe('focus ring is ambiguous and shows both', () => {
  it('does not force the focus: prefix', () => {
    const r = search('focus ring');
    expect(r.items[0].cls.startsWith('focus:')).toBe(false);
    expect(r.items[0].base.startsWith('ring')).toBe(true);
    expect(r.variants).toEqual([]);
    expect(r.ambiguity.phrase).toBe('focus ring');
  });
  it('lists the plain class and its focus: copy next to each other', () => {
    const r = search('focus ring');
    const at = r.items.findIndex((i) => i.cls.startsWith('focus:'));
    expect(at).toBeGreaterThan(0);
    expect(r.items[at].base).toBe(r.items[at - 1].base);
    expect(r.items.filter((i) => i.cls.startsWith('focus:')).length).toBeLessThanOrEqual(4);
  });
  it('keeps the scope prefix on both forms', () => {
    const r = search('focus ring', { variantIds: ['md'] });
    expect(r.items[0].cls.startsWith('md:')).toBe(true);
    expect(r.items.some((i) => i.cls.startsWith('md:focus:ring'))).toBe(true);
  });
  it('focus alone and "focus red" stay variants', () => {
    expect(search('focus red').variants).toEqual(['focus']);
    expect(search('focus red').ambiguity).toBeNull();
  });
});

describe('resolved CSS of gradients', () => {
  it('bg-linear-to-r names the gradient stops, not an empty function', () => {
    expect(shortCss(lookup('bg-linear-to-r'))).toBe('background-image: linear-gradient(var(--tw-gradient-stops))');
  });
  it.each(['from-red-500', 'via-blue-500', 'to-green-500'])('%s shows its color and no stray commas', (cls) => {
    const css = shortCss(lookup(cls));
    expect(css).toMatch(/^--tw-gradient-(from|via|to): oklch|^--tw-gradient-(from|via|to): #/);
    expect(css).not.toMatch(/[,;] ?,|: ,/);
  });
});

describe('hover and focus scope note', () => {
  it('says what the state does and that the base style is shown', () => {
    expect(previewNote(['hover'], {})).toBe('hover: applies on mouse-over; showing the base style');
    expect(previewNote(['focus'], {})).toBe('focus: applies while focused; showing the base style');
    expect(previewNote(['md'], { width: 500 })).toMatch(/showing the base style/);
    expect(previewNote(['md'], { width: 1200 })).toBeNull();
  });
});

describe('strip definitions', () => {
  it('every offered class exists in the full catalog', () => {
    expect(allStripClasses().filter((c) => !lookup(c))).toEqual([]);
  });
  it('space stems', () => {
    expect(spaceStem('padding', 'x')).toBe('px');
    expect(spaceStem('margin', 't')).toBe('mt');
    expect(spaceStem('gap', 'y')).toBe('gap-y');
    expect(spaceStem('gap', 't')).toBeNull();
    expect(spaceClasses('gap', 't')).toEqual([]);
    expect(spaceClasses('margin', '')).toContain('m-auto');
    expect(spaceClasses('padding', '')).not.toContain('p-auto');
  });
  it('each strip is one conflict group, so a pick replaces the old class', () => {
    for (const strip of [...TYPE_STRIPS, ...SHAPE_STRIPS, ...EFFECT_STRIPS]) {
      const groups = new Set(strip.classes.map((c) => groupOf(c)));
      expect([strip.id, [...groups].length]).toEqual([strip.id, 1]);
    }
  });
  it('seven intent tabs in order, digits 1-7 pick them', () => {
    expect(INTENT_TABS.map((t) => t.id)).toEqual(['space', 'type', 'color', 'shape', 'layout', 'effects', 'anything']);
  });
  it('layout options only drop groups that exist', () => {
    for (const o of LAYOUT_OPTIONS) {
      expect(o.add.every((c) => lookup(c))).toBe(true);
      for (const g of o.drop) expect(['flex-dir', 'grid-cols']).toContain(g);
    }
  });
});
