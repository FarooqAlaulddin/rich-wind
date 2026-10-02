// CSS-aware pieces of the search: property names and everyday aliases,
// values with units, matching a value against the resolved declarations of
// every class, and the arbitrary-value fallback (p 13px -> p-[13px]).

import { propertyIndex } from './catalogStore';
import { parseColor } from '../colorUtil';

// ---------- Values ----------

const VALUE_RE = /^(-?\d*\.?\d+)(px|rem|em|%|deg|ms|s|vh|vw|ch|fr)?$/;

/** "16px" -> { n: 16, unit: "px" }; null for anything else. */
export function parseValue(token) {
  const m = VALUE_RE.exec(String(token).trim().toLowerCase());
  return m ? { n: parseFloat(m[1]), unit: m[2] || '' } : null;
}

const LENGTH = new Set(['px', 'rem', 'em']);
const px = (v) => (v.unit === 'px' ? v.n : v.n * 16);

/** Whether a query value equals a declaration value ("16px" and "1rem"). */
export function sameValue(q, declValue) {
  const d = parseValue(declValue);
  if (!d) return false;
  if (LENGTH.has(q.unit) && LENGTH.has(d.unit)) return Math.abs(px(q) - px(d)) < 0.011;
  if (q.unit === d.unit) return Math.abs(q.n - d.n) < 0.0011;
  if (q.unit === '' && (d.unit === '%' || d.unit === 'deg' || d.unit === 'ms')) return Math.abs(q.n - d.n) < 0.0011;
  if (q.unit === 's' && d.unit === 'ms') return Math.abs(q.n * 1000 - d.n) < 0.5;
  return false;
}

/** Numeric size of a declaration value in px (lengths) or its plain number; null if it is not one. */
export function numericOf(declValue) {
  const d = parseValue(declValue);
  if (!d) return null;
  return LENGTH.has(d.unit) ? px(d) : d.n;
}

// ---------- Properties ----------

// phrase -> CSS properties and the class stem that writes them.
const A = (stem, props, ...phrases) => phrases.map((p) => [p, { stem, props }]);
const SIDES = [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']];
const aliasEntries = [
  ...A('p', ['padding'], 'padding', 'pad', 'p', 'all padding'),
  ...A('px', ['padding-inline'], 'padding x', 'padding horizontal', 'horizontal padding', 'padding left right', 'px', 'side padding'),
  ...A('py', ['padding-block'], 'padding y', 'padding vertical', 'vertical padding', 'padding top bottom', 'py'),
  ...A('m', ['margin'], 'margin', 'm', 'all margin'),
  ...A('mx', ['margin-inline'], 'margin x', 'margin horizontal', 'horizontal margin', 'margin left right', 'mx'),
  ...A('my', ['margin-block'], 'margin y', 'margin vertical', 'vertical margin', 'margin top bottom', 'my'),
  ...SIDES.flatMap(([side, s]) => [
    ...A(`p${s}`, [`padding-${side}`], `padding ${side}`, `p${s}`, `${side} padding`),
    ...A(`m${s}`, [`margin-${side}`], `margin ${side}`, `m${s}`, `${side} margin`),
  ]),
  ...A('w', ['width'], 'width', 'w', 'wide'),
  ...A('h', ['height'], 'height', 'h', 'tall'),
  ...A('min-w', ['min-width'], 'min width', 'min w', 'minimum width'),
  ...A('max-w', ['max-width'], 'max width', 'max w', 'maximum width'),
  ...A('min-h', ['min-height'], 'min height', 'min h', 'minimum height'),
  ...A('max-h', ['max-height'], 'max height', 'max h', 'maximum height'),
  ...A('size', ['width', 'height'], 'size', 'square size', 'box size'),
  ...A('gap', ['gap'], 'gap', 'gutter', 'spacing between'),
  ...A('gap-x', ['column-gap'], 'column gap', 'gap x', 'horizontal gap'),
  ...A('gap-y', ['row-gap'], 'row gap', 'gap y', 'vertical gap'),
  ...A('text', ['font-size'], 'text', 'font size', 'text size', 'size of text', 'type size'),
  ...A('font', ['font-weight'], 'weight', 'font weight', 'text weight'),
  ...A('leading', ['line-height'], 'line height', 'leading', 'line spacing'),
  ...A('tracking', ['letter-spacing'], 'letter spacing', 'tracking', 'letter space'),
  ...A('rounded', ['border-radius'], 'rounded', 'radius', 'border radius', 'corner radius', 'rounding', 'round', 'corners', 'corner'),
  ...A('border', ['border-width'], 'border', 'border width', 'border thickness', 'stroke width'),
  ...A('opacity', ['opacity'], 'opacity', 'transparency', 'alpha'),
  ...A('rotate', ['rotate'], 'rotate', 'rotation', 'angle', 'tilt', 'turn'),
  ...A('z', ['z-index'], 'z', 'z index', 'zindex', 'layer'),
  ...A('top', ['top'], 'top', 'from top'),
  ...A('bottom', ['bottom'], 'bottom', 'from bottom'),
  ...A('left', ['left'], 'left', 'from left'),
  ...A('right', ['right'], 'right', 'from right'),
  ...A('inset', ['inset'], 'inset'),
  ...A('duration', ['transition-duration'], 'duration', 'transition duration', 'speed'),
  ...A('delay', ['transition-delay'], 'delay', 'transition delay'),
  ...A('basis', ['flex-basis'], 'basis', 'flex basis'),
  ...A('indent', ['text-indent'], 'indent', 'text indent'),
  ...A('columns', ['columns'], 'columns'),
];
const ALIASES = new Map(aliasEntries);

// Longhand properties that count as a match for a shorthand ("padding" also finds pt-4).
const LONGHAND = {
  padding: /^padding-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)$/,
  margin: /^margin-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)$/,
  'border-width': /^border-(top|right|bottom|left|inline|block)(-start|-end)?-width$/,
  'border-radius': /^border-(top|bottom|start|end)-(left|right|start|end)-radius$/,
  gap: /^(row|column)-gap$/,
  inset: /^(top|right|bottom|left|inset-inline|inset-block)$/,
};

/** Resolves a phrase ("margin top", "justify-content") to { props, stem }, or null. */
export function resolveProp(phrase) {
  const key = String(phrase).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  const a = ALIASES.get(key);
  if (a) return { ...a, alias: true };
  const css = key.replace(/ /g, '-');
  if (propertyIndex().has(css)) return { props: [css], stem: null, alias: false };
  return null;
}

/** Whether a declaration property counts for wanted property `want`: 2 exact, 1 longhand, 0 no. */
function propMatch(declProp, want) {
  if (declProp === want) return 2;
  const lh = LONGHAND[want];
  return lh && lh.test(declProp) ? 1 : 0;
}

const KEYWORD_ALIASES = { start: 'flex-start', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };

function keywordMatch(q, declValue) {
  const v = declValue.toLowerCase();
  if (v === q) return true;
  if (v.replace(/-/g, ' ') === q) return true;
  if (v.endsWith(`-${q}`)) return true;
  return KEYWORD_ALIASES[q] === v;
}

/**
 * Entries whose declarations set `props` to `valueTokens` (no value: all
 * entries that set the property). Returns [{ entry, exact, hint }].
 */
export function matchDeclarations(props, valueTokens) {
  const index = propertyIndex();
  const out = [];
  const seen = new Set();
  const qNum = valueTokens.length === 1 ? parseValue(valueTokens[0]) : null;
  const qWord = valueTokens.join(' ').toLowerCase();
  const wanted = new Set(props);
  const lists = [];
  for (const want of wanted) {
    lists.push([want, index.get(want)]);
    if (LONGHAND[want]) for (const [p, list] of index) if (LONGHAND[want].test(p)) lists.push([want, list, p]);
  }
  for (const [want, list, longProp] of lists) {
    if (!list) continue;
    for (const { entry, value } of list) {
      if (entry.neg && !valueTokens.length) continue;
      const level = longProp ? 1 : 2;
      let ok;
      if (valueTokens.length === 0) ok = true;
      else if (qNum) ok = sameValue(qNum, value);
      else ok = keywordMatch(qWord, value);
      if (!ok) continue;
      if (seen.has(entry.cls)) continue;
      seen.add(entry.cls);
      out.push({ entry, value, exact: level === 2, hint: `${longProp || want}${valueTokens.length ? ` ${qWord}` : ''}` });
    }
  }
  return out;
}

// ---------- Arbitrary values ----------

const ARBITRARY_UNITS = new Set(['px', 'rem', 'em', '%', 'vh', 'vw', 'ch', 'deg', 'ms']);

/** `p-[13px]` for ("p", {13, px}); null when the stem takes no arbitrary value. */
export function arbitraryClass(stem, value) {
  if (!stem || !value || !ARBITRARY_UNITS.has(value.unit)) return null;
  if (['opacity', 'z', 'font', 'columns'].includes(stem)) return null;
  return `${stem}-[${value.n}${value.unit}]`;
}

const SYNTH = {
  p: ['padding'], px: ['padding-inline'], py: ['padding-block'], pt: ['padding-top'], pr: ['padding-right'], pb: ['padding-bottom'], pl: ['padding-left'],
  m: ['margin'], mx: ['margin-inline'], my: ['margin-block'], mt: ['margin-top'], mr: ['margin-right'], mb: ['margin-bottom'], ml: ['margin-left'],
  w: ['width'], h: ['height'], 'min-w': ['min-width'], 'max-w': ['max-width'], 'min-h': ['min-height'], 'max-h': ['max-height'],
  size: ['width', 'height'], gap: ['gap'], 'gap-x': ['column-gap'], 'gap-y': ['row-gap'], rounded: ['border-radius'],
  top: ['top'], right: ['right'], bottom: ['bottom'], left: ['left'], inset: ['inset'], leading: ['line-height'], tracking: ['letter-spacing'],
  opacity: ['opacity'], rotate: ['rotate'], z: ['z-index'], indent: ['text-indent'], basis: ['flex-basis'], duration: ['transition-duration'], delay: ['transition-delay'],
};
const COLOR_SYNTH = { text: 'color', bg: 'background-color', border: 'border-color', fill: 'fill', stroke: 'stroke', outline: 'outline-color', decoration: 'text-decoration-color', accent: 'accent-color', caret: 'caret-color' };

/**
 * An entry-shaped description of a class that is not in the catalog because
 * it carries an arbitrary value: p-[13px], bg-[#3b82f6], text-[18px]. Lets
 * the hover preview and the swatch work for classes search made up.
 */
export function synthEntry(base) {
  const m = /^(-?)([a-z]+(?:-[a-z]+)*)-\[(.+)\]$/.exec(base);
  if (!m) return undefined;
  const [, neg, stem, raw] = m;
  const value = raw.replace(/_/g, ' ').replace(/^(?:color|length|percentage|number|angle):/, '');
  let d = null;
  let color = null;
  if (COLOR_SYNTH[stem] && parseColor(value)) {
    d = [[COLOR_SYNTH[stem], value]];
    color = value;
  } else if (stem === 'text' && /^-?[\d.]+(px|rem|em|%|vh|vw|ch)$/.test(value)) {
    d = [['font-size', value]];
  } else if (stem === 'font' && /^\d{3}$/.test(value)) {
    d = [['font-weight', value]];
  } else if (SYNTH[stem]) {
    d = SYNTH[stem].map((p) => [p, `${neg}${value}`]);
  }
  if (!d) return undefined;
  return { cls: base, group: null, label: 'Arbitrary', d, desc: d.map(([p, v]) => `${p}: ${v}`).join('; '), color, norm: base.toLowerCase().replace(/[^a-z0-9]/g, '') };
}
