// Variant model shared by the variant bar and the search: which variants
// exist (from the generated list), how they stack, how typed words turn them
// on, and what a prefix means in plain words. No UI in here.
//
// A "stack" is a list of variant ids ("md", "dark", "hover"). Its prefix is
// written in Tailwind's canonical order: screen, theme, structure, state,
// other ("md:dark:hover:"). The demo writes dark mode as an arbitrary
// variant, so applyPrefix() turns "dark:" into DARK_VARIANT at apply time.

import { variantData } from './catalogStore';

/** The demo writes dark mode as an arbitrary variant, not Tailwind's dark:. */
export const DARK_VARIANT = '[.theme-dark_&]:';

/** The six chips that are always visible. */
export const COMMON_VARIANTS = ['sm', 'md', 'lg', 'dark', 'hover', 'focus'];

export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

const STATE = ['hover', 'focus', 'active', 'focus-visible', 'focus-within', 'disabled', 'enabled', 'visited', 'checked', 'indeterminate', 'default', 'required', 'optional', 'valid', 'invalid', 'user-valid', 'user-invalid', 'read-only', 'empty', 'target', 'open', 'placeholder-shown', 'autofill', 'in-range', 'out-of-range', 'inert', 'starting'];
const STRUCTURE = ['first', 'last', 'only', 'odd', 'even', 'first-of-type', 'last-of-type', 'only-of-type', 'group-hover', 'group-focus', 'group-active', 'peer-hover', 'peer-focus', 'peer-checked', 'peer-disabled'];
const THEME = ['dark', 'print', 'motion-safe', 'motion-reduce'];
// Variants that need a value (nth-3, aria-checked, has-...) are not chips.
const NEEDS_VALUE = new Set(['*', '**', 'not', 'group', 'peer', 'has', 'aria', 'data', 'nth', 'nth-last', 'nth-of-type', 'nth-last-of-type', 'supports', 'in', 'max', 'min', '@max', '@', '@min', 'group-has', 'peer-has']);

const RANK = { screen: 0, theme: 1, structure: 2, state: 3, other: 4 };

/** "Screen", "State", ... -> variant ids, built from the generated variant list. */
export function variantGroups() {
  const { names, compound } = variantData();
  const have = new Set(names);
  const screen = [...Object.keys(BREAKPOINTS).filter((b) => have.has(b)), ...(compound.max || []).map((b) => `max-${b}`)];
  const state = STATE.filter((v) => have.has(v));
  const structure = STRUCTURE.filter((v) => (v.startsWith('group-') ? have.has('group') : v.startsWith('peer-') ? have.has('peer') : have.has(v)));
  const theme = THEME.filter((v) => have.has(v));
  const taken = new Set([...screen, ...state, ...structure, ...theme, ...Object.keys(BREAKPOINTS)]);
  const other = names.filter((n) => !taken.has(n) && !NEEDS_VALUE.has(n) && !n.startsWith('@'));
  return [
    { id: 'Screen', ids: screen },
    { id: 'State', ids: state },
    { id: 'Structure', ids: structure },
    { id: 'Theme', ids: theme },
    { id: 'Other', ids: other },
  ];
}

/** Every variant id the bar can show. */
export function allVariantIds() {
  return variantGroups().flatMap((g) => g.ids);
}

export function variantKind(id) {
  if (id in BREAKPOINTS) return 'screen';
  if (id.startsWith('max-') && id.slice(4) in BREAKPOINTS) return 'screen';
  if (THEME.includes(id)) return 'theme';
  if (STRUCTURE.includes(id)) return 'structure';
  if (STATE.includes(id)) return 'state';
  return 'other';
}

const isMax = (id) => id.startsWith('max-');

function rank(id) {
  const k = RANK[variantKind(id)];
  // min-width screens before max-width ones, small to large inside each.
  if (k === 0) return [0, isMax(id) ? 1 : 0, BREAKPOINTS[id.replace('max-', '')] || 0];
  return [k, 0, 0];
}

/** Sorts a stack into Tailwind's canonical order and drops duplicates. */
export function canonicalOrder(ids) {
  return [...new Set(ids)].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || ids.indexOf(a) - ids.indexOf(b);
  });
}

/** Adds or removes `id`. One min-width and one max-width screen at most. */
export function toggleVariant(ids, id) {
  if (ids.includes(id)) return ids.filter((v) => v !== id);
  const next = variantKind(id) === 'screen'
    ? ids.filter((v) => !(variantKind(v) === 'screen' && isMax(v) === isMax(id)))
    : ids;
  return canonicalOrder([...next, id]);
}

/** ["md", "hover"] -> "md:hover:". */
export function stackPrefix(ids) {
  return canonicalOrder(ids).map((v) => `${v}:`).join('');
}

/** Rewrites a typed "dark:" segment to the demo's dark variant form. */
export function normalizePrefix(prefix) {
  if (!prefix) return prefix;
  return `${prefix
    .slice(0, -1)
    .split(/:(?![^[]*\])/)
    .map((s) => (s === 'dark' ? DARK_VARIANT.slice(0, -1) : s))
    .join(':')}:`;
}

/** "md:dark:hover:" (or the stored dark form) -> ["md", "dark", "hover"]; unknown segments are kept as they are. */
export function prefixToIds(prefix) {
  if (!prefix) return [];
  const dark = DARK_VARIANT.slice(0, -1);
  return prefix.slice(0, -1).split(/:(?![^[]*\])/).map((s) => (s === dark ? 'dark' : s));
}

/** "applies as md:hover:" text for the bar; empty stack reads "applies everywhere". */
export function appliesAs(ids) {
  const p = stackPrefix(ids);
  return p ? `applies as ${p}` : 'applies everywhere';
}

// ---------- Typed words ----------

const FILLERS = new Set(['on', 'in', 'at', 'when', 'for', 'while', 'under', 'during', 'if', 'with', 'by']);

const WORDS = {
  hover: 'hover', hovered: 'hover', hovering: 'hover', 'mouse over': 'hover', mouseover: 'hover',
  focus: 'focus', focused: 'focus', 'focus visible': 'focus-visible', 'keyboard focus': 'focus-visible',
  'focus within': 'focus-within', active: 'active', pressed: 'active', clicked: 'active', press: 'active', disabled: 'disabled',
  visited: 'visited', checked: 'checked', first: 'first', last: 'last', odd: 'odd', even: 'even', 'group hover': 'group-hover',
  'peer focus': 'peer-focus', 'peer checked': 'peer-checked',
  dark: 'dark', 'dark mode': 'dark', 'dark theme': 'dark', 'night mode': 'dark', night: 'dark', darkmode: 'dark',
  print: 'print', printing: 'print', 'motion safe': 'motion-safe', 'reduced motion': 'motion-reduce', 'reduce motion': 'motion-reduce',
  mobile: 'max-sm', phone: 'max-sm', phones: 'max-sm', 'small screen': 'max-sm', 'small screens': 'max-sm', 'narrow screen': 'max-sm',
  tablet: 'md', tablets: 'md', 'medium screen': 'md', ipad: 'md',
  desktop: 'lg', desktops: 'lg', laptop: 'lg', 'large screen': 'lg', 'large screens': 'lg',
  'wide screen': 'xl', widescreen: 'xl', 'big screen': 'xl', ultrawide: '2xl', 'extra large screen': '2xl',
  'from tablet': 'md', 'from desktop': 'lg', 'above mobile': 'sm', 'below tablet': 'max-md', 'below desktop': 'max-lg',
};
// Bare breakpoint names read as variants only after a filler ("at md").
const BARE_ONLY_AFTER_FILLER = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/**
 * Pulls variant words out of a query: "hide on mobile" -> { ids: ["max-sm"],
 * rest: "hide" }. Typed prefixes ("hover:bg-red-500", "md:dark:") count too.
 */
export function parseVariantWords(text) {
  const raw = String(text || '').trim().split(/\s+/).filter(Boolean);
  const ids = [];
  const rest = [];
  const known = new Set(allVariantIds());
  let i = 0;
  while (i < raw.length) {
    const tok = raw[i];
    const low = tok.toLowerCase();
    // Typed prefix: hover:bg-red or md:dark:
    if (low.includes(':')) {
      let depth = 0;
      let cut = -1;
      for (let k = 0; k < tok.length; k++) {
        if (tok[k] === '[') depth++;
        else if (tok[k] === ']') depth = Math.max(0, depth - 1);
        else if (tok[k] === ':' && depth === 0) cut = k;
      }
      if (cut >= 0) {
        const segs = prefixToIds(tok.slice(0, cut + 1).toLowerCase());
        if (segs.every((s) => known.has(s))) {
          ids.push(...segs);
          if (cut < tok.length - 1) rest.push(tok.slice(cut + 1));
          i++;
          continue;
        }
      }
    }
    // Optional filler, then a phrase of up to three words, then optional trailing filler.
    const start = FILLERS.has(low) ? i + 1 : i;
    let hit = null;
    for (let n = 3; n >= 1 && !hit; n--) {
      const phrase = raw.slice(start, start + n).join(' ').toLowerCase();
      if (start + n > raw.length) continue;
      const id = WORDS[phrase] || (start !== i && BARE_ONLY_AFTER_FILLER.has(phrase) ? phrase : null);
      if (id) hit = { id, end: start + n };
    }
    if (hit) {
      ids.push(hit.id);
      i = hit.end;
      continue;
    }
    rest.push(tok);
    i++;
  }
  let stack = [];
  for (const id of ids) if (known.has(id)) stack = stack.includes(id) ? stack : toggleVariant(stack, id);
  return { ids: canonicalOrder(stack), rest: rest.join(' '), restTokens: rest };
}

/** Removes the words that switch `id` on, so clicking a chip off also clears the typed word. */
export function stripVariantWords(text, id) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const one = parseVariantWords(tokens.slice(i, i + 3).join(' '));
    const alone = parseVariantWords(tokens[i]);
    // Drop the token (and a filler before it) when it alone maps to `id`.
    if (alone.ids.length === 1 && alone.ids[0] === id && alone.restTokens.length === 0) {
      if (out.length && FILLERS.has(out[out.length - 1].toLowerCase())) out.pop();
      continue;
    }
    if (tokens[i + 1] && one.ids.includes(id) && one.restTokens.length === 0 && one.ids.length === 1) {
      i += Math.min(2, tokens.length - i - 1);
      continue;
    }
    out.push(tokens[i]);
  }
  return out.join(' ');
}

// ---------- What a prefix means ----------

const NOTES = {
  hover: 'applies on mouse-over', focus: 'applies while focused', active: 'applies while pressed',
  'focus-visible': 'applies on keyboard focus', 'focus-within': 'applies when a child is focused', disabled: 'applies when disabled',
  visited: 'applies to visited links', first: 'applies to the first child', last: 'applies to the last child',
  odd: 'applies to odd children', even: 'applies to even children', 'group-hover': 'applies when a parent group is hovered',
  'peer-focus': 'applies when a sibling peer is focused', print: 'applies when printing', 'motion-safe': 'applies unless reduced motion is on',
  'motion-reduce': 'applies when reduced motion is on', checked: 'applies when checked',
};

/** One plain-words line for a variant id. */
export function describeVariant(id) {
  if (id === 'dark') return 'applies in dark mode';
  if (id in BREAKPOINTS) return `applies from ${BREAKPOINTS[id]}px wide up`;
  if (isMax(id) && id.slice(4) in BREAKPOINTS) return `applies below ${BREAKPOINTS[id.slice(4)]}px wide`;
  return NOTES[id] || `applies with ${id}`;
}

/**
 * Why a preview of a class under `ids` cannot be drawn, or null when it can.
 * env: { dark: demo is in dark mode, width: viewport width in px }.
 */
export function previewNote(ids, env = {}) {
  for (const id of ids) {
    if (id === 'dark') {
      if (!env.dark) return 'dark: applies in dark mode; showing the base style while the demo is light';
      continue;
    }
    if (id in BREAKPOINTS) {
      if (env.width !== undefined && env.width < BREAKPOINTS[id]) return `${id}: applies from ${BREAKPOINTS[id]}px wide up; this window is narrower, showing the base style`;
      continue;
    }
    return `${id}: ${describeVariant(id)}; showing the base style`;
  }
  return null;
}
