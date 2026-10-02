// One search box for all of Tailwind. A query can be class syntax ("bgbl5"),
// a CSS property and value ("justify-content center", "padding 16px"), a
// color (#3b82f6, "light blue"), an everyday word ("bold", "side by side"),
// a variant phrase ("hover red", "hide on mobile"), a category word
// ("colors", "border") that opens a browse view, or a relative word
// ("bigger", "more padding") that steps the target's own classes.
//
// Pure and synchronous: the catalog comes from search/catalogStore (a seed
// first, the full generated catalog once its chunk has loaded). No server
// call per keystroke.
//
// Ranking, best first: exact class > used in the project > relative step >
// name prefix > property/value and colors > intent words > fuzzy. Inside a
// tier a popularity prior (shade 500, p-4, rounded-md) breaks ties.

import {
  allEntries, lookup, entriesOfLabel, declsOf, shortCss, colorOf,
} from './search/catalogStore';
import { parseVariantWords, stackPrefix, canonicalOrder, appliesAs } from './search/variants';
import { splitTokenSimple } from './search/tokens';
import {
  CATEGORIES, INTENTS, PATTERN_INTENTS, PROPERTY_WORDS, COLOR_ALIASES, SHADE_WORDS,
} from './search/wordMap';
import {
  resolveProp, matchDeclarations, parseValue, sameValue, numericOf, arbitraryClass, synthEntry,
} from './search/cssQuery';
import { isRelative, relativeSuggestions } from './search/relative';
import { addClass } from './classEdit';
import {
  FAMILIES, SHADES, SPECIAL, PALETTE_LABELS, paletteClass,
} from './search/palette';
import { parseColor, nearestColors, toHex } from './colorUtil';
import { isKnownToken } from './classCatalog';
import {
  wordsOf, stripFiller, parseIntensity, parseClause, parseClauses,
} from './search/phrase';
import { matchRecipes, resolveRecipes, describeDelta, RECIPE_BY_ID } from './search/recipes';
import { undoItems } from './search/undo';
import { removeFor } from './search/negate';

export { splitTokenSimple };

// Tier bases. A tier is a band of 1000, so a score never leaves its tier.
export const TIER = {
  exact: 6000, exactNorm: 5800, used: 5000, relative: 4900, prefix: 4000,
  pattern: 3500, prop: 3000, intent: 2000, fuzzy: 1000,
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- Input analysis (unchanged contract) ----------

/**
 * Splits the text field into finished tokens and the query being typed.
 * Trailing tokens that are not known classes join into one query, so
 * "bg blue 500" is a single query while "p-4 bg blue 500" is the finished
 * class p-4 plus that query.
 */
export function analyzeInput(text, isKnown = isKnownToken) {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(text || '');
  let i = tokens.length;
  while (i > 0 && !isKnown(tokens[i - 1])) i--;
  if (i === tokens.length) {
    if (trailingSpace || tokens.length === 0) return { done: tokens, query: '' };
    return { done: tokens.slice(0, -1), query: tokens[tokens.length - 1] };
  }
  return { done: tokens.slice(0, i), query: tokens.slice(i).join(' ') };
}

// ---------- Name matching ----------

/** How `q` (normalized) matches a normalized class name; null for no match. */
function nameScore(q, n) {
  if (n === q) return { kind: 'exactNorm', q: 950 };
  if (n.startsWith(q)) return { kind: 'prefix', q: 900 - Math.min(n.length - q.length, 80) };
  const at = n.indexOf(q);
  if (at >= 0) return { kind: 'fuzzy', q: 700 - Math.min(at, 40) - Math.min(n.length - q.length, 40) };
  if (q.length < 3) return null;
  let pos = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < q.length; i++) {
    pos = n.indexOf(q[i], pos);
    if (pos < 0) return null;
    if (first < 0) first = pos;
    last = pos;
    pos++;
  }
  const gaps = last - first + 1 - q.length;
  return { kind: 'fuzzy', q: 400 + (last === n.length - 1 ? 30 : 0) - Math.min(gaps, 60) * 4 - Math.min(first, 20) * 2 - Math.min(n.length - q.length, 40) };
}

// A trailing number that names the candidate's shade wins ties: "bgbl5" is
// bg-blue-500, "bgbl50" is bg-blue-50.
function shadeBonus(q, n) {
  const qd = q.match(/(\d+)$/);
  const cd = n.match(/(\d+)$/);
  if (!qd || !cd) return 0;
  if (cd[1] === qd[1]) return 60;
  if (qd[1].length === 1 && cd[1] === `${qd[1]}00`) return 60;
  return 0;
}

// ---------- Candidate pool ----------

class Pool {
  constructor() { this.map = new Map(); }

  add(cls, score, source, hint, extra) {
    const old = this.map.get(cls);
    if (old && old.score >= score) return;
    this.map.set(cls, { cls, score, source, hint, ...extra });
  }

  delete(key) { this.map.delete(key); }

  values() { return [...this.map.values()]; }

  sorted() { return [...this.map.values()].sort((a, b) => b.score - a.score || a.cls.length - b.cls.length); }
}

function fuzzyInto(pool, q, allowNeg) {
  if (q.length < 2) return;
  const entries = allEntries();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.neg && !allowNeg) continue;
    const m = nameScore(q, e.norm);
    if (!m) continue;
    if (m.kind === 'exactNorm') pool.add(e.cls, TIER.exactNorm + e.pop, 'name', 'class name');
    else if (m.kind === 'prefix') pool.add(e.cls, TIER.prefix + Math.round(m.q * 0.4) + e.pop * 2 + shadeBonus(q, e.norm), 'name', 'name starts with it');
    else pool.add(e.cls, TIER.fuzzy + Math.round(m.q * 0.6) + e.pop * 3 + shadeBonus(q, e.norm) * 3, 'fuzzy', 'name contains the letters');
  }
}

function usedInto(pool, used, q, prefixIds) {
  const want = stackPrefix(prefixIds);
  used.forEach((full, i) => {
    const { prefix: p, base } = splitTokenSimple(full);
    const m = nameScore(q, norm(base));
    if (!m) return;
    const off = p === want ? 0 : -300;
    // Only a name that starts with or contains the query counts as "used": a
    // loose letter-order match ("red" inside "rounded-xl") must not outrank real results.
    const loose = m.kind === 'fuzzy' && m.q < 600;
    const tier = loose ? TIER.fuzzy + 300 : TIER.used;
    pool.add(full, tier + Math.max(0, 300 - i * 6) + Math.round(m.q / 10) + off, 'used', 'already in this project', { keepPrefix: true });
  });
}

// ---------- Colors ----------

const FAMILY_SET = new Set(FAMILIES);
const PROP_WORD = new Map();
for (const [id, words] of Object.entries(PROPERTY_WORDS)) for (const w of words) if (!PROP_WORD.has(w)) PROP_WORD.set(w, id);
const COLOR_FILLERS = new Set(['color', 'colors', 'colour', 'colours', 'shade', 'of', 'the', 'a', 'make', 'it', 'in', 'is']);
const SHADE_X = { ...SHADE_WORDS, darkshade: 700 };
const DEFAULT_COLOR_PROPS = ['text', 'bg', 'border'];

function colorFromWords(tokens) {
  const props = [];
  let family = null;
  let shade = null;
  let special = null;
  let leftover = 0;
  const merged = [];
  for (let i = 0; i < tokens.length; i++) {
    const two = tokens[i + 1] ? `${tokens[i]} ${tokens[i + 1]}` : '';
    if (two && COLOR_ALIASES[two]) { merged.push(two); i++; } else merged.push(tokens[i]);
  }
  for (const t of merged) {
    if (SHADES.includes(t)) { shade = Number(t); continue; }
    if (FAMILY_SET.has(t)) { family = t; continue; }
    if (COLOR_ALIASES[t]) { family = COLOR_ALIASES[t][0]; shade = shade ?? COLOR_ALIASES[t][1]; continue; }
    if (SPECIAL.includes(t)) { special = t; continue; }
    if (SHADE_X[t]) { shade = shade ?? SHADE_X[t]; continue; }
    if (PROP_WORD.has(t)) { props.push(PROP_WORD.get(t)); continue; }
    if (COLOR_FILLERS.has(t)) continue;
    leftover++;
  }
  if (leftover || (!family && !special)) return null;
  return { props: [...new Set(props)], family, shade, special };
}

function colorInto(pool, ctx, tokens, restText) {
  const lit = /(#[0-9a-f]{3,8}\b|(?:rgb|hsl|oklch)a?\([^)]*\))/i.exec(restText);
  if (lit) {
    const rgb = parseColor(lit[1]);
    if (!rgb) return false;
    const others = restText.replace(lit[1], ' ').split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
    const props = [...new Set(others.map((t) => PROP_WORD.get(t)).filter(Boolean))];
    const use = props.length ? props : ['bg', 'text', 'border'];
    const hex = toHex(rgb);
    const near = nearestColors(rgb, 3);
    use.forEach((prop, pi) => {
      const base = 3600 - pi * 100;
      pool.add(paletteClass(prop, `[${hex}]`), base, 'color', `color ${hex}`);
      near.forEach((n, i) => pool.add(paletteClass(prop, n.name), base - 20 - i * 10, 'color', `nearest palette color to ${hex}`));
    });
    const [family, shade] = near[0].name.split('-');
    ctx.palette = { prop: use[0], family, shade, hex };
    return true;
  }
  const w = colorFromWords(tokens);
  if (!w) return false;
  const explicit = w.props.length > 0;
  const props = explicit ? w.props : DEFAULT_COLOR_PROPS;
  const shade = w.shade ?? 500;
  const name = w.special || `${w.family}-${SHADES.includes(String(shade)) ? shade : 500}`;
  props.forEach((prop, pi) => {
    const base = (explicit ? 3600 : 3300) - pi * 60;
    pool.add(paletteClass(prop, name), base, 'color', `color ${name}`);
    if (!w.special && w.shade === null) {
      for (const [d, off] of [[-100, 130], [100, 140]]) {
        const s = String(shade + d);
        if (SHADES.includes(s)) pool.add(paletteClass(prop, `${w.family}-${s}`), base - off, 'color', `${w.family} shade ${s}`);
      }
    }
  });
  ctx.palette = { prop: explicit ? w.props[0] : 'text', family: w.family || null, shade: w.shade ?? null };
  return true;
}

// ---------- Words and phrases ----------

const phraseOf = (tokens) => tokens.join(' ').toLowerCase().replace(/['`]/g, '').replace(/[^a-z0-9%\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

function intentInto(pool, phrase) {
  if (!phrase) return;
  const qTokens = phrase.split(' ');
  for (const it of INTENTS) {
    let best = 0;
    let bestPhrase = '';
    for (const p of it.words) {
      let s = 0;
      if (p === phrase) s = 300;
      else if (phrase.length >= 3 && p.startsWith(phrase)) s = 150;
      else if (qTokens.every((t) => t.length >= 3 && p.split(' ').includes(t))) s = 60 - Math.min(p.split(' ').length - qTokens.length, 5) * 6;
      if (s > best) { best = s; bestPhrase = p; }
    }
    if (!best) continue;
    it.classes.forEach((cls, i) => {
      const e = lookup(cls);
      const hint = best >= 300 ? `means "${bestPhrase}"` : `matched: ${bestPhrase}`;
      // A phrase typed in full is a deliberate mapping: it outranks name-prefix matches.
      const base = best >= 300 ? 4700 : TIER.intent + best;
      pool.add(cls, base + Math.max(0, 60 - i * 12) + (e ? Math.round(e.pop / 10) : 0), 'intent', hint);
    });
  }
}

// Named steps that stand in for an arbitrary pixel value ("blur 4 px" is blur-xs).
const FIT = { blur: { 4: 'blur-xs', 8: 'blur-sm', 12: 'blur-md', 16: 'blur-lg', 24: 'blur-xl', 40: 'blur-2xl', 64: 'blur-3xl' } };

function patternInto(pool, phrase) {
  for (const p of PATTERN_INTENTS) {
    const m = p.re.exec(phrase);
    if (!m) continue;
    const named = p.fit && FIT[p.fit] && FIT[p.fit][Number(m[1])];
    if (named && lookup(named)) pool.add(named, TIER.pattern + 140, 'pattern', `matched: ${phrase} (the named step)`);
    p.classes.forEach((tpl, i) => {
      const cls = tpl.replace('$1', m[1]);
      if (lookup(cls) || /\[/.test(cls)) pool.add(cls, TIER.pattern + 100 - i * 20, 'pattern', `matched: ${phrase}`);
    });
  }
}

// ---------- CSS property and value ----------

function cssInto(pool, tokens) {
  if (tokens.length === 0 || tokens.length > 6) return;
  const lower = tokens.map((t) => t.toLowerCase());
  const tries = [];
  for (let k = lower.length; k >= 1; k--) tries.push({ prop: lower.slice(0, k), value: lower.slice(k) }); // property first
  for (let k = 1; k < lower.length; k++) tries.push({ prop: lower.slice(k), value: lower.slice(0, k) }); // value first
  for (const t of tries) {
    const prop = resolveProp(t.prop.join(' '));
    if (!prop) continue;
    const qNum = t.value.length === 1 ? parseValue(t.value[0]) : null;
    const hits = matchDeclarations(prop.props, t.value);
    const label = t.value.length ? `${t.prop.join(' ')} ${t.value.join(' ')}` : t.prop.join(' ');
    for (const h of hits) {
      pool.add(h.entry.cls, TIER.prop + (h.exact ? 300 : 100) + h.entry.pop * 3 + (t.value.length ? 100 : 0), 'css', `matched: ${h.hint}`);
    }
    if (qNum && prop.stem) {
      const arb = arbitraryClass(prop.stem, qNum);
      const exact = hits.some((h) => h.exact);
      if (arb && !exact) {
        pool.add(arb, TIER.prop + 600, 'css', `matched: ${label} (no scale step, so an arbitrary value)`);
        nearestInto(pool, prop, qNum);
      }
    }
    if (hits.length || (qNum && prop.stem)) return;
  }
}

function nearestInto(pool, prop, qNum) {
  if (!['px', 'rem', 'em'].includes(qNum.unit)) return;
  const want = qNum.unit === 'px' ? qNum.n : qNum.n * 16;
  const scored = [];
  for (const h of matchDeclarations(prop.props, [])) {
    if (!h.exact || h.entry.neg) continue;
    const v = numericOf(h.value);
    if (v === null) continue;
    scored.push({ e: h.entry, d: Math.abs(v - want) });
  }
  scored.sort((a, b) => a.d - b.d);
  scored.slice(0, 2).forEach((s, i) => pool.add(s.e.cls, TIER.prop + 400 - i * 20, 'css', 'nearest scale step'));
}

// ---------- Category browse ----------

const CATEGORY_BY_WORD = new Map();
for (const cat of CATEGORIES) for (const w of cat.words) if (!CATEGORY_BY_WORD.has(w)) CATEGORY_BY_WORD.set(w, cat);

export function categoryWords() { return [...CATEGORY_BY_WORD.keys()]; }
export function categoryForWord(word) { return CATEGORY_BY_WORD.get(String(word).toLowerCase()) || null; }

const byPop = (list) => [...list].sort((a, b) => b.pop - a.pop || a.cls.length - b.cls.length);

/**
 * Every class of one group label, best first. `narrow` is { value, words }
 * from a browse result. Negative classes only when nothing else fits.
 */
export function sectionEntries(label, narrow = {}) {
  let list = entriesOfLabel(label);
  if (narrow.value) {
    list = list.filter((e) => declsOf(e).some(([p, v]) => !p.startsWith('--') && sameValue(narrow.value, v)));
  }
  for (const w of narrow.words || []) {
    const nw = norm(w);
    list = list.filter((e) => e.norm.includes(nw));
  }
  const pos = list.filter((e) => !e.neg);
  return byPop(pos.length ? pos : list);
}

function browseFor(tokens) {
  if (tokens.length === 0 || tokens.length > 4) return null;
  const lower = tokens.map((t) => t.toLowerCase());
  let cat = null;
  const rest = [];
  for (let i = 0; i < lower.length; i++) {
    const two = lower[i + 1] ? `${lower[i]} ${lower[i + 1]}` : '';
    if (!cat && two && CATEGORY_BY_WORD.has(two)) { cat = CATEGORY_BY_WORD.get(two); i++; continue; }
    if (!cat && CATEGORY_BY_WORD.has(lower[i])) { cat = CATEGORY_BY_WORD.get(lower[i]); continue; }
    rest.push(lower[i]);
  }
  if (!cat) return null;
  let value = null;
  let family = null;
  let shade = null;
  let colorish = false;
  const words = [];
  for (const t of rest) {
    const v = parseValue(t);
    if (v) value = v;
    else if (FAMILY_SET.has(t)) family = t;
    else if (COLOR_ALIASES[t]) { family = COLOR_ALIASES[t][0]; shade = COLOR_ALIASES[t][1]; }
    else if (SHADE_X[t]) shade = SHADE_X[t];
    else if (SPECIAL.includes(t)) family = t;
    else if (COLOR_FILLERS.has(t) || CATEGORY_BY_WORD.get(t)?.id === 'colors') colorish = true;
    else words.push(t);
  }
  const paletteId = cat.palette || (family || colorish ? 'text' : null);
  const wantsColor = Boolean(family || colorish || shade);
  const narrow = { value, words };
  const labels = cat.labels.filter((l) => !(cat.palette && PALETTE_LABELS.has(l)));
  const specific = rest.length > 0;
  const per = specific ? 8 : 4;
  const sections = [];
  if (!wantsColor || !cat.palette) {
    for (const label of labels) {
      const all = sectionEntries(label, narrow);
      if (all.length === 0) continue;
      sections.push({ label, total: all.length, entries: all.slice(0, per).map((e) => e.cls), more: Math.max(0, all.length - per), narrow });
    }
  }
  // Words that match nothing and are not colors: this is not a browse query.
  if (words.length && sections.length === 0) return null;
  if (value && sections.length === 0 && !wantsColor) return null;
  const palette = paletteId && (cat.palette || wantsColor)
    ? { prop: paletteId, family: family && !SPECIAL.includes(family) ? family : null, special: family && SPECIAL.includes(family) ? family : null, shade }
    : null;
  return { category: cat.id, title: cat.title, sections, palette, narrow, specific };
}

// ---------- Presentation ----------

function describe(cls) {
  const { base } = splitTokenSimple(cls);
  const entry = lookup(base);
  if (entry) return { label: entry.label, css: shortCss(entry), color: colorOf(entry), pop: entry.pop };
  const s = synthEntry(base);
  if (s) return { label: s.label, css: s.desc, color: s.color, pop: 0 };
  const alpha = /^(.+)\/(\d{1,3})$/.exec(base);
  const under = alpha && lookup(alpha[1]);
  if (under) return { label: under.label, css: `${shortCss(under)} at ${alpha[2]}%`, color: colorOf(under), pop: 0 };
  return { label: '', css: '', color: null, pop: 0 };
}

function groupItems(items, vague) {
  const cap = vague ? 3 : 8;
  const order = [];
  const map = new Map();
  for (const it of items) {
    const key = it.label || 'Other';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(it);
  }
  return order.map((label) => ({ label, items: map.get(label).slice(0, cap), total: map.get(label).length }));
}

/**
 * Variant words and prefixes in a query: "hide on mobile" -> ids ["max-sm"].
 * "dark blue" is a shade; only "dark mode" or a lone "dark" is the variant.
 * "focus ring" and "focus outline" are ambiguous (the ring itself, or the ring
 * that appears on focus), so focus is not taken as a variant there:
 * `ambiguous` names it and the results carry both forms.
 */
export function readVariants(text) {
  const colorNames = [...FAMILIES, ...Object.keys(COLOR_ALIASES), ...SPECIAL].join('|');
  let raw = String(text || '').replace(/\btoo dark\b/gi, 'too darkshade').replace(new RegExp(`\\bdark(?=\\s+(?:${colorNames})\\b)`, 'gi'), 'darkshade');
  let ambiguous = null;
  raw = raw.replace(/\bfocus(?:[- ]visible)?\s+(ring|outline)\b/gi, (m, noun) => {
    ambiguous = m;
    return noun;
  });
  return { ...parseVariantWords(raw), ambiguous };
}

/** "focus ring": each of the top ring/outline results is followed by its focus: form. */
function interleaveFocus(out, phrase, ids) {
  const focus = stackPrefix([...ids, 'focus']);
  const items = [];
  let copies = 0;
  for (const it of out.items) {
    items.push(it);
    if (copies < 4 && it.prefix === stackPrefix(ids) && /^(ring|outline)/.test(it.base)) {
      copies++;
      items.push({ ...it, cls: `${focus}${it.base}`, prefix: focus, hint: 'with focus: so it applies while focused', score: it.score - 1 });
    }
  }
  out.items = items;
  out.ambiguity = { phrase, note: `"${phrase}" can mean the ${/outline/i.test(phrase) ? 'outline' : 'ring'} itself or the one that appears on focus, so both are listed` };
}

const empty = () => ({ items: [], groups: [], sections: [], browse: null, palette: null, variants: [], applied: '', appliesAs: '', hints: [], ambiguity: null });

/**
 * The search. Returns
 *   items     ranked, flat: { cls, base, prefix, label, css, color, hint, source, score }
 *   groups    the same items grouped by label (a few per group when vague)
 *   browse    { category, title, sections, palette } for category words
 *   palette   { prop, family, shade } when the query is about a color
 *   variants  variant ids from typed words and opts.variantIds
 *   applied   the prefix every result carries ("dark:hover:")
 *   hints     messages for the empty state or a missing target
 * opts: { used, classes (the target's classes), variantIds, limit, tag, kind ('inline' | 'block'), lastMove }
 */
export function search(query, opts = {}) {
  const { used = [], classes = [], variantIds = [], limit = 40 } = opts;
  const raw = String(query || '').trim();
  if (!raw) return { ...empty(), variants: canonicalOrder(variantIds), applied: stackPrefix(variantIds), appliesAs: appliesAs(variantIds) };

  const parsed = readVariants(raw);
  const ids = canonicalOrder([...new Set([...variantIds, ...parsed.ids])]);
  const prefix = stackPrefix(ids);
  const out = {
    ...empty(), variants: ids, applied: prefix, appliesAs: appliesAs(ids),
  };
  const restTokens = parsed.restTokens.map((t) => t.trim()).filter(Boolean);
  if (restTokens.length === 0) return out;

  const rest = restTokens.join(' ');
  const compact = norm(rest);
  const words = restTokens.map((t) => t.toLowerCase().replace(/[^a-z0-9%#().,\-]/g, '')).filter(Boolean);
  const pool = new Pool();
  const ctx = { palette: null };
  // Polite and filler words ("make it", "the", "a bit of") carry no styling meaning: the
  // word, color, CSS and phrase stages read the words without them.
  const spoken = wordsOf(rest);
  const fwords = stripFiller(spoken);
  const phrase = phraseOf(fwords);
  const target = { classes, prefix, kind: opts.kind || '', tag: opts.tag || '' };

  // 1. The class itself: exact, hyphen-joined words, or an arbitrary value.
  const typed = rest.replace(/\s+/g, '');
  if (lookup(typed) || synthEntry(typed)) pool.add(typed, TIER.exact, 'exact', 'class name');
  if (restTokens.length > 1) {
    const joined = words.join('-');
    if (lookup(joined)) pool.add(joined, TIER.exact - 50, 'exact', `matched: ${words.join(' ')}`);
  }
  const exactHit = pool.map.size > 0;

  // 2. Talk about the last change and about other elements: undo, "too big", "like the heading".
  const clause = exactHit ? null : parseClause(spoken);
  if (clause && clause.kind === 'reference') {
    out.reference = clause;
    return out;
  }
  if (clause && clause.kind === 'undo') {
    if (clause.which === 'again') {
      if (opts.lastMove && opts.lastMove.query) {
        const again = search(opts.lastMove.query, { ...opts, lastMove: null });
        again.items.forEach((it) => { it.hint = `again: ${it.hint}`; });
        return again;
      }
      out.hints.push('Nothing to repeat yet on this element.');
      return out;
    }
    const found = undoItems(clause, opts.lastMove, classes, prefix);
    found.forEach((u, i) => addBundle(pool, `undo:${i}`, 5600 - i * 10, 'undo', u));
    if (!found.length) out.hints.push(clause.which === 'too' ? `Nothing on this element to step back for "too ${clause.word}".` : 'Nothing to undo yet on this element.');
    return finish(out, pool, { ...target, ids, limit, undo: true });
  }

  // 3. Removing: "remove the padding" clears the groups on the target.
  if (clause && clause.kind === 'negation' && clause.verb === 'remove') {
    const gone = removeFor(clause.labels, classes, prefix);
    if (gone.length) addBundle(pool, `remove:${clause.noun}`, 4960, 'recipe', { tokens: [], removed: gone, title: `Remove the ${clause.noun}`, hint: gone.join(', ') });
  }
  const intensity = parseIntensity(fwords);
  const level = intensity.level;
  const spokenNoIntensity = stripFiller(intensity.rest.length ? intensity.rest : fwords);

  // 4. Relative words use the target's own classes.
  const relLabels = new Set();
  if (isRelative(words) || isRelative(fwords)) {
    const rel = relativeSuggestions(fwords, classes, prefix);
    rel.forEach((r, i) => { pool.add(r.cls, TIER.relative - i * 10, 'relative', r.hint, { keepPrefix: true }); if (r.label) relLabels.add(r.label); });
    if (rel.length === 0) out.hints.push('Relative words (bigger, more padding, darker) change the classes on the selected element. Select one that has classes first.');
  }

  // 5. Recipes: moods, archetypes, layouts and "less shouty", resolved against the target.
  const hasRelative = relLabels.size > 0;
  if (!exactHit && !hasRelative) {
    const compound = parseClauses(rest);
    if (compound.length > 1) compoundInto(pool, compound, target, level);
    const m = clause && clause.kind === 'negation' && clause.verb === 'less'
      ? { recipes: [RECIPE_BY_ID.get(clause.recipe)].filter(Boolean), exact: true }
      : matchRecipes(spokenNoIntensity);
    if (m && m.recipes.length) {
      const rctx = { classes, prefix, level, hedged: intensity.hedged, kind: target.kind };
      const main = resolveRecipes(m.recipes, rctx);
      if (!main && !alts0(m)) out.hints.push(`Nothing to change on this element for "${m.recipes[0].title.toLowerCase()}".`);
      if (main) addBundle(pool, `recipe:${m.recipes.map((r) => r.id).join('+')}`, 4850, 'recipe', { ...main, hint: describeDelta(main.tokens, main.removed), layout: m.recipes.some((r) => r.layout) });
      const alts = m.recipes[0].alts || [];
      if (m.recipes.length === 1) {
        alts.forEach((_, i) => {
          const r = resolveRecipes(m.recipes, rctx, i);
          if (r) addBundle(pool, `recipe:${m.recipes[0].id}:${i}`, 4830 - i * 10, 'recipe', { ...r, hint: describeDelta(r.tokens, r.removed) });
        });
      }
    }
  }

  // 6. Property and value, colors, words and phrases.
  cssInto(pool, fwords);
  colorInto(pool, ctx, fwords, rest);
  patternInto(pool, phrase);
  intentInto(pool, phrase);

  // A relative step answers the question for its group: the absolute intent rows of that
  // group, and any class already on the target, would only repeat or contradict it.
  if (hasRelative) {
    for (const c of pool.values()) {
      if (c.source !== 'intent') continue;
      const { base } = splitTokenSimple(c.cls);
      const e = lookup(base);
      if ((e && relLabels.has(e.label)) || classes.includes(c.cls) || classes.includes(`${prefix}${c.cls}`)) pool.delete(c.cls);
    }
  }

  // A bundle already carries its classes: the single-class intent rows of the same words would repeat them.
  const bundled = new Set(pool.values().filter((c) => c.bundle && c.bundle.length > 1).flatMap((c) => c.bundle));
  if (bundled.size) for (const c of pool.values()) if (!c.bundle && (c.source === 'intent' || c.source === 'name') && bundled.has(c.cls)) pool.delete(c.cls);

  // 7. Category words open a browse view and replace the fuzzy name tier.
  const browse = hasRelative ? null : browseFor(fwords);
  if (browse) {
    out.browse = browse;
    out.palette = ctx.palette || browse.palette;
    browse.sections.forEach((s, si) => s.entries.forEach((cls, i) => pool.add(cls, TIER.intent - 100 - si * 20 - i, 'browse', `${s.label}`)));
  } else {
    out.palette = ctx.palette;
    if (compact.length >= 2 && !hasRelative) fuzzyInto(pool, compact, /^-/.test(typed));
  }

  // 8. Classes already in the project.
  if (compact) usedInto(pool, used, compact, ids);

  return finish(out, pool, { ...target, ids, limit, browse, parsed });
}

// ---------- Recipe items ----------

const alts0 = (m) => m.recipes.length === 1 && (m.recipes[0].alts || []).length > 0;

/** Adds a bundle (several classes applied together, with what they replace) to the pool. */
function addBundle(pool, key, score, source, b) {
  const first = b.tokens[0] || `-${b.removed[0]}`;
  // A one-class bundle is an ordinary candidate: it replaces the pool entry of that class.
  const poolKey = b.tokens.length === 1 && source === 'recipe' ? first : key;
  pool.add(poolKey, score, source, b.hint, {
    cls: first, key, bundle: b.tokens, removed: b.removed, title: b.title, keepPrefix: true, layout: b.layout, delta: b.hint,
  });
}

/** "calmer and more elegant": every clause resolved in turn on one working list. */
function compoundInto(pool, clauses, t, level) {
  let list = [...t.classes];
  const titles = [];
  for (const words of clauses) {
    const c = parseClause(words);
    const inten = parseIntensity(stripFiller(words));
    const w = stripFiller(inten.rest.length ? inten.rest : words);
    if (c.kind === 'negation' && c.verb === 'remove') {
      const gone = removeFor(c.labels, list, t.prefix);
      if (!gone.length) return;
      list = list.filter((x) => !gone.includes(x));
      titles.push(`no ${c.noun}`);
      continue;
    }
    if (isRelative(w)) {
      const r = relativeSuggestions(w, list, t.prefix)[0];
      if (!r) return;
      list = addClass(list, r.cls);
      titles.push(w.join(' '));
      continue;
    }
    const m = c.kind === 'negation' && c.verb === 'less' ? { recipes: [RECIPE_BY_ID.get(c.recipe)].filter(Boolean) } : matchRecipes(w);
    if (!m || !m.recipes.length) return;
    const r = resolveRecipes(m.recipes, { classes: list, prefix: t.prefix, level: Math.max(level, inten.level), hedged: inten.hedged, kind: t.kind });
    if (!r) continue;
    list = r.final;
    titles.push(m.recipes.map((x) => x.title).join(' + '));
  }
  const tokens = list.filter((x) => !t.classes.includes(x));
  const removed = t.classes.filter((x) => !list.includes(x));
  if (!tokens.length && !removed.length) return;
  addBundle(pool, 'recipe:compound', 4880, 'recipe', { tokens, removed, title: titles.join(', '), hint: describeDelta(tokens, removed) });
}

// ---------- Output ----------

const LAYOUT_LABELS = new Set(['Display', 'Flex direction', 'Flex wrap', 'Grid template columns', 'Justify content', 'Align items', 'Align content']);

function finish(out, pool, t) {
  const { prefix, ids, limit, browse, parsed } = t;
  // Layout words on an inline selection (a span of text) would only break the line.
  if (t.kind === 'inline') {
    for (const c of pool.values()) {
      const e = lookup(splitTokenSimple(c.cls).base);
      if (c.layout || (c.source === 'intent' && e && LAYOUT_LABELS.has(e.label))) c.score -= 400;
    }
  }
  const ranked = pool.sorted().slice(0, limit);
  out.items = ranked.map((c) => {
    const { prefix: own, base } = splitTokenSimple(c.cls);
    if (c.bundle) {
      const shown = c.bundle.find((x) => describe(splitTokenSimple(x).base).color) || null;
      return {
        cls: c.cls, key: c.key, base, prefix, label: c.title, css: c.delta || '', color: shown ? describe(splitTokenSimple(shown).base).color : null,
        hint: c.hint, source: c.source, score: c.score, pop: 0, bundle: c.bundle, removed: c.removed, title: c.title,
      };
    }
    const full = c.keepPrefix || own ? c.cls : `${prefix}${c.cls}`;
    const d = describe(base);
    return {
      cls: full, base, prefix: c.keepPrefix ? own : (own || prefix), label: d.label, css: d.css, color: d.color,
      hint: c.hint, source: c.source, score: c.score, pop: d.pop,
    };
  });
  if (parsed && parsed.ambiguous && !ids.includes('focus')) interleaveFocus(out, parsed.ambiguous, ids);
  // Browse results also carry the variant prefix.
  if (browse) {
    for (const s of browse.sections) s.entries = s.entries.map((cls) => `${prefix}${cls}`);
  }
  const top = out.items[0];
  out.groups = groupItems(out.items, !top || top.score < TIER.prop);
  if (out.items.length === 0 && !out.browse && !out.palette && out.hints.length === 0) {
    out.hints.push('Try a class (p-4), a word (bold, center), a CSS value (padding 16px), a color (#3b82f6, light blue) or a variant (hover red, hide on mobile).');
  }
  return out;
}

/** Flat ranked list; the shape the dropdown has always consumed. */
export function searchClasses(query, opts = {}) {
  return search(query, opts).items.map((i) => ({ ...i, desc: i.css }));
}
