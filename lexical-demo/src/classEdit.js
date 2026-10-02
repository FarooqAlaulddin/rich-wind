// Pure helpers for editing a list of class tokens. A token is a class with
// optional variant prefixes ("hover:md:p-4"). Two tokens conflict when they
// share the same variant prefix and the same utility group, so p-6 replaces
// p-4 and hover:p-6 replaces hover:p-4, but px-2 and p-4 coexist.

import { splitToken, groupOf } from './classCatalog';

export function splitClasses(value) {
  return String(value || '').split(/\s+/).filter(Boolean);
}

/** { prefix, group } for a token, or null when it has no known group. */
export function groupKeyOf(token) {
  const { prefix, base } = splitToken(token);
  const group = groupOf(base);
  return group ? { prefix, group } : null;
}

function sameGroup(a, b) {
  return !!a && !!b && a.prefix === b.prefix && a.group === b.group;
}

/** Adds `token`, replacing any class from the same group and variant. */
export function addClass(classes, token) {
  if (!token) return classes;
  if (classes.includes(token)) return classes;
  const key = groupKeyOf(token);
  if (!key) return [...classes, token];
  const out = [];
  let placed = false;
  for (const c of classes) {
    if (sameGroup(groupKeyOf(c), key)) {
      if (!placed) { out.push(token); placed = true; }
    } else {
      out.push(c);
    }
  }
  if (!placed) out.push(token);
  return out;
}

export function removeClass(classes, token) {
  return classes.filter((c) => c !== token);
}

/** Removes every class in `group` under exactly `prefix`. */
export function removeGroup(classes, prefix, group) {
  return classes.filter((c) => !sameGroup(groupKeyOf(c), { prefix, group }));
}

/** The class currently set for `group` under `prefix`, or null. */
export function currentInGroup(classes, prefix, group) {
  let found = null;
  for (const c of classes) {
    if (sameGroup(groupKeyOf(c), { prefix, group })) found = c;
  }
  return found;
}
