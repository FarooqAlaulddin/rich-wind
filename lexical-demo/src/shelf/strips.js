// What each intent tab of the Selection Shelf offers: plain data, no imports,
// so scripts/seedList.mjs can read it under plain node and keep every one of
// these classes in the main bundle (search and the shelf work before the full
// catalog chunk arrives).

const W = (s) => s.split(' ');

/** Spacing scale shown in the Space strip. */
export const SCALE = W('0 1 2 3 4 5 6 8 10 12 16 20 24');

export const SPACE_KINDS = [
  { id: 'padding', label: 'Padding' },
  { id: 'margin', label: 'Margin' },
  { id: 'gap', label: 'Gap' },
];

/** Sides of the Space intent; gap only has all, x and y. */
export const SIDES = [
  { id: '', label: 'All' }, { id: 'x', label: 'X' }, { id: 'y', label: 'Y' },
  { id: 't', label: 'Top' }, { id: 'r', label: 'Right' }, { id: 'b', label: 'Bottom' }, { id: 'l', label: 'Left' },
];

/** The class stem for a kind and side: ("padding", "x") -> "px", ("gap", "y") -> "gap-y"; null when the pair does not exist. */
export function spaceStem(kind, side) {
  if (kind === 'gap') return side === '' ? 'gap' : side === 'x' || side === 'y' ? `gap-${side}` : null;
  return `${kind === 'margin' ? 'm' : 'p'}${side}`;
}

/** The classes of the Space strip for a kind and side. */
export function spaceClasses(kind, side) {
  const stem = spaceStem(kind, side);
  if (!stem) return [];
  return [...SCALE, ...(kind === 'margin' ? ['auto'] : [])].map((v) => `${stem}-${v}`);
}

export const TYPE_STRIPS = [
  { id: 'size', label: 'Size', classes: W('text-xs text-sm text-base text-lg text-xl text-2xl text-3xl text-4xl text-5xl text-6xl') },
  { id: 'weight', label: 'Weight', classes: W('font-thin font-light font-normal font-medium font-semibold font-bold font-extrabold font-black') },
  { id: 'leading', label: 'Leading', classes: W('leading-none leading-tight leading-snug leading-normal leading-relaxed leading-loose') },
  { id: 'tracking', label: 'Tracking', classes: W('tracking-tighter tracking-tight tracking-normal tracking-wide tracking-wider tracking-widest') },
  { id: 'align', label: 'Align', classes: W('text-left text-center text-right text-justify') },
];

export const SHAPE_STRIPS = [
  { id: 'radius', label: 'Radius', classes: W('rounded-none rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-3xl rounded-full') },
  { id: 'border', label: 'Border width', classes: W('border-0 border border-2 border-4 border-8') },
  { id: 'shadow', label: 'Shadow', classes: W('shadow-none shadow-2xs shadow-xs shadow-sm shadow shadow-md shadow-lg shadow-xl shadow-2xl') },
];

export const EFFECT_STRIPS = [
  { id: 'opacity', label: 'Opacity', classes: W('opacity-0 opacity-10 opacity-20 opacity-30 opacity-40 opacity-50 opacity-60 opacity-70 opacity-80 opacity-90 opacity-100') },
  { id: 'blur', label: 'Blur', classes: W('blur-xs blur-sm blur-md blur-lg blur-xl blur-2xl blur-3xl') },
  { id: 'transition', label: 'Transition', classes: W('transition-none transition transition-all transition-colors transition-opacity transition-shadow transition-transform') },
  { id: 'duration', label: 'Duration', classes: W('duration-75 duration-100 duration-150 duration-200 duration-300 duration-500 duration-700 duration-1000') },
];

/** Colors of the shadow-color strip in Effects (the full palette is under Color, Shadow). */
export const SHADOW_COLORS = W('slate-500 red-500 orange-500 amber-500 green-500 teal-500 sky-500 blue-500 indigo-500 purple-500 pink-500 black');

export const GAP_STRIP = { id: 'gap', label: 'Gap', classes: W('gap-0 gap-1 gap-2 gap-3 gap-4 gap-6 gap-8 gap-10 gap-12') };

/**
 * Layout options: `add` goes on the target, `drop` lists conflict groups
 * removed with it (so "block" clears a leftover flex-col). The option reads as
 * current when the target has every class of `has` and none of `lacks`.
 */
export const LAYOUT_OPTIONS = [
  { id: 'block', label: 'Block', add: ['block'], drop: ['flex-dir', 'grid-cols'], has: ['block'] },
  { id: 'row', label: 'Flex row', add: ['flex', 'flex-row'], drop: ['grid-cols'], has: ['flex'], lacks: ['flex-col', 'flex-col-reverse'] },
  { id: 'col', label: 'Flex column', add: ['flex', 'flex-col'], drop: ['grid-cols'], has: ['flex', 'flex-col'] },
  { id: 'grid2', label: 'Grid 2', add: ['grid', 'grid-cols-2'], drop: ['flex-dir'], has: ['grid', 'grid-cols-2'] },
  { id: 'grid3', label: 'Grid 3', add: ['grid', 'grid-cols-3'], drop: ['flex-dir'], has: ['grid', 'grid-cols-3'] },
  { id: 'grid4', label: 'Grid 4', add: ['grid', 'grid-cols-4'], drop: ['flex-dir'], has: ['grid', 'grid-cols-4'] },
  { id: 'center', label: 'Center content', add: ['flex', 'items-center', 'justify-center'], drop: [], has: ['flex', 'items-center', 'justify-center'] },
  { id: 'wrap', label: 'Wrap', add: ['flex', 'flex-wrap'], drop: [], has: ['flex', 'flex-wrap'] },
];

/** Every class the shelf can offer, for the seed and its test. */
export function allStripClasses() {
  const out = new Set();
  for (const k of ['padding', 'margin', 'gap']) {
    for (const s of SIDES) for (const c of spaceClasses(k, s.id)) out.add(c);
  }
  for (const strip of [...TYPE_STRIPS, ...SHAPE_STRIPS, ...EFFECT_STRIPS, GAP_STRIP]) strip.classes.forEach((c) => out.add(c));
  SHADOW_COLORS.forEach((c) => out.add(`shadow-${c}`));
  LAYOUT_OPTIONS.forEach((o) => o.add.forEach((c) => out.add(c)));
  return [...out];
}
