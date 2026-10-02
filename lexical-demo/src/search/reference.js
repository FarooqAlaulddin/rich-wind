// "Make it like the heading above": copy the visual classes of another
// element. DOM based, so it runs in the shelf and not in the pure search().
// Only visual groups are copied, never layout, positioning, variants or
// arbitrary values. The result says exactly what was copied.

import { lookup } from './catalogStore';
import { splitTokenSimple } from './tokens';
import { addClass } from '../classEdit';
import { isKnownToken } from '../classCatalog';

const VISUAL = ['Font size', 'Font weight', 'Letter spacing', 'Line height', 'Text color', 'Border radius', 'Shadow', 'Padding'];
const FACET_LABELS = {
  look: VISUAL,
  color: ['Text color', 'Background color'],
  size: ['Font size'],
  weight: ['Font weight'],
  spacing: ['Padding', 'Margin', 'Gap'],
  corners: ['Border radius'],
  shadow: ['Shadow'],
  type: ['Font size', 'Font weight', 'Font family', 'Letter spacing', 'Line height'],
};
const WORD_OF = {
  'Font size': 'size', 'Font weight': 'weight', 'Letter spacing': 'tracking', 'Line height': 'leading', 'Text color': 'ink',
  'Background color': 'fill', 'Border radius': 'corners', Shadow: 'shadow', Padding: 'padding', Margin: 'margin', Gap: 'gap', 'Font family': 'font',
};

const tagOf = (el) => String(el.tagName || '').toLowerCase();
const classesOf = (el) => String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').split(/\s+/).filter(Boolean);

function sourceFor(ref, ctx) {
  const { root, el } = ctx;
  if (ref.target === 'last') return ctx.last && ctx.last !== el ? ctx.last : null;
  if (ref.target === 'sibling') {
    const next = ref.pos === 'below';
    return (next ? el.nextElementSibling : el.previousElementSibling) || null;
  }
  const everything = [...root.querySelectorAll('*')];
  const at = everything.indexOf(el);
  const pick = (test) => {
    const hits = everything.filter((n) => n !== el && test(n));
    if (!hits.length) return null;
    if (ref.first) return hits[0];
    // Nearest one before the target, else the first after it.
    const before = hits.filter((n) => everything.indexOf(n) < at);
    return before.length ? before[before.length - 1] : hits[0];
  };
  const t = ref.target;
  if (t === 'heading') return pick((n) => /^h[1-6]$/.test(tagOf(n)));
  if (/^h[1-6]$/.test(t)) return pick((n) => tagOf(n) === t);
  if (t === 'paragraph') return pick((n) => tagOf(n) === 'p' && classesOf(n).some(isKnownToken));
  if (t === 'quote') return pick((n) => tagOf(n) === 'blockquote');
  if (t === 'caption') return pick((n) => tagOf(n) === 'figcaption' || tagOf(n) === 'small');
  return null;
}

/**
 * ref: { facet, target, pos, first } from parseClause. ctx: { root, el (the styled element), classes (its
 * classes), last (the last pinned element) }.
 * -> { tokens, removed, title, hint, from } or { message } when nothing can be copied.
 */
export function resolveReference(ref, ctx) {
  if (!ctx.el || !ctx.root) return { message: 'Select an element first, then say what to match.' };
  const src = sourceFor(ref, ctx);
  if (!src) return { message: 'No matching element found to copy from.' };
  const labels = FACET_LABELS[ref.facet] || VISUAL;
  const picked = [];
  for (const cls of classesOf(src)) {
    const { prefix, base } = splitTokenSimple(cls);
    if (prefix || base.includes('[') || !isKnownToken(cls)) continue;
    const e = lookup(base);
    if (e && labels.includes(e.label)) picked.push({ cls, label: e.label });
  }
  if (!picked.length) return { message: `The ${tagOf(src)} has no ${ref.facet === 'look' ? 'visual' : ref.facet} classes to copy.` };
  const before = ctx.classes || [];
  const labelOf = (t) => (lookup(splitTokenSimple(t).base) || {}).label;
  let next = before.filter((t) => splitTokenSimple(t).prefix || !picked.some((p) => p.label === labelOf(t)));
  for (const p of picked) next = addClass(next, p.cls);
  const tokens = next.filter((t) => !before.includes(t));
  const removed = before.filter((t) => !next.includes(t));
  if (!tokens.length && !removed.length) return { message: `Already matches the ${tagOf(src)}.` };
  const facets = [...new Set(picked.map((p) => WORD_OF[p.label] || p.label.toLowerCase()))];
  const from = tagOf(src).toUpperCase();
  return { tokens, removed, title: `Match ${from}: ${facets.join(', ')}`, hint: `copied from the ${from}`, from };
}
