// "remove the padding": the classes on the target that belong to the named groups.

import { lookup } from './catalogStore';
import { splitTokenSimple } from './tokens';
import { normalizePrefix } from './variants';

/** Classes under `prefix` whose catalog group label is in `labels`. */
export function removeFor(labels, classes, prefix = '') {
  const want = normalizePrefix(prefix || '');
  const set = new Set(labels);
  return (classes || []).filter((t) => {
    const { prefix: p, base } = splitTokenSimple(t);
    if (normalizePrefix(p || '') !== want) return false;
    const e = lookup(base);
    return e && set.has(e.label);
  });
}
