// Pair completion: some classes do nothing alone (border-slate-200 without
// border, ring-blue-500 without a ring width, from-* without a gradient
// direction). Shared by the recipes and the AI repair pipeline.

import { lookup } from './catalogStore';
import { splitTokenSimple } from './tokens';
import { normalizePrefix } from './variants';

const labelOf = (base) => (lookup(base) || {}).label || '';
const BORDER_COLOR = /^border(?:-[xytrbl])?-(?:(?:white|black|transparent|current)|[a-z]+-\d+)(?:\/\d+)?$/;
const SIDE_BORDER = /^border-[xytrbl]-\d+$/;
const FLEX_ALIGN = /^(?:justify|items|content)-(?!items|self)/;

/**
 * Adds the class each lone color or alignment needs. `list` is the full token
 * list; returns a new list (the input is not changed). Each missing class is
 * added under the variant prefix of the class that needed it.
 */
export function completePairs(list) {
  const out = [...list];
  const has = (prefix, test) => out.some((t) => {
    const s = splitTokenSimple(t);
    return normalizePrefix(s.prefix) === normalizePrefix(prefix) && test(s.base);
  });
  const add = (prefix, base) => { if (!out.includes(`${prefix}${base}`)) out.push(`${prefix}${base}`); };

  for (const t of list) {
    const { prefix, base } = splitTokenSimple(t);
    if (BORDER_COLOR.test(base) && !has(prefix, (b) => labelOf(b) === 'Border width')) add(prefix, 'border');
    if (/^ring-(?:(?:white|black|transparent|current)|[a-z]+-\d+)(?:\/\d+)?$/.test(base) && !has(prefix, (b) => labelOf(b) === 'Ring')) add(prefix, 'ring-2');
    if (/^(?:from|via|to)-/.test(base) && lookup(base) && !has(prefix, (b) => labelOf(b) === 'Gradient direction')) add(prefix, 'bg-linear-to-r');
    if (/^grid-cols-\d+$/.test(base) && !has(prefix, (b) => labelOf(b) === 'Display')) add(prefix, 'grid');
    if (FLEX_ALIGN.test(base) && !has(prefix, (b) => labelOf(b) === 'Display')) add(prefix, 'flex');
    if (SIDE_BORDER.test(base) && !has(prefix, (b) => BORDER_COLOR.test(b))) add(prefix, 'border-slate-300');
  }
  return out;
}
