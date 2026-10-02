// Parses compiled Tailwind CSS once into an index of class name -> rules, so
// the Element panel can show "this class produced this CSS" without scanning
// the stylesheet on every hover. Handles Tailwind v4 output, which nests
// variants (&:hover, @media) inside the class rule.

function readString(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') j++;
    j++;
  }
  return j + 1;
}

// Returns { items, end }. An item is { decl } or { prelude, items }.
function parseItems(src, pos, nested) {
  const items = [];
  let buf = '';
  let paren = 0;
  let i = pos;
  const flush = () => {
    const text = buf.trim();
    if (text) items.push({ decl: text });
    buf = '';
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = readString(src, i);
      buf += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    if (paren === 0) {
      if (c === '{') {
        const inner = parseItems(src, i + 1, true);
        items.push({ prelude: buf.trim(), items: inner.items });
        buf = '';
        i = inner.end;
        continue;
      }
      if (c === ';') {
        flush();
        i++;
        continue;
      }
      if (c === '}') {
        if (!nested) { i++; continue; }
        flush();
        return { items, end: i + 1 };
      }
    }
    buf += c;
    i++;
  }
  flush();
  return { items, end: i };
}

function unescapeCssIdent(value) {
  return value
    .replace(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
}

const CLASS_AT_START = /^\.((?:\\[0-9a-fA-F]{1,6} ?|\\.|[A-Za-z0-9_-])+)/;

function classesOfSelector(selector) {
  const names = new Set();
  for (const part of selector.split(/,(?![^(]*\))/)) {
    const match = CLASS_AT_START.exec(part.trim());
    if (match) names.add(unescapeCssIdent(match[1]));
  }
  return names;
}

// Flatten one rule body into groups of declarations with the conditions
// (nested selectors, @media, @supports) they apply under.
function flatten(items, context, out) {
  const decls = [];
  for (const item of items) {
    if (item.decl !== undefined) {
      const colon = item.decl.indexOf(':');
      if (colon > 0) {
        const prop = item.decl.slice(0, colon).trim();
        decls.push({
          prop,
          value: item.decl.slice(colon + 1).trim(),
          internal: prop.startsWith('--tw-'),
        });
      }
    }
  }
  if (decls.length) out.push({ context, decls });
  for (const item of items) {
    if (item.prelude !== undefined) flatten(item.items, [...context, item.prelude], out);
  }
  return out;
}

function walk(items, context, byClass) {
  for (const item of items) {
    if (item.prelude === undefined) continue;
    if (item.prelude.startsWith('@')) {
      const at = item.prelude.split(/\s/)[0];
      if (at === '@layer') walk(item.items, context, byClass);
      else if (at === '@media' || at === '@supports') walk(item.items, [...context, item.prelude], byClass);
      continue;
    }
    for (const name of classesOfSelector(item.prelude)) {
      if (!byClass.has(name)) byClass.set(name, []);
      byClass.get(name).push({ selector: item.prelude, context, items: item.items });
    }
  }
}

/**
 * Build a lookup over compiled CSS. `rulesFor(className)` returns an array of
 * { selector, groups: [{ context: string[], decls: [{ prop, value, internal }] }] }.
 */
export function buildCssIndex(css) {
  const byClass = new Map();
  if (css) walk(parseItems(css, 0, false).items, [], byClass);
  const cache = new Map();
  return {
    size: byClass.size,
    has: (name) => byClass.has(name),
    rulesFor(name) {
      if (cache.has(name)) return cache.get(name);
      const rules = (byClass.get(name) || []).map((rule) => ({
        selector: rule.selector,
        groups: flatten(rule.items, rule.context, []),
      }));
      cache.set(name, rules);
      return rules;
    },
  };
}
