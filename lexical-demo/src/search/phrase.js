// The word classes of the "Make it" grammar, as plain data, plus the small
// parser that turns a typed phrase into clauses. No imports: scripts/seedList.mjs
// and the offline tools can read this file under plain node.
//
//   clause    := undo | reference | negation | relative | phrase
//   undo      := UNDO_WORD
//   reference := [FACET] REF_WORD TARGET_NOUN [POS]
//   negation  := NEG NOUN | "less" ADJ
//   relative  := INTENSITY? DIRECTION NOUN?
//   phrase    := INTENSITY? MOOD_OR_ARCHETYPE   (looked up in recipes.js)

const T = (s) => s.split('|');

/** Polite and connective words that carry no styling meaning. */
export const FILLER = new Set(T('a|an|the|it|its|this|that|these|those|make|me|please|can|could|would|you|just|give|let|some|of|bit|little|kind|sort|somewhat'));

/** Step distance by word: 1 hedged, 2 plain "much", 3 dramatic. Multi-word keys are tried first. */
export const INTENSITY = {
  'just a bit': 1, 'a bit': 1, 'a little': 1, 'a touch': 1, 'a hair': 1, 'a tad': 1, 'kind of': 1, 'sort of': 1,
  touch: 1, hair: 1, tad: 1, slightly: 1, barely: 1, bit: 1, little: 1, kinda: 1, sorta: 1, maybe: 1, perhaps: 1, somewhat: 1, ish: 1,
  'a lot': 2, much: 2, lot: 2, way: 2, considerably: 2, really: 2, noticeably: 2, very: 2,
  'all the way': 3, dramatically: 3, drastically: 3, extremely: 3, hugely: 3, max: 3, maximum: 3,
};
const HEDGED = new Set(['just a bit', 'a bit', 'a little', 'a touch', 'a hair', 'a tad', 'kind of', 'sort of', 'touch', 'hair', 'tad', 'slightly', 'barely', 'bit', 'little', 'kinda', 'sorta', 'maybe', 'perhaps', 'somewhat', 'ish']);

/**
 * Pulls intensity words out of a word list.
 * -> { level: 0 (none) | 1 | 2 | 3, hedged, rest, used }.
 * "way more" keeps "more" (it is the direction) and raises the level to 3.
 */
export function parseIntensity(words) {
  let level = 0;
  let hedged = false;
  const rest = [];
  const used = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let hit = null;
    for (const n of [3, 2, 1]) {
      const key = words.slice(i, i + n).join(' ');
      if (n === 1 && w === 'way' && words[i + 1] === 'more') { level = Math.max(level, 3); hit = 1; break; }
      if (n === 1 && w === 'lot' && words[i + 1] === 'more') { level = Math.max(level, 2); hit = 1; break; }
      if (key in INTENSITY && words.length >= i + n) {
        level = Math.max(level, INTENSITY[key]);
        if (HEDGED.has(key)) hedged = true;
        hit = n;
        break;
      }
    }
    if (hit) {
      used.push(...words.slice(i, i + hit));
      i += hit - 1;
    } else rest.push(w);
  }
  return { level, hedged, rest, used };
}

/** The class steps to offer for an intensity level: primary first, then the visible alternative one step further. */
export function stepsFor(level) {
  if (level >= 3) return [3, 4];
  if (level === 2) return [2, 3];
  return [1, 2];
}

/** Multi-word forms rewritten to one word before anything else looks at the text. */
const REWRITES = [
  [/\bget rid of\b/g, 'remove'],
  [/\bgot rid of\b/g, 'remove'],
  [/\bstop being\b/g, 'less'],
  [/\bnot (?:so|as|too|very) /g, 'less '],
  [/\b(?:look|looks|looking|feel|feels|feeling) (?:like|as)\b(?! (?:the|a|an|that|this|my|our)? ?(?:heading|title|h[1-6]|paragraph|text|quote|caption|one|previous|above|below|that|this)\b)/g, ''],
  [/\bturn(?:s)? into\b/g, ''],
  [/\bin to\b/g, ''],
];

/** Lowercase words of a phrase with the multi-word rewrites applied. */
export function wordsOf(text) {
  let s = String(text || '').toLowerCase().replace(/['`]/g, '');
  for (const [re, to] of REWRITES) s = s.replace(re, to);
  return s.replace(/[^a-z0-9%#().,\-/ ]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** Filler words removed; unchanged when nothing else is left. */
export function stripFiller(words) {
  const out = words.filter((w) => !FILLER.has(w));
  return out.length ? out : words;
}

// ---------- Direction words ----------

/**
 * Where a direction word acts by default (the catalog group labels, best
 * first), and whether it may fall back to the general priority list.
 * Replaces one global priority: "bolder" is weight, never text size.
 */
export const DIRECTION_LABELS = {
  bigger: { labels: T('Font size'), strict: false },
  larger: { labels: T('Font size'), strict: false },
  smaller: { labels: T('Font size'), strict: false },
  bolder: { labels: T('Font weight'), strict: true },
  heavier: { labels: T('Font weight'), strict: true },
  wider: { labels: T('Width|Letter spacing'), strict: true },
  narrower: { labels: T('Width'), strict: true },
  taller: { labels: T('Height'), strict: true },
  shorter: { labels: T('Height'), strict: true },
  roomier: { labels: T('Padding|Gap|Margin'), strict: true },
  airier: { labels: T('Padding|Gap|Margin'), strict: true },
  tighter: { labels: T('Padding|Letter spacing|Line height'), strict: true },
  denser: { labels: T('Padding|Gap'), strict: true },
  rounder: { labels: T('Border radius'), strict: true },
  sharper: { labels: T('Border radius'), strict: true },
  squarer: { labels: T('Border radius'), strict: true },
  thicker: { labels: T('Border width|Font weight'), strict: true },
  thinner: { labels: T('Font weight|Border width'), strict: true },
  higher: { labels: T('Shadow'), strict: true },
  floatier: { labels: T('Shadow'), strict: true },
  flatter: { labels: T('Shadow'), strict: true },
  fainter: { labels: T('Opacity'), strict: true },
  'lighter weight': { labels: T('Font weight'), strict: true },
};

// ---------- Negation ----------

/** Verbs that remove the group named by the noun after them. */
export const NEG_VERBS = new Set(T('remove|drop|without|lose|ditch|delete|clear|no|nix|kill'));

/** Noun -> the catalog group labels "remove X" clears. */
export const NEG_NOUNS = {
  padding: T('Padding'), pad: T('Padding'), margin: T('Margin'), gap: T('Gap'),
  shadow: T('Shadow'), shadows: T('Shadow'), border: T('Border width|Border color'), borders: T('Border width|Border color'),
  outline: T('Outline width|Outline style|Outline color'), ring: T('Ring|Ring color'),
  rounding: T('Border radius'), corners: T('Border radius'), radius: T('Border radius'),
  background: T('Background color'), bg: T('Background color'), color: T('Text color'),
  opacity: T('Opacity'), blur: T('Filter'), spacing: T('Padding|Margin|Gap'),
  tracking: T('Letter spacing'), leading: T('Line height'),
};

/** Adjectives "less X" inverts: the recipe id in recipes.js. */
export const ADJ_RECIPE = {
  shouty: 'less-shouty', loud: 'less-shouty', shout: 'less-shouty', yelling: 'less-shouty', aggressive: 'less-shouty',
  cramped: 'less-cramped', tight: 'less-cramped', crowded: 'less-cramped', squished: 'less-cramped', squeezed: 'less-cramped',
  busy: 'less-busy', cluttered: 'less-busy', noisy: 'less-busy', messy: 'less-busy',
  heavy: 'less-heavy', chunky: 'less-heavy', clunky: 'less-heavy',
  harsh: 'less-harsh', stark: 'less-harsh', glaring: 'less-harsh',
  plain: 'less-plain', bland: 'less-plain', boring: 'less-plain',
  // Moods: "too playful" / "less playful" moves to the opposite mood.
  playful: 'serious', fun: 'serious', cute: 'serious', bubbly: 'serious', whimsical: 'serious', silly: 'serious',
  serious: 'friendlier', formal: 'friendlier', corporate: 'friendlier', stiff: 'friendlier', cold: 'warm',
  warm: 'cool', cozy: 'cool', flashy: 'calm', intense: 'calm', bright: 'calm',
};

// ---------- Undo and references ----------

export const UNDO_PHRASES = new Set(T('too much|too far|overdone|back a bit|back it off|dial it back|ease off|never mind|nevermind|undo|undo that|undo it|go back|revert|scratch that|that was better|a bit less|little less|less of that|take it back'));
export const AGAIN_PHRASES = new Set(T('more of that|again|do that again|more of it|once more'));
/** "too dark" and friends step the named group back one: adjective -> { labels, dir } (dir: -1 steps down). */
export const TOO_WORDS = {
  big: { labels: T('Font size'), dir: -1 }, large: { labels: T('Font size'), dir: -1 }, small: { labels: T('Font size'), dir: 1 },
  bold: { labels: T('Font weight'), dir: -1 }, heavy: { labels: T('Font weight'), dir: -1 }, light: { labels: T('Font weight'), dir: 1 },
  round: { labels: T('Border radius'), dir: -1 }, rounded: { labels: T('Border radius'), dir: -1 }, sharp: { labels: T('Border radius'), dir: 1 },
  dark: { labels: T('Text color|Background color'), dir: -1 }, darkshade: { labels: T('Text color|Background color'), dir: -1 }, pale: { labels: T('Text color|Background color'), dir: 1 },
  tight: { labels: T('Padding'), dir: 1 }, roomy: { labels: T('Padding'), dir: -1 }, spaced: { labels: T('Padding'), dir: -1 },
  shadowy: { labels: T('Shadow'), dir: -1 }, wide: { labels: T('Width'), dir: -1 }, narrow: { labels: T('Width'), dir: 1 },
};

export const REF_WORDS = new Set(T('like|same|match|matching|copy|mirror|identical'));
export const REF_TARGETS = {
  heading: 'heading', title: 'heading', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  paragraph: 'paragraph', text: 'paragraph', quote: 'quote', caption: 'caption',
  one: 'sibling', that: 'last', previous: 'sibling', above: 'sibling', below: 'sibling',
};
export const FACETS = {
  color: 'color', colour: 'color', ink: 'color', size: 'size', weight: 'weight', spacing: 'spacing', corners: 'corners',
  shadow: 'shadow', look: 'look', style: 'look', font: 'type', type: 'type',
};

function parseReference(words) {
  const at = words.findIndex((w) => REF_WORDS.has(w));
  if (at < 0) return null;
  let facet = null;
  for (const w of words) if (FACETS[w]) { facet = FACETS[w]; break; }
  const after = words.slice(at + 1).filter((w) => (!FILLER.has(w) || w === 'that') && w !== 'as' && w !== 'to');
  // "same text color as the heading": "text" there names the facet, not the target.
  const named = after.filter((w, i) => !(w === 'text' && FACETS[after[i + 1]]));
  const targets = named.map((w) => REF_TARGETS[w]).filter(Boolean);
  const target = targets.find((t) => t !== 'last') || targets[0];
  if (!target) return null;
  const pos = after.includes('below') ? 'below' : after.includes('above') || after.includes('previous') ? 'above' : null;
  const first = after.includes('first');
  return { kind: 'reference', facet: facet || 'look', target: target === 'sibling' || target === 'last' ? target : target, pos, first };
}

/**
 * One clause -> { kind, ... }.
 *   undo       { which: 'back' | 'again' | 'too', label? }
 *   reference  { facet, target, pos }
 *   negation   { verb: 'remove', noun, labels } | { verb: 'less', adj, recipe }
 *   plain      { words, level, hedged }
 */
export function parseClause(words) {
  const joined = words.join(' ');
  if (UNDO_PHRASES.has(joined)) return { kind: 'undo', which: 'back', phrase: joined };
  if (AGAIN_PHRASES.has(joined)) return { kind: 'undo', which: 'again', phrase: joined };
  if (words[0] === 'too' && words.length === 2) {
    if (TOO_WORDS[words[1]]) return { kind: 'undo', which: 'too', word: words[1], ...TOO_WORDS[words[1]] };
    if (ADJ_RECIPE[words[1]]) return { kind: 'negation', verb: 'less', adj: words[1], recipe: ADJ_RECIPE[words[1]] };
    return { kind: 'undo', which: 'back', phrase: joined };
  }
  const ref = parseReference(words);
  if (ref) return ref;
  if (words[0] === 'less' && words.length >= 2) {
    const adj = words.slice(1).find((w) => ADJ_RECIPE[w]);
    if (adj) return { kind: 'negation', verb: 'less', adj, recipe: ADJ_RECIPE[adj] };
  }
  if (NEG_VERBS.has(words[0])) {
    const rest = stripFiller(words.slice(1));
    const noun = rest.find((w) => NEG_NOUNS[w]);
    if (noun) return { kind: 'negation', verb: 'remove', noun, labels: NEG_NOUNS[noun] };
  }
  const { level, hedged, rest } = parseIntensity(words);
  return { kind: 'plain', words: stripFiller(rest.length ? rest : words), level, hedged };
}

/** Splits a typed phrase on "and", "but", "then", "plus" and commas into clause word lists. */
export function parseClauses(text) {
  const raw = String(text || '').toLowerCase().replace(/['`]/g, '');
  const parts = raw.split(/\s*,\s*|\s+(?:and|but|then|plus|also)\s+/).map((p) => wordsOf(p)).filter((w) => w.length);
  return parts;
}
