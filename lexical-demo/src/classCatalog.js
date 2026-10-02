// Class helpers for the Selection Shelf and the hover preview: token
// splitting, conflict groups (picking p-6 replaces p-4) and descriptions.
// The class data itself comes from search/catalogStore (generated from the
// Tailwind design system); this module keeps the token helpers and the
// legacy conflict-group patterns.

import { PALETTE, SHADES } from './tailwindPalette';
import { entryFor, lookup } from './search/catalogStore';
import { DARK_VARIANT, normalizePrefix } from './search/variants';

export { DARK_VARIANT, normalizePrefix };

export const VARIANTS = [
  { id: 'hover', label: 'hover', prefix: 'hover:', kind: 'state' },
  { id: 'focus', label: 'focus', prefix: 'focus:', kind: 'state' },
  { id: 'sm', label: 'sm', prefix: 'sm:', kind: 'breakpoint', minWidth: 640 },
  { id: 'md', label: 'md', prefix: 'md:', kind: 'breakpoint', minWidth: 768 },
  { id: 'lg', label: 'lg', prefix: 'lg:', kind: 'breakpoint', minWidth: 1024 },
  { id: 'dark', label: 'dark', prefix: DARK_VARIANT, kind: 'theme' },
];

// Names the legacy conflict-group patterns below check against.
const TEXT_SIZES = Object.fromEntries(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'].map((k) => [k, 1]));
const WEIGHTS = Object.fromEntries(['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'].map((k) => [k, 1]));
const SHADOWS = Object.fromEntries(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', 'none'].map((k) => [k, 1]));

/** Catalog view of a class with no variant prefix, or undefined (see search/catalogStore). */
export { entryFor };


// ---------- Tokens, variants, groups ----------

/** Split "hover:md:p-4" into { prefix: "hover:md:", base: "p-4" }. Colons inside [] do not split. */
export function splitToken(token) {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) cut = i;
  }
  return cut < 0 ? { prefix: '', base: token } : { prefix: token.slice(0, cut + 1), base: token.slice(cut + 1) };
}

const COLOR_NAME = new RegExp(`^(?:white|black|transparent|current|inherit|(?:${Object.keys(PALETTE).join('|')})-(?:${SHADES.join('|')}))(?:/(?:\\d+|\\[[^\\]]+\\]))?$`);
const ARBITRARY_COLOR = /^\[(?:#|rgb|hsl|oklch|oklab|color:|var\(--)/;

function isColorValue(rest) {
  return COLOR_NAME.test(rest) || ARBITRARY_COLOR.test(rest);
}

const TEXT_ALIGN = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);
const SPACING_RE = /^-?(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me)-/;

/**
 * Conflict group of a bare class (no variant): the string two classes share
 * when one should replace the other. null when the class has no known group.
 * Exact catalog entries win; patterns cover values outside the catalog
 * (p-5, w-1/6, bg-[#fff]).
 */
function legacyGroup(base) {
  let m = SPACING_RE.exec(base);
  if (m) return m[1];
  if ((m = /^(w|h|min-w|min-h|max-w|max-h|size)-/.exec(base))) return m[1];
  if ((m = /^(gap-x|gap-y|gap)-/.exec(base))) return m[1];
  if ((m = /^(space-x|space-y)-/.exec(base))) return m[1];
  if ((m = /^text-(.+)$/.exec(base))) {
    const rest = m[1];
    if (TEXT_SIZES[rest]) return 'text-size';
    if (TEXT_ALIGN.has(rest)) return 'text-align';
    if (/^\[[\d.]+(px|rem|em|%)\]$/.test(rest)) return 'text-size';
    if (isColorValue(rest)) return 'text-color';
    return null;
  }
  if ((m = /^font-(.+)$/.exec(base))) {
    if (WEIGHTS[m[1]] || /^\[\d+\]$/.test(m[1])) return 'font-weight';
    return ['sans', 'serif', 'mono'].includes(m[1]) ? 'font-family' : null;
  }
  if (/^leading-/.test(base)) return 'leading';
  if (/^tracking-/.test(base)) return 'tracking';
  if (/^opacity-/.test(base)) return 'opacity';
  if (/^transition(?:-(?:none|all|colors|opacity|shadow|transform))?$/.test(base)) return 'transition';
  if ((m = /^rounded(?:-(t|r|b|l|tl|tr|br|bl|s|e))?(?:-.+)?$/.exec(base))) return m[1] ? `rounded-${m[1]}` : 'rounded';
  if ((m = /^shadow(?:-(.+))?$/.exec(base))) {
    if (!m[1] || SHADOWS[m[1]] || m[1] === 'inner') return 'shadow';
    return isColorValue(m[1]) ? 'shadow-color' : null;
  }
  if ((m = /^border(?:-(x|y|t|r|b|l|s|e))?(?:-(.+))?$/.exec(base))) {
    const side = m[1] ? `-${m[1]}` : '';
    const rest = m[2];
    if (rest === undefined || /^\d+$/.test(rest) || /^\[[\d.]+px\]$/.test(rest)) return `border${side}-w`;
    if (['solid', 'dashed', 'dotted', 'double', 'none', 'hidden'].includes(rest)) return 'border-style';
    return isColorValue(rest) ? `border${side}-color` : null;
  }
  if ((m = /^bg-(.+)$/.exec(base))) return isColorValue(m[1]) ? 'bg-color' : null;
  if ((m = /^(ring|from|via|to|fill|stroke)-(.+)$/.exec(base)) && isColorValue(m[2])) {
    return m[1] === 'ring' ? 'ring-color' : ['from', 'via', 'to'].includes(m[1]) ? `gradient-${m[1]}` : m[1];
  }
  if (/^justify-(?!items|self)/.test(base)) return 'justify';
  if (/^items-/.test(base)) return 'items';
  if (/^grid-cols-/.test(base)) return 'grid-cols';
  if (/^z-/.test(base)) return 'z';
  return null;
}

/** Conflict group of a bare class: the picker's own ids first, then the catalog's property-based group. */
export function groupOf(base) {
  return legacyGroup(base) || lookup(base)?.group || null;
}

const KNOWN_VARIANTS = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'disabled', 'first', 'last', 'odd', 'even', 'sm', 'md', 'lg', 'xl', '2xl', 'dark', 'group-hover', 'peer-hover', 'placeholder', 'before', 'after', 'print']);

/** True when every variant segment of `prefix` is one Tailwind knows. */
export function isKnownPrefix(prefix) {
  if (!prefix) return true;
  const segments = prefix.slice(0, -1).split(/:(?![^[]*\])/);
  return segments.every((s) => KNOWN_VARIANTS.has(s) || /^\[.+\]$/.test(s));
}

/** Whether a bare class is one the demo can vouch for: catalog, numeric scale or arbitrary value. */
export function isKnownBase(base) {
  if (lookup(base)) return true;
  if (/^-?(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|w|h|gap|gap-x|gap-y|size|top|left|right|bottom|inset|z)-\d+(\.\d+)?$/.test(base)) return true;
  if (/^[a-z][a-z0-9-]*-\[[^\]]+\]$/.test(base)) return true;
  const color = /^(?:text|bg|border(?:-[xytrbl])?|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|divide)-(.+)$/.exec(base);
  if (color && isColorValue(color[1])) return true;
  return false;
}

/** Whether a full token (variants included) is vouched for by the catalog. */
export function isKnownToken(token) {
  const { prefix, base } = splitToken(token);
  return isKnownPrefix(prefix) && isKnownBase(base);
}

/** Short description of a (possibly variant-prefixed) token, or null. */
export function describeToken(token) {
  const { prefix, base } = splitToken(token);
  const entry = entryFor(base);
  if (!entry) return null;
  if (!prefix) return entry.desc;
  const names = prefix.slice(0, -1).split(/:(?![^[]*\])/).map((s) => (s === DARK_VARIANT.slice(0, -1) ? 'dark' : s));
  return `${names.join(' ')}: ${entry.desc}`;
}
