// Binds repair.js to the demo's catalog. Kept apart so repair.js stays pure.
import { lookup, allEntries } from '../search/catalogStore';
import { synthEntry } from '../search/cssQuery';
import { isKnownBase, groupOf } from '../classCatalog';
import { addClass } from '../classEdit';
import { completePairs } from '../search/pairs';

let byStem = null;
function stemIndex() {
  if (byStem) return byStem;
  byStem = new Map();
  for (const e of allEntries()) {
    const i = e.cls.lastIndexOf('-');
    if (i <= 0 || e.cls.includes(':') || e.cls.includes('[')) continue;
    const stem = e.cls.slice(0, i);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(e.cls.slice(i + 1));
  }
  return byStem;
}

/** previewDeclsOf is passed in because it needs the DOM-bound hook module. */
export function repairContext({ classes, selected = [], protects = [], drawable }) {
  return {
    classes,
    selected,
    protects,
    isValid: (b) => !!(lookup(b) || synthEntry(b) || isKnownBase(b)),
    valuesOf: (stem) => stemIndex().get(stem) || [],
    groupOf,
    addClass,
    pairs: completePairs,
    drawable,
  };
}
