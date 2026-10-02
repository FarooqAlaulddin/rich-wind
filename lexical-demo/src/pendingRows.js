// What a hovered card would change, as rows for the element panel: classes that
// would be added or replaced, with the declarations the class catalog lists for
// them. This is a preview from the static catalog, not compiler output.

import { addClass } from './classEdit';
import { entryFor, splitToken, normalizePrefix } from './classCatalog';
import { synthEntry } from './search/cssQuery';

const SHOWN = 3;

function cssOf(token) {
  const { base } = splitToken(token);
  const entry = entryFor(base) || synthEntry(base);
  if (!entry || !entry.d || entry.d.length === 0) return '';
  const real = entry.d.filter(([p]) => !p.startsWith('--tw-'));
  const list = real.length ? real : entry.d;
  const text = list.slice(0, SHOWN).map(([p, v]) => `${p}: ${v}`).join('; ');
  return list.length > SHOWN ? `${text}; ...` : text;
}

/** [{ sign: '+' | '-', cls, css }] for adding `tokens` (and dropping `removed`) on `classes`. */
export function pendingRows(classes, tokens, removed = []) {
  const list = tokens.map((t) => {
    const { prefix, base } = splitToken(t);
    return normalizePrefix(prefix) + base;
  });
  let next = classes.filter((c) => !removed.includes(c));
  next = list.reduce(addClass, next);
  const rows = [];
  for (const c of classes) if (!next.includes(c)) rows.push({ sign: '-', cls: c, css: '' });
  for (const c of next) if (!classes.includes(c)) rows.push({ sign: '+', cls: c, css: cssOf(c) });
  return rows;
}
