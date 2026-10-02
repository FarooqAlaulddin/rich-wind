// The class catalog at runtime. A small seed (catalogSeed.js) is in the main
// bundle so search works at once; the full catalog (catalogData.js, every
// Tailwind class with its resolved CSS) is a lazy chunk that replaces it as
// soon as it arrives. Everything here is synchronous after that.
//
// Entry: { cls, norm, neg, stem, val, label, key, group, pop, d } where `d`
// is the index of the declaration string. declsOf(entry) gives [[prop, value]].

import seed from '../catalogSeed';
import { popularity } from '../searchPopularity';

/** Conflict groups the picker already names; every other class is keyed by its CSS properties. */
const GROUP_BY_KEY = { display: 'display', 'flex-direction': 'flex-dir' };

const COLOR_LABEL = /color$|^Fill$|^Stroke$|^Gradient (from|via|to)$|^Divide$/;
const COLOR_VALUE = /^(?:oklch|#|rgb|hsl|color-mix)|^(?:transparent|currentcolor)$/;

let store = null;
let full = false;
let loading = null;
const listeners = new Set();

function build(data) {
  const colors = data.colors;
  const labels = data.groups.map((g) => g[0]);
  const keys = data.groups.map((g) => g[1]);
  const names = data.n.split(' ');
  const entries = new Array(names.length);
  const byCls = new Map();
  for (let i = 0; i < names.length; i++) {
    const cls = names[i];
    const neg = cls.charCodeAt(0) === 45;
    const core = neg ? cls.slice(1) : cls;
    const j = core.lastIndexOf('-');
    const stem = j > 0 ? core.slice(0, j) : core;
    const val = j > 0 ? core.slice(j + 1) : '';
    const g = data.g[i];
    const label = labels[g];
    const key = keys[g];
    const entry = {
      cls,
      norm: cls.toLowerCase().replace(/[^a-z0-9]/g, ''),
      neg,
      stem,
      val,
      label,
      key,
      group: GROUP_BY_KEY[key] || `css:${key}`,
      pop: popularity(stem, val, label, neg),
      d: data.d[i],
    };
    entries[i] = entry;
    byCls.set(cls, entry);
  }
  return {
    data, colors, entries, byCls, decls: data.decls, pairs: new Map(), views: new Map(),
    byLabel: null, props: null, variants: data.variants, compound: data.compound, version: data.v,
  };
}

function ensure() {
  if (!store) store = build(seed);
  return store;
}

/** Starts loading the full catalog once; resolves when the index is swapped in. */
export function loadFullCatalog() {
  if (full) return Promise.resolve();
  if (!loading) {
    loading = import('../catalogData').then((m) => {
      store = build(m.default);
      full = true;
      listeners.forEach((fn) => fn());
    }).catch(() => { loading = null; });
  }
  return loading;
}

export function isFullCatalog() { return full; }

/** Calls `fn` when the full catalog replaces the seed. Returns an unsubscribe function. */
export function onCatalogChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function allEntries() { return ensure().entries; }
export function lookup(cls) { return ensure().byCls.get(cls); }
export function catalogVersion() { return ensure().version; }

/** [[prop, value]] of an entry, theme variables already resolved. */
export function declsOf(entry) {
  const s = ensure();
  let pairs = s.pairs.get(entry.d);
  if (!pairs) {
    const text = s.decls[entry.d].replace(/~(\d+)~/g, (_, n) => s.colors[Number(n)]);
    pairs = text.split(';').map((p) => {
      const at = p.indexOf(':');
      return [p.slice(0, at), p.slice(at + 1)];
    });
    s.pairs.set(entry.d, pairs);
  }
  return pairs;
}

/** Declarations that are real CSS (no --tw-* plumbing). */
export function realDecls(entry) {
  return declsOf(entry).filter(([p]) => !p.startsWith('--'));
}

/** Swatch color of a color class, or null. */
export function colorOf(entry) {
  if (!COLOR_LABEL.test(entry.label)) return null;
  for (const [, v] of declsOf(entry)) if (COLOR_VALUE.test(v)) return v;
  return null;
}

/** 1rem -> "16px"; null when the value has no rem/em length to convert. */
export function pxNote(value) {
  const m = /^(-?\d*\.?\d+)(rem|em)$/.exec(value);
  if (!m) return null;
  const px = Math.round(parseFloat(m[1]) * 16 * 100) / 100;
  return `${px}px`;
}

/** Short one-line CSS: "padding: 1rem (16px)". */
export function shortCss(entry, max = 2) {
  const real = realDecls(entry);
  const shown = (real.length ? real : declsOf(entry)).slice(0, max);
  const text = shown.map(([p, v]) => {
    const note = pxNote(v);
    const val = v.length > 48 ? `${v.slice(0, 45)}...` : v;
    return `${p}: ${val}${note ? ` (${note})` : ''}`;
  }).join('; ');
  return real.length > max ? `${text}; ...` : text;
}

/** Entry in the shape the picker and the hover preview use: { cls, group, d: [[prop, value]], desc, color }. */
export function entryFor(base) {
  const s = ensure();
  const entry = s.byCls.get(base);
  if (!entry) return undefined;
  let view = s.views.get(base);
  if (!view) {
    view = {
      cls: base,
      group: entry.group,
      label: entry.label,
      d: realDecls(entry).length ? realDecls(entry) : declsOf(entry),
      desc: shortCss(entry),
      color: colorOf(entry),
      norm: entry.norm,
    };
    s.views.set(base, view);
  }
  return view;
}

/** Entries of one group label. */
export function entriesOfLabel(label) {
  const s = ensure();
  if (!s.byLabel) {
    s.byLabel = new Map();
    for (const e of s.entries) {
      if (!s.byLabel.has(e.label)) s.byLabel.set(e.label, []);
      s.byLabel.get(e.label).push(e);
    }
  }
  return s.byLabel.get(label) || [];
}

export function allLabels() {
  ensure();
  entriesOfLabel('');
  return [...store.byLabel.keys()];
}

/** Map from CSS property to [{ entry, value }] for the property/value search. Built on first use. */
export function propertyIndex() {
  const s = ensure();
  if (!s.props) {
    s.props = new Map();
    for (const e of s.entries) {
      for (const [p, v] of declsOf(e)) {
        if (p.startsWith('--')) continue;
        let list = s.props.get(p);
        if (!list) { list = []; s.props.set(p, list); }
        list.push({ entry: e, value: v });
      }
    }
  }
  return s.props;
}

/** Variant names from the design system, plus the values of max/min. */
export function variantData() {
  const s = ensure();
  return { names: s.variants, compound: s.compound };
}
