// The pure side of the Selection Shelf: plain-word labels for classes, which
// intent a class or a typed word belongs to, and what to ask when a word is
// too vague to act on. No React, no DOM.

import { lookup } from '../search/catalogStore';
import { splitTokenSimple } from '../search/tokens';
import { INTENTS as WORD_INTENTS, RELATIVE_WORDS } from '../search/wordMap';
import { PALETTE_PROPS, isColorToken } from '../search/palette';
import { isRelative } from '../search/relative';
import { FILLER, parseIntensity } from '../search/phrase';

export const INTENT_TABS = [
  { id: 'space', label: 'Space' },
  { id: 'type', label: 'Type' },
  { id: 'color', label: 'Color' },
  { id: 'shape', label: 'Shape' },
  { id: 'layout', label: 'Layout' },
  { id: 'effects', label: 'Effects' },
  { id: 'anything', label: 'Anything' },
];

// ---------- Plain words for classes ----------

const SPACE_STEM = /^-?(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap-x|gap-y|gap|space-x|space-y)-(.+)$/;
const RADIUS_RE = /^rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es))?(?:-(.+))?$/;
const SHADOW_RE = /^shadow(?:-(2xs|xs|sm|md|lg|xl|2xl|none))?$/;
const BORDER_RE = /^border(?:-(?:x|y|t|r|b|l|s|e))?(?:-(\d+))?$/;

const RADIUS_WORD = { none: 'square', sm: 'slight', '': 'gentle', md: 'gentle', lg: 'soft', xl: 'soft', '2xl': 'extra soft', '3xl': 'extra soft', full: 'pill' };
const TEXT_SIZE_WORD = { xs: 'tiny', sm: 'small', base: 'regular', lg: 'large', xl: 'larger', '2xl': 'big', '3xl': 'bigger', '4xl': 'huge', '5xl': 'giant', '6xl': 'giant', '7xl': 'giant', '8xl': 'giant', '9xl': 'giant' };
const SHADOW_WORD = { none: 'flat', '2xs': 'faint', xs: 'faint', sm: 'subtle', '': 'light', md: 'lifted', lg: 'raised', xl: 'floating', '2xl': 'dramatic' };
const BORDER_WORD = { 0: 'none', '': 'thin', 2: 'medium', 4: 'thick', 8: 'heavy' };
const COLOR_NOUN = {
  text: 'text', bg: 'surface', border: 'border', ring: 'ring', outline: 'outline', decoration: 'underline', shadow: 'glow',
  fill: 'fill', stroke: 'stroke', from: 'gradient start', via: 'gradient middle', to: 'gradient end',
};

function spaceWord(value) {
  if (value === 'auto') return 'auto';
  if (value === 'px') return 'hairline';
  if (value.startsWith('[')) return 'custom';
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (n === 0) return 'none';
  if (n <= 1) return 'tiny';
  if (n <= 3) return 'snug';
  if (n <= 5) return 'cozy';
  if (n <= 8) return 'roomy';
  if (n <= 12) return 'spacious';
  return 'huge';
}

function shadeWord(shade) {
  if (shade <= 200) return 'light';
  if (shade === 300) return 'soft';
  if (shade >= 900) return 'deep';
  if (shade >= 700) return 'dark';
  return '';
}

function colorWord(base) {
  for (const prop of PALETTE_PROPS) {
    if (!base.startsWith(prop.prefix)) continue;
    const rest = base.slice(prop.prefix.length);
    if (!isColorToken(rest)) continue;
    const [name, alpha] = rest.split('/');
    const m = /^([a-z]+)-(\d+)$/.exec(name);
    const color = m ? `${shadeWord(Number(m[2]))} ${m[1]}` : name.startsWith('[') ? 'custom' : name;
    const tail = alpha && /^\d+$/.test(alpha) ? ` (${alpha}%)` : '';
    return `${color} ${COLOR_NOUN[prop.id]}`.trim().replace(/\s+/g, ' ') + tail;
  }
  return null;
}

let reverse = null;
function reverseWords() {
  if (reverse) return reverse;
  reverse = new Map();
  for (const it of WORD_INTENTS) for (const cls of it.classes) if (!reverse.has(cls)) reverse.set(cls, it.words[0]);
  return reverse;
}

/** One plain word for a class: p-6 -> "roomy", bg-blue-50 -> "light blue surface". Empty when nothing fits. */
export function chipWord(cls) {
  const { base } = splitTokenSimple(cls);
  let m = SPACE_STEM.exec(base);
  if (m) return spaceWord(m[2]) || '';
  if ((m = RADIUS_RE.exec(base))) return RADIUS_WORD[m[1] || ''] || '';
  if ((m = /^text-(.+)$/.exec(base)) && TEXT_SIZE_WORD[m[1]]) return TEXT_SIZE_WORD[m[1]];
  if ((m = SHADOW_RE.exec(base))) return SHADOW_WORD[m[1] || ''];
  if ((m = BORDER_RE.exec(base))) return BORDER_WORD[m[1] || ''] || '';
  if ((m = /^opacity-(\d+)$/.exec(base))) return `${m[1]}%`;
  const color = colorWord(base);
  if (color) return color;
  const word = reverseWords().get(base);
  if (word) return word;
  const entry = lookup(base);
  return entry ? entry.label.toLowerCase() : '';
}

/** "p-6 roomy": the class and its plain word, for a chip. */
export function chipLabel(cls) {
  const word = chipWord(cls);
  // The variant stays: "md:rounded-xl" and "rounded-xl" are different classes.
  return word ? `${cls} ${word}` : cls;
}

// ---------- Which intent a class belongs to ----------

const SIDE_OF = { '': '', x: 'x', y: 'y', t: 't', r: 'r', b: 'b', l: 'l' };
const LAYOUT_LABELS = new Set(['Display', 'Flex direction', 'Grid template columns', 'Justify content', 'Align items', 'Flex wrap']);
const TEXT_ALIGN = /^text-(left|center|right|justify|start|end)$/;

/** { intent, ...detail } for a class; Now chips open this. Unknown classes open Anything. */
export function describeClassIntent(cls) {
  const { base } = splitTokenSimple(cls);
  for (const prop of PALETTE_PROPS) {
    if (base.startsWith(prop.prefix) && isColorToken(base.slice(prop.prefix.length))) return { intent: 'color', prop: prop.id };
  }
  let m = SPACE_STEM.exec(base);
  if (m && !m[1].startsWith('space')) {
    const stem = m[1];
    if (stem.startsWith('gap')) return { intent: 'space', kind: 'gap', side: stem === 'gap' ? '' : stem.slice(4) };
    const kind = stem[0] === 'm' ? 'margin' : 'padding';
    return { intent: 'space', kind, side: SIDE_OF[stem.slice(1)] ?? '' };
  }
  if (/^text-(xs|sm|base|lg|\d+xl)$/.test(base) || /^(font|leading|tracking)-/.test(base) || TEXT_ALIGN.test(base)) return { intent: 'type' };
  if (RADIUS_RE.test(base) || SHADOW_RE.test(base) || BORDER_RE.test(base)) return { intent: 'shape' };
  if (/^(opacity|blur|transition|duration|ease)(-|$)/.test(base)) return { intent: 'effects' };
  const entry = lookup(base);
  if (entry && LAYOUT_LABELS.has(entry.label)) return { intent: 'layout' };
  return { intent: 'anything', query: base };
}

// ---------- Words typed in "Make it" ----------

const UP = new Set(RELATIVE_WORDS.up);
const DOWN = new Set(RELATIVE_WORDS.down);

/** The direction word of a query that is only a relative word ("bigger", "a bit smaller"), else null. */
function bareRelative(words) {
  const rest = parseIntensity(words).rest.filter((w) => !FILLER.has(w));
  if (rest.length === 0) return null;
  const joined = rest.join(' ');
  if (UP.has(joined) || DOWN.has(joined)) return joined;
  return null;
}

const DEFAULT_NOUN = { type: 'text', shape: 'rounded', layout: 'gap', effects: 'opacity' };

/**
 * Makes a vague relative word concrete from the open intent: "bigger" under
 * Type is "bigger text", under Space "bigger padding". Anything else is
 * returned unchanged. ctx: { intent, kind (Space kind) }.
 */
export function prepareQuery(text, ctx = {}) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const bare = bareRelative(words);
  if (!bare || !isRelative(words)) return text;
  const noun = ctx.intent === 'space' ? (ctx.kind || 'padding') : DEFAULT_NOUN[ctx.intent];
  const strength = parseIntensity(words).used.join(' ');
  return noun ? `${strength ? `${strength} ` : ''}${bare} ${noun}` : text;
}

/**
 * With no intent open, a bare relative word has no noun to act on. Returns
 * { word, options: [{ label, query }] } to ask, or null when the words are
 * not vague. Never guesses.
 */
export function disambiguate(text, intent) {
  if (intent && intent !== 'anything') return null;
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  const word = bareRelative(words);
  if (!word || !isRelative(words)) return null;
  return {
    word,
    options: [
      { label: 'text size', query: `${word} text` },
      { label: 'padding', query: `${word} padding` },
      { label: 'width', query: `${word} width` },
    ],
  };
}

// ---------- Category words choose an intent ----------

const COLOR_CATEGORIES = new Set(['colors', 'background', 'gradient', 'ring', 'outline']);
const CATEGORY_INTENT = {
  border: 'shape', corners: 'shape', shadow: 'shape',
  text: 'type',
  layout: 'layout', flex: 'layout', grid: 'layout', align: 'layout',
  effects: 'effects', blur: 'effects', animation: 'effects',
};
const SPACE_CATEGORY = { spacing: 'padding', padding: 'padding', margin: 'margin', gap: 'gap' };

/**
 * Where a search result points the shelf: { key, intent, prop?, family?, kind? }
 * or null. "background blue" is Color on Background filtered to blue,
 * "padding" is Space on Padding, "flex" is Layout. `key` changes only when the
 * destination does, so the shelf routes once per typed word.
 */
export function routeResult(result) {
  if (!result) return null;
  const browse = result.browse;
  const palette = result.palette;
  let route = null;
  if (browse) {
    const colored = palette && (palette.family || palette.special || palette.shade);
    if (colored || COLOR_CATEGORIES.has(browse.category)) {
      route = { intent: 'color', prop: palette?.prop || 'text', family: palette?.family || palette?.special || null };
    } else if (SPACE_CATEGORY[browse.category]) {
      route = { intent: 'space', kind: SPACE_CATEGORY[browse.category] };
    } else if (CATEGORY_INTENT[browse.category]) {
      route = { intent: CATEGORY_INTENT[browse.category] };
    } else {
      route = { intent: 'anything' };
    }
  } else if (palette && !palette.hex && (palette.family || palette.special)) {
    route = { intent: 'color', prop: palette.prop, family: palette.family || null };
  }
  return route ? { ...route, key: JSON.stringify(route) } : null;
}
