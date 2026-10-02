// Regenerates the class catalog from the installed Tailwind design system:
//   src/catalogData.js  every class: group label, conflict key, resolved CSS
//   src/catalogSeed.js  a small subset kept in the main bundle (degraded search)
// Run from lexical-demo/: node scripts/gen-catalog.mjs
// (npm run gen:catalog). Do not edit the outputs by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';

const require = createRequire(import.meta.url);
const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
const twVersion = JSON.parse(readFileSync(path.join(twDir, 'package.json'), 'utf8')).version;
const css = readFileSync(path.join(twDir, 'index.css'), 'utf8');
const theme = readFileSync(path.join(twDir, 'theme.css'), 'utf8');

// ---------- Theme variables ----------

const themeVars = new Map();
for (const m of theme.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  themeVars.set(m[1], m[2].replace(/\s+/g, ' ').trim());
}

// ---------- CSS scanning ----------

/** Parses the body of a block into { decls: [[prop, value]], rules: [{ sel, body }] }. */
function parseBlock(body) {
  const decls = [];
  const rules = [];
  let i = 0;
  while (i < body.length) {
    let depth = 0;
    let j = i;
    let brace = -1;
    let semi = -1;
    for (; j < body.length; j++) {
      const c = body[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (depth === 0 && c === '{') { brace = j; break; }
      else if (depth === 0 && c === ';') { semi = j; break; }
    }
    if (brace >= 0) {
      let d = 1;
      let k = brace + 1;
      for (; k < body.length && d > 0; k++) {
        if (body[k] === '{') d++;
        else if (body[k] === '}') d--;
      }
      rules.push({ sel: body.slice(i, brace).trim(), body: body.slice(brace + 1, k - 1) });
      i = k;
    } else {
      const end = semi >= 0 ? semi : body.length;
      const text = body.slice(i, end).trim();
      const colon = text.indexOf(':');
      if (colon > 0) decls.push([text.slice(0, colon).trim(), text.slice(colon + 1).trim()]);
      i = end + 1;
    }
  }
  return { decls, rules };
}

// ---------- Value resolution ----------

const MARK = '\u0001';
// var(--tw-gradient-stops) has no value on its own: it is filled in by the
// from/via/to classes. It is kept as readable text instead of being dropped.
const STOPS = '\u0002';

function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')' && --d === 0) return i;
  }
  return -1;
}

function splitTopComma(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') d--;
    else if (s[i] === ',' && d === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }
  return [s.trim(), null];
}

function resolveVars(value, local, depth = 0) {
  if (depth > 12) return value;
  let out = value;
  for (let guard = 0; guard < 60; guard++) {
    const at = out.indexOf('var(');
    if (at < 0) break;
    const close = matchParen(out, at + 3);
    if (close < 0) break;
    const [name, fallback] = splitTopComma(out.slice(at + 4, close));
    let rep;
    if (local.has(name)) rep = resolveVars(local.get(name), local, depth + 1);
    else if (!name.startsWith('--tw-') && themeVars.has(name)) rep = resolveVars(themeVars.get(name), local, depth + 1);
    else if (fallback !== null) rep = resolveVars(fallback, local, depth + 1);
    else if (name === '--tw-gradient-stops') rep = STOPS;
    else rep = MARK;
    out = out.slice(0, at) + rep + out.slice(close + 1);
  }
  return out;
}

function fmt(n) {
  return String(Math.round(n * 10000) / 10000);
}

function evalCalc(expr) {
  const toks = expr.match(/-?\d*\.?\d+(?:e-?\d+)?[a-z%]*|[*/+-]/gi);
  if (!toks || toks.join('').replace(/\s/g, '').length < expr.replace(/\s/g, '').length) return null;
  const num = (t) => {
    const m = /^(-?\d*\.?\d+(?:e-?\d+)?)([a-z%]*)$/i.exec(t);
    return m ? { v: parseFloat(m[1]), u: m[2] } : null;
  };
  let cur = num(toks[0]);
  if (!cur) return null;
  const terms = [];
  let op = '+';
  for (let i = 1; i < toks.length; i += 2) {
    const o = toks[i];
    const rhs = num(toks[i + 1]);
    if (!rhs || !'*/+-'.includes(o)) return null;
    if (o === '*') {
      if (cur.u && rhs.u) return null;
      cur = { v: cur.v * rhs.v, u: cur.u || rhs.u };
    } else if (o === '/') {
      if (rhs.u || rhs.v === 0) return null;
      cur = { v: cur.v / rhs.v, u: cur.u };
    } else {
      terms.push([op, cur]);
      op = o;
      cur = rhs;
    }
  }
  terms.push([op, cur]);
  const unit = terms[0][1].u;
  let sum = 0;
  for (const [o, t] of terms) {
    if (t.u !== unit) return null;
    sum += o === '-' ? -t.v : t.v;
  }
  return fmt(sum) + unit;
}

function foldCalc(value) {
  let out = value;
  for (let guard = 0; guard < 40; guard++) {
    const m = /calc\(([^()]*)\)/.exec(out);
    if (!m) break;
    const r = evalCalc(m[1]);
    out = out.slice(0, m.index) + (r === null ? `calc${MARK}(${m[1]})` : r) + out.slice(m.index + m[0].length);
  }
  return out.replaceAll(`calc${MARK}(`, 'calc(');
}

function cleanup(value) {
  let v = value.replaceAll('calc(infinity * 1px)', '9999px');
  if (v.includes(MARK)) {
    // Drop list entries, then words, that referenced an undefined variable.
    v = v.split(/,(?![^(]*\))/).map((p) => p.trim()).filter((p) => p && p !== MARK).join(', ');
    v = v.replaceAll(MARK, '');
  }
  return v.replaceAll(STOPS, 'var(--tw-gradient-stops)').replace(/\s+/g, ' ').trim();
}

/** Inside calc(), an undefined --tw-* variable takes its @property initial value. */
function prefillCalc(value, local, inits) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('calc(', i);
    if (at < 0) { out += value.slice(i); break; }
    const close = matchParen(value, at + 4);
    if (close < 0) { out += value.slice(i); break; }
    const inner = value.slice(at, close + 1).replace(/var\((--tw-[\w-]+)\)/g, (m, n) => (
      local.has(n) ? local.get(n) : inits.has(n) ? inits.get(n) : m));
    out += value.slice(i, at) + inner;
    i = close + 1;
  }
  return out;
}

/** Resolved declarations of one rule body: theme variables and --tw-* locals substituted. */
function resolveDecls(decls, inits) {
  const local = new Map(decls.filter(([p]) => p.startsWith('--tw-')).map(([p, v]) => [p, prefillCalc(v, new Map(), inits)]));
  const rawProps = decls.map(([p]) => p);
  const out = [];
  for (const [p, v] of decls) {
    if (p.startsWith('--tw-')) continue;
    const r = cleanup(foldCalc(resolveVars(prefillCalc(v, local, inits), local)));
    if (r && !/^[\s,]*$/.test(r)) out.push([p, r]);
  }
  if (out.length === 0) {
    for (const [p, v] of decls) {
      const r = cleanup(foldCalc(resolveVars(prefillCalc(v, new Map(), inits), new Map())));
      if (r && !/^[\s,]*$/.test(r)) out.push([p, r]);
    }
  }
  return { out, rawProps };
}

// ---------- Labels ----------

const TITLE_FIX = { 'Box shadow': 'Shadow' };
const title = (s) => {
  const t = s.replace(/^-webkit-|^-moz-/, '').replace(/^--tw-/, '').replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const STEM_LABELS = [
  [/^line-clamp-/, 'Line clamp'],
  [/^-?space-/, 'Space between'],
  [/^divide-/, 'Divide'],
  [/^(?:-)?(?:from|via|to)-/, null],
];
const TW_LABELS = [
  ['--tw-ring-color', 'Ring color'], ['--tw-ring-shadow', 'Ring'], ['--tw-inset-ring-color', 'Inset ring color'],
  ['--tw-inset-ring-shadow', 'Inset ring'], ['--tw-shadow-color', 'Shadow color'], ['--tw-inset-shadow-color', 'Inset shadow color'],
  ['--tw-inset-shadow', 'Inset shadow'], ['--tw-shadow', 'Shadow'], ['--tw-gradient-from', 'Gradient from'],
  ['--tw-gradient-via', 'Gradient via'], ['--tw-gradient-to', 'Gradient to'], ['--tw-gradient-position', 'Gradient direction'],
  ['--tw-ring-offset-width', 'Ring offset'], ['--tw-ring-offset-color', 'Ring offset color'],
];
const PROP_LABELS = [
  [/^padding(-|$)/, 'Padding'], [/^margin(-|$)/, 'Margin'], [/^(inset|top|right|bottom|left)(-|$)/, 'Inset'],
  [/^(width|min-width|max-width|inline-size|min-inline-size|max-inline-size)$/, 'Width'],
  [/^(height|min-height|max-height|block-size|min-block-size|max-block-size)$/, 'Height'],
  [/^border(-[a-z]+)*-width$/, 'Border width'], [/^border(-[a-z]+)*-color$/, 'Border color'],
  [/^border(-[a-z]+)*-radius$/, 'Border radius'], [/^border-style$/, 'Border style'], [/^(gap|row-gap|column-gap)$/, 'Gap'],
  [/^color$/, 'Text color'], [/^background-color$/, 'Background color'], [/^outline-color$/, 'Outline color'],
  [/^overflow(-[xy])?$/, 'Overflow'], [/^overscroll-behavior(-[xy])?$/, 'Overscroll'],
  [/^scroll-(padding|margin)/, 'Scroll spacing'], [/^(transition|transition-property)$/, 'Transition'],
];

function labelFor(cls, rawProps, resolvedProps) {
  for (const [re, label] of STEM_LABELS) if (label && re.test(cls)) return label;
  const real = rawProps.filter((p) => !p.startsWith('--tw-'));
  const tw = rawProps.filter((p) => p.startsWith('--tw-'));
  for (const [p, label] of TW_LABELS) if (tw.includes(p)) {
    if (p === '--tw-shadow' && real.length && !real.includes('box-shadow')) break;
    return label;
  }
  const props = real.length ? real : (resolvedProps.length ? resolvedProps : tw);
  const widthProp = props.find((p) => /^border(-[a-z]+)*-width$/.test(p));
  if (widthProp && !real.includes('border-color')) return 'Border width';
  if (props.length === 0) return 'Other';
  if (props.includes('width') && props.includes('height')) return 'Size';
  const first = props[0];
  for (const [re, label] of PROP_LABELS) if (re.test(first)) return label;
  const t = title(first);
  return TITLE_FIX[t] || t;
}

// ---------- Build ----------

const ds = await __unstable__loadDesignSystem(css, { base: twDir });
const classNames = ds.getClassList().map((c) => (Array.isArray(c) ? c[0] : c));
const unique = [...new Set(classNames)];

const groups = [];
const groupIndex = new Map();
const decls = [];
const declIndex = new Map();
const rows = [];
let skipped = 0;
// oklch() literals repeat across thousands of decls: stored once, referenced as ~index~.
const colors = [];
const colorIndex = new Map();
const packColors = (text) => text.replace(/oklch\([^)]*\)/g, (m) => {
  if (!colorIndex.has(m)) { colorIndex.set(m, colors.length); colors.push(m); }
  return `~${colorIndex.get(m)}~`;
});

const BATCH = 500;
for (let i = 0; i < unique.length; i += BATCH) {
  const slice = unique.slice(i, i + BATCH);
  const outs = ds.candidatesToCss(slice);
  slice.forEach((cls, k) => {
    const text = outs[k];
    if (!text) { skipped++; return; }
    // Main rule: first top-level rule that is not an at-rule.
    const top = parseBlock(text);
    const main = top.rules.find((r) => r.sel.startsWith('.'));
    if (!main) { skipped++; return; }
    let block = parseBlock(main.body);
    if (block.decls.length === 0 && block.rules.length) block = parseBlock(block.rules[0].body);
    if (block.decls.length === 0) { skipped++; return; }
    const inits = new Map();
    for (const r of top.rules) {
      const m = /^@property\s+(--[\w-]+)/.exec(r.sel);
      const iv = m && /initial-value:\s*([^;]+)/.exec(r.body);
      if (iv) inits.set(m[1], iv[1].trim());
    }
    const { out, rawProps } = resolveDecls(block.decls, inits);
    if (out.length === 0) { skipped++; return; }
    const label = labelFor(cls, rawProps, out.map(([p]) => p));
    const key = [...new Set(rawProps)].sort().join(',');
    const gk = `${label}\u0000${key}`;
    if (!groupIndex.has(gk)) { groupIndex.set(gk, groups.length); groups.push([label, key]); }
    const dtext = packColors(out.map(([p, v]) => `${p}:${v}`).join(';'));
    if (!declIndex.has(dtext)) { declIndex.set(dtext, decls.length); decls.push(dtext); }
    rows.push([cls, groupIndex.get(gk), declIndex.get(dtext)]);
  });
}

// ---------- Variants ----------

const variantList = ds.getVariants();
const variantNames = variantList.filter((v) => !v.isArbitrary || v.values.length === 0 || ['max', 'min'].includes(v.name)).map((v) => v.name);
const compound = {};
for (const v of variantList) {
  if (['max', 'min'].includes(v.name)) compound[v.name] = v.values.filter((x) => /^(sm|md|lg|xl|2xl)$/.test(x));
}
const allVariants = [...new Set(variantList.map((v) => v.name))];

const header = (what) => `// Generated by scripts/gen-catalog.mjs from tailwindcss ${twVersion}. Do not edit by hand.\n// ${what}\n\n`;
// Columns, not row objects: one space-joined name string plus two integer arrays.
const pack = (list) => ({ n: list.map((r) => r[0]).join(' '), g: list.map((r) => r[1]), d: list.map((r) => r[2]) });
const data = { v: twVersion, colors, groups, decls, ...pack(rows), variants: allVariants, compound };

writeFileSync(
  new URL('../src/catalogData.js', import.meta.url),
  `${header('n: space-joined class names; g, d: per-class group and decl index; groups: [label, conflict key]; decls: "prop:value;prop:value" with ~n~ = colors[n].')}export default ${JSON.stringify(data)};\n`,
);
console.log(`classes: ${rows.length} (skipped ${skipped}), groups: ${groups.length}, decls: ${decls.length}, variants: ${allVariants.length}`);

// ---------- Seed ----------

const { seedClasses } = await import('./seedList.mjs');
const wanted = await seedClasses(rows, groups);
const seedRows = rows.filter((r) => wanted.has(r[0]));
const sg = []; const sgi = new Map(); const sd = []; const sdi = new Map();
const outRows = seedRows.map(([cls, g, d]) => {
  if (!sgi.has(g)) { sgi.set(g, sg.length); sg.push(groups[g]); }
  if (!sdi.has(d)) { sdi.set(d, sd.length); sd.push(decls[d]); }
  return [cls, sgi.get(g), sdi.get(d)];
});
const seed = { v: twVersion, colors, groups: sg, decls: sd, ...pack(outRows), variants: allVariants, compound };
writeFileSync(
  new URL('../src/catalogSeed.js', import.meta.url),
  `${header('Small subset kept in the main bundle so search works before catalogData.js loads.')}export default ${JSON.stringify(seed)};\n`,
);
console.log(`seed classes: ${outRows.length}`);
