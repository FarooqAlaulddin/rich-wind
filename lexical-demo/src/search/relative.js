// Scales and relative words. A class belongs to a scale of siblings (p-4 ->
// p-0 ... p-96, text-base -> text-xs ... text-9xl, bg-blue-500 -> the blue
// shades). Relative words ("bigger", "more padding", "darker") step along the
// scale from what the target already has, and Left/Right in the menu scrub it.

import { lookup, allEntries, realDecls } from './catalogStore';
import { numericOf } from './cssQuery';
import { splitTokenSimple } from './tokens';
import { normalizePrefix } from './variants';
import { RELATIVE_WORDS, RELATIVE_NOUNS } from './wordMap';
import { FILLER, parseIntensity, stepsFor, DIRECTION_LABELS } from './phrase';

const SIZE_ORDER = ['none', '0', '3xs', '2xs', 'xs', 'sm', '', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl', 'full'];
const LEADING_ORDER = ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'];
const TRACKING_ORDER = ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest'];
const WORD_ORDERS = [SIZE_ORDER, LEADING_ORDER, TRACKING_ORDER];
const NUMERIC = /^\d+(\.\d+)?$/;

let scaleIndex = null;
let scaleIndexFor = null;
const scaleCache = new Map();

function scaleKey(e) {
  return `${e.neg ? '-' : ''}${e.stem}|${e.label}|${e.key}`;
}

function buildIndex() {
  const entries = allEntries();
  if (scaleIndex && scaleIndexFor === entries) return scaleIndex;
  scaleIndex = new Map();
  scaleIndexFor = entries;
  scaleCache.clear();
  for (const e of entries) {
    const k = scaleKey(e);
    let list = scaleIndex.get(k);
    if (!list) { list = []; scaleIndex.set(k, list); }
    list.push(e);
  }
  return scaleIndex;
}

function orderScale(list) {
  if (list.length < 2) return list;
  const vals = list.map((e) => e.val);
  if (vals.every((v) => NUMERIC.test(v))) return [...list].sort((a, b) => Number(a.val) - Number(b.val));
  const nums = list.map((e) => {
    const real = realDecls(e);
    return real.length ? numericOf(real[0][1]) : null;
  });
  if (nums.every((n) => n !== null)) {
    const idx = list.map((e, i) => [e, nums[i]]);
    return idx.sort((a, b) => a[1] - b[1] || list.indexOf(a[0]) - list.indexOf(b[0])).map((x) => x[0]);
  }
  if (vals.every((v) => SIZE_ORDER.includes(v))) return [...list].sort((a, b) => SIZE_ORDER.indexOf(a.val) - SIZE_ORDER.indexOf(b.val));
  return list;
}

// A group can mix keyword and numeric values (shadow-lg next to shadow-inner,
// leading-tight next to leading-6, max-w-md next to max-w-96). Step only among
// the siblings of the same kind, so shadow-lg never steps to shadow-inner.
function kindOf(entry, list) {
  for (let i = 0; i < WORD_ORDERS.length; i++) {
    const order = WORD_ORDERS[i];
    if (!order.includes(entry.val)) continue;
    const members = list.filter((e) => order.includes(e.val));
    if (members.length >= 3 && members.length < list.length) {
      return { tag: `w${i}`, list: members.sort((a, b) => order.indexOf(a.val) - order.indexOf(b.val)) };
    }
  }
  if (NUMERIC.test(entry.val)) {
    const members = list.filter((e) => NUMERIC.test(e.val));
    if (members.length >= 3 && members.length < list.length) return { tag: 'n', list: members };
  }
  return { tag: '', list };
}

/** The ordered siblings of a catalog entry, smallest first. At least the entry itself. */
export function scaleOf(entry) {
  const index = buildIndex();
  const kind = kindOf(entry, index.get(scaleKey(entry)) || [entry]);
  const k = `${scaleKey(entry)}|${kind.tag}`;
  let scale = scaleCache.get(k);
  if (!scale) {
    scale = kind.tag.startsWith('w') ? kind.list : orderScale(kind.list);
    scaleCache.set(k, scale);
  }
  return scale;
}

/**
 * Steps a class along its scale: scrub("p-4", 1) -> "p-5". The variant prefix
 * is kept. Returns null at the end of the scale or for a class with no scale.
 */
export function scrubClass(token, delta) {
  const { prefix, base } = splitTokenSimple(token);
  const entry = lookup(base);
  if (!entry) return null;
  const scale = scaleOf(entry);
  const at = scale.indexOf(entry);
  const to = scale[at + delta];
  return to ? `${prefix}${to.cls}` : null;
}

/** Position of a class in its scale: { index, size } or null. */
export function scalePosition(token) {
  const { base } = splitTokenSimple(token);
  const entry = lookup(base);
  if (!entry) return null;
  const scale = scaleOf(entry);
  return { index: scale.indexOf(entry), size: scale.length };
}

// ---------- Relative words ----------

const UP = new Set(RELATIVE_WORDS.up);
const DOWN = new Set(RELATIVE_WORDS.down);
const DARKER = new Set(RELATIVE_WORDS.darker);
const LIGHTER = new Set(RELATIVE_WORDS.lighter);

// What a bare "bigger" or "more" acts on, most likely first. Words with their
// own default (DIRECTION_LABELS: "bolder" is weight) use that instead.
const PRIORITY = ['Font size', 'Padding', 'Gap', 'Margin', 'Border radius', 'Shadow', 'Width', 'Height', 'Border width', 'Opacity', 'Font weight', 'Line height', 'Letter spacing'];
const COLOR_NOUN = { text: 'text-', font: 'text-', bg: 'bg-', background: 'bg-', border: 'border-', ring: 'ring-', fill: 'fill-', stroke: 'stroke-' };

function direction(tokens) {
  const { level, rest } = parseIntensity(tokens.map((t) => t.toLowerCase()));
  const words = rest.filter((w) => !FILLER.has(w));
  let dir = null;
  let word = null;
  const nouns = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const two = words[i + 1] ? `${w} ${words[i + 1]}` : '';
    // Two-word forms first: "lighter weight" is a weight step, not a lighter color.
    if (!dir && two && (UP.has(two) || DOWN.has(two))) { dir = UP.has(two) ? 'up' : 'down'; word = two; i++; }
    else if (!dir && DARKER.has(w)) { dir = 'darker'; word = w; }
    else if (!dir && LIGHTER.has(w)) { dir = 'lighter'; word = w; }
    else if (!dir && UP.has(w)) { dir = 'up'; word = w; }
    else if (!dir && DOWN.has(w)) { dir = 'down'; word = w; }
    else nouns.push(w);
  }
  return { dir, word, nouns, level };
}

/** True when the words are a relative request ("bigger", "make it a bit bigger", "more padding", "darker"). */
export function isRelative(tokens) {
  const { dir, nouns } = direction(tokens);
  if (!dir) return false;
  // "lighter" and "more" alone are relative; "more padding" too; "light blue" is not (not a direction word).
  return nouns.every((n) => n in RELATIVE_NOUNS || n in COLOR_NOUN);
}

/**
 * Suggestions that step the target's own classes: [{ cls, from, step, hint }].
 * `classes` are the target's classes; only those under the current variant
 * prefix are considered. Empty when nothing on the target can step. Intensity
 * words pick the distance ("a bit" 1, "way" 2, "dramatically" 3); the next
 * step further is always offered as the alternative.
 */
export function relativeSuggestions(tokens, classes, prefix = '') {
  const { dir, word: dirWord, nouns, level } = direction(tokens);
  if (!dir) return [];
  const want = normalizePrefix(prefix || '');
  const onTarget = [];
  for (const cls of classes || []) {
    const { prefix: p, base } = splitTokenSimple(cls);
    if (normalizePrefix(p || '') !== want) continue;
    const entry = lookup(base);
    if (entry) onTarget.push({ cls, base, entry, prefix: p });
  }
  const out = [];
  const push = (from, to, step, word) => {
    if (!to) return;
    out.push({ cls: `${from.prefix}${to.cls}`, from: from.cls, step, hint: `${word} than ${from.cls}`, label: from.entry.label });
  };
  const steps = stepsFor(level);

  if (dir === 'darker' || dir === 'lighter') {
    const colorPrefix = nouns.map((n) => COLOR_NOUN[n]).find(Boolean);
    for (const c of onTarget) {
      const isColor = /color$|^Fill$|^Stroke$/.test(c.entry.label) && /^\d+$/.test(c.entry.val);
      if (!isColor || (colorPrefix && !c.base.startsWith(colorPrefix))) continue;
      const scale = scaleOf(c.entry);
      const at = scale.indexOf(c.entry);
      const sign = dir === 'darker' ? 1 : -1;
      steps.forEach((n, i) => push(c, scale[at + n * sign], i + 1, dir));
    }
    return out;
  }

  const sign = dir === 'up' ? 1 : -1;
  const word = dir === 'up' ? 'bigger' : 'smaller';
  const def = DIRECTION_LABELS[dirWord];
  let labels = new Set(nouns.flatMap((n) => RELATIVE_NOUNS[n] || []));
  if (def && def.strict && (labels.size === 0 || !def.labels.some((l) => labels.has(l)))) labels = new Set(def.labels);
  let candidates = onTarget.filter((c) => !/color$|^Fill$|^Stroke$/.test(c.entry.label) && scaleOf(c.entry).length > 1);
  if (labels.size) candidates = candidates.filter((c) => labels.has(c.entry.label));
  const order = def ? [...def.labels, ...PRIORITY] : PRIORITY;
  if (!labels.size) candidates.sort((a, b) => rankOf(a.entry.label, order) - rankOf(b.entry.label, order));
  else if (def) candidates.sort((a, b) => rankOf(a.entry.label, def.labels) - rankOf(b.entry.label, def.labels));
  for (const c of candidates) {
    const scale = scaleOf(c.entry);
    const at = scale.indexOf(c.entry);
    steps.forEach((n, i) => push(c, scale[at + n * sign], i + 1, word));
  }
  return out;
}

function rankOf(label, order = PRIORITY) {
  const i = order.indexOf(label);
  return i < 0 ? order.length : i;
}

