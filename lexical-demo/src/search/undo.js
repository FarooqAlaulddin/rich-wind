// Undo talk: "too much", "undo that", "too big". Deterministic, driven by the
// shelf's lastMove for the target ({ added, removed, query }), never a model.

import { lookup } from './catalogStore';
import { scrubClass, scalePosition } from './relative';
import { splitTokenSimple } from './tokens';
import { normalizePrefix } from './variants';
import { groupOf } from '../classCatalog';

/** Phrases that put everything back, as opposed to "a bit less". */
export const FULL_UNDO = new Set(['undo', 'undo that', 'undo it', 'never mind', 'nevermind', 'go back', 'revert', 'scratch that', 'that was better']);

const baseOf = (t) => splitTokenSimple(t).base;
const inClasses = (classes, t) => classes.includes(t);

function sameGroup(a, b) {
  const ga = groupOf(baseOf(a));
  return ga && ga === groupOf(baseOf(b)) && normalizePrefix(splitTokenSimple(a).prefix) === normalizePrefix(splitTokenSimple(b).prefix);
}

/** Step back toward what was replaced; a class that replaced nothing is removed. */
function stepBack(last, classes) {
  const tokens = [];
  const removed = [];
  for (const a of last.added || []) {
    if (!inClasses(classes, a)) continue;
    const r = (last.removed || []).find((x) => sameGroup(x, a));
    if (!r) { removed.push(a); continue; }
    const pa = scalePosition(a);
    const pr = scalePosition(r);
    const dir = pa && pr && pa.size === pr.size ? Math.sign(pr.index - pa.index) : 0;
    const to = dir ? scrubClass(a, dir) : null;
    removed.push(a);
    tokens.push(to || r);
  }
  return { tokens, removed };
}

function fullUndo(last, classes) {
  const removed = (last.added || []).filter((t) => inClasses(classes, t));
  const tokens = (last.removed || []).filter((t) => !inClasses(classes, t));
  return { tokens, removed };
}

/**
 * Items for an undo clause.
 * clause: { which: 'back' | 'too', phrase?, word?, labels?, dir? }
 * -> [{ tokens, removed, title, hint }]
 */
export function undoItems(clause, last, classes, prefix = '') {
  const out = [];
  if (clause.which === 'too') {
    const want = normalizePrefix(prefix || '');
    for (const t of classes) {
      const { prefix: p, base } = splitTokenSimple(t);
      if (normalizePrefix(p || '') !== want) continue;
      const e = lookup(base);
      if (!e || !clause.labels.includes(e.label)) continue;
      const to = scrubClass(t, clause.dir);
      if (to) out.push({ tokens: [to], removed: [t], title: `Too ${clause.word}: back one step`, hint: `${t} -> ${to}` });
    }
    return out;
  }
  if (!last || !((last.added && last.added.length) || (last.removed && last.removed.length))) return [];
  const full = fullUndo(last, classes);
  if (FULL_UNDO.has(clause.phrase)) {
    if (full.tokens.length || full.removed.length) out.push({ ...full, title: 'Undo the last change', hint: 'puts back what it replaced' });
    return out;
  }
  const back = stepBack(last, classes);
  if (back.tokens.length || back.removed.length) out.push({ ...back, title: 'A bit less', hint: 'one step back toward before' });
  if (full.tokens.length || full.removed.length) out.push({ ...full, title: 'Undo the last change', hint: 'puts back what it replaced' });
  return out;
}
