// Turns raw model output into class lists the demo can trust. Pure: the caller
// passes the catalog checks in, so this runs under node with no DOM.
//
//   repairVariation(raw, ctx) -> { ok, add, remove, final, label, why, dropped } | { ok:false, reason }
//
// ctx: { classes, selected (variants the user picked, e.g. ['md']), protects (group names),
//        isValid(base), valuesOf(stem) -> string[], groupOf(base), addClass(list, tok),
//        drawable(tokens), pairs(list) }

const ALIASES = [
  [/^bg-gradient-to-(.+)$/, 'bg-linear-to-$1'],
  [/^break-words$/, 'wrap-break-word'],
  [/^flex-shrink-0$/, 'shrink-0'],
  [/^flex-shrink$/, 'shrink'],
  [/^flex-grow$/, 'grow'],
  [/^flex-grow-0$/, 'grow-0'],
  [/^text-grey-(.+)$/, 'text-gray-$1'],
  [/^bg-grey-(.+)$/, 'bg-gray-$1'],
  [/^border-grey-(.+)$/, 'border-gray-$1'],
  [/^border-1$/, 'border'],
  [/^ring-3$/, 'ring-2'],
  [/^rounded$/, 'rounded-sm'],
  [/^shadow-small$/, 'shadow-sm'],
  [/^shadow-medium$/, 'shadow-md'],
  [/^shadow-large$/, 'shadow-lg'],
];

export const FORBIDDEN = new Set(['hidden', 'sr-only', 'invisible', 'opacity-0', 'absolute', 'fixed', 'w-screen', 'h-screen']);

export function aliasOf(base) {
  for (const [re, to] of ALIASES) if (re.test(base)) return base.replace(re, to);
  return base;
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

/** Splits "bg-white rounded-lg, p-4" into single lower-case tokens. */
export function splitItems(items) {
  return (Array.isArray(items) ? items : [])
    .flatMap((s) => String(s || '').toLowerCase().split(/[\s,]+/))
    .filter(Boolean);
}

function splitVariant(tok) {
  const i = tok.lastIndexOf(':');
  return i < 0 ? { prefix: '', base: tok } : { prefix: tok.slice(0, i + 1), base: tok.slice(i + 1) };
}

/** One token to a valid base class, or null (dropped). */
export function repairToken(tok, ctx) {
  const { base } = splitVariant(tok); // variants are dropped; the user's scope decides them
  if (!base || base.includes('[')) return null;
  if (ctx.isValid(base)) return base;
  const aliased = aliasOf(base);
  if (aliased !== base && ctx.isValid(aliased)) return aliased;
  // Stem repair: only within the same stem, small distance.
  const cut = base.lastIndexOf('-');
  if (cut > 0) {
    const stem = base.slice(0, cut);
    const val = base.slice(cut + 1);
    let best = null;
    let bestD = 3;
    for (const v of ctx.valuesOf(stem) || []) {
      const d = editDistance(val, v);
      if (d < bestD) { bestD = d; best = `${stem}-${v}`; }
    }
    if (best && bestD <= 2 && val.length >= 3) return best;
  }
  return null;
}

export function repairVariation(raw, ctx) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'malformed' };
  const dropped = [];
  const add = [];
  for (const t of splitItems(raw.add)) {
    const fixed = repairToken(t, ctx);
    if (fixed) { if (!add.includes(fixed)) add.push(fixed); } else dropped.push(t);
  }
  const withPairs = ctx.pairs ? ctx.pairs(add) : add;
  if (!withPairs.length) return { ok: false, reason: 'empty', dropped };
  if (withPairs.length > 7) return { ok: false, reason: 'too-many', dropped };
  for (const t of withPairs) if (FORBIDDEN.has(t)) return { ok: false, reason: 'forbidden', dropped };

  const current = ctx.classes || [];
  const remove = splitItems(raw.remove).filter((t) => current.includes(t));

  let final = current.filter((c) => !remove.includes(c));
  for (const t of withPairs) final = ctx.addClass(final, t);

  for (const g of ctx.protects || []) {
    const before = current.filter((c) => ctx.groupOf(splitVariant(c).base) === g).sort().join(' ');
    const after = final.filter((c) => ctx.groupOf(splitVariant(c).base) === g).sort().join(' ');
    if (before !== after) return { ok: false, reason: 'protected', dropped };
  }
  const delta = final.filter((c) => !current.includes(c));
  const gone = current.filter((c) => !final.includes(c));
  if (!delta.length && !gone.length) return { ok: false, reason: 'no-change', dropped };
  if (ctx.drawable && !ctx.drawable(delta)) return { ok: false, reason: 'not-drawable', dropped };

  return {
    ok: true,
    add: delta,
    remove: gone,
    final,
    label: String(raw.label || '').slice(0, 24),
    why: raw.why ? String(raw.why).slice(0, 90) : '',
    dropped,
    key: [...delta].sort().join(' ') + '|' + [...gone].sort().join(' '),
  };
}

/** Repairs every variation, then dedupes against `seenKeys` (deterministic items' deltas). */
export function repairAll(rawList, ctx, seenKeys = []) {
  const seen = new Set(seenKeys);
  const out = [];
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const r = repairVariation(raw, ctx);
    if (!r.ok || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
    if (out.length >= 3) break;
  }
  return out;
}
