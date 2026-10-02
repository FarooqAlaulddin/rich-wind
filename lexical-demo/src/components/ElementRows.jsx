import React, { useEffect, useMemo, useState } from 'react';
import { buildCssIndex } from '../inspect/cssIndex';
import { useRoving } from '../hooks/useRoving';
import { chipLabel } from '../shelf/intents';

const FLASH_MS = 1400;

/** One compiled rule as short text: declarations without the --tw-* plumbing, plus the condition it applies under. */
export function RuleText({ rule }) {
  const groups = rule.groups
    .map((g) => ({ context: g.context, decls: g.decls.filter((d) => !d.internal) }))
    .filter((g) => g.decls.length > 0);
  if (groups.length === 0) return <span className="rule-none">no declarations</span>;
  return groups.map((g, i) => (
    <span className="rule-line" key={i}>
      {g.context.length > 0 && <span className="rule-ctx">{g.context.join(' ')}</span>}
      {g.decls.map((d, j) => (
        <span className="rule-decl" key={j}>
          <span className="rule-prop">{d.prop}</span>
          <span className="rule-value">{d.value}</span>
        </span>
      ))}
    </span>
  ));
}

function ClassRow({ cls, index, status, flash, loading, onOpen, onRemove }) {
  const rules = index.rulesFor(cls);
  let body;
  if (status === 'rejected') {
    body = <span className="crow-msg is-bad">not a Tailwind utility, Rich Wind skipped it</span>;
  } else if (rules.length > 0) {
    body = rules.map((r, i) => <span className="crow-rule" key={i}><RuleText rule={r} /></span>);
  } else {
    body = <span className="crow-msg">{loading ? 'compiling...' : 'no rule in the page CSS yet'}</span>;
  }
  return (
    <li className={`crow${status === 'rejected' ? ' is-rejected' : ''}${flash ? ' is-flash' : ''}`}>
      <span className={`nchip${status === 'rejected' ? ' chip-rejected' : status === 'promoted' ? ' chip-promoted' : ''}`}>
        <button
          type="button"
          data-nav
          data-row="now"
          className="nchip-main"
          title={status === 'rejected' ? 'Rich Wind skipped this class' : status === 'promoted' ? 'Promoted to the shared bundle' : 'Change this class'}
          onClick={() => onOpen(cls)}
        >
          {chipLabel(cls)}
        </button>
        <button type="button" data-nav data-row="now" className="nchip-x" aria-label={`Remove ${cls}`} onClick={() => onRemove(cls)}>
          &times;
        </button>
      </span>
      <span className="crow-body">{body}</span>
    </li>
  );
}

/**
 * The selected element: a header, then one row per class. Each row is the
 * removable chip and the rule Rich Wind compiled for it, read from the page
 * CSS (the same stylesheet the editor uses). Nothing here compiles anything.
 * Hovering a card adds preview rows from the class catalog. After an apply,
 * the new rows flash once the compiled rule for them is in the CSS.
 */
export default function ElementRows({ target, css, rejected, promoted, loading, pending, awaiting, onFlashed, onOpen, onRemove }) {
  const roving = useRoving();
  const index = useMemo(() => buildCssIndex(css), [css]);
  const [flashing, setFlashing] = useState(() => new Set());

  // Flash keys off a real compile result: the rule has to be in the CSS.
  useEffect(() => {
    if (awaiting.length === 0) return;
    const hit = awaiting.filter((c) => target.classes.includes(c) && index.rulesFor(c).length > 0);
    if (hit.length === 0) return;
    setFlashing(new Set(hit));
    onFlashed(hit);
  }, [index, awaiting, target.classes, onFlashed]);

  useEffect(() => {
    if (flashing.size === 0) return undefined;
    const t = setTimeout(() => setFlashing(new Set()), FLASH_MS);
    return () => clearTimeout(t);
  }, [flashing]);

  const head = target.text || target.label;
  const bad = target.classes.filter((c) => rejected.has(c)).length;

  return (
    <section className="panel-block element-rows" aria-label="Selected element">
      <div className="block-head">
        <span className="shelf-tag">&lt;{target.tag}&gt;</span>
        <span className="shelf-snippet">{head}</span>
        <span className="block-meta">{target.classes.length} class{target.classes.length === 1 ? '' : 'es'}{bad > 0 ? `, ${bad} skipped` : ''}</span>
      </div>
      {target.classes.length === 0 ? (
        <p className="shelf-now-empty">No classes yet. Pick something above.</p>
      ) : (
        <ul className="crow-list" aria-label="Classes and the CSS they compiled to" {...roving}>
          {target.classes.map((cls) => (
            <ClassRow
              key={cls}
              cls={cls}
              index={index}
              status={rejected.has(cls) ? 'rejected' : promoted.has(cls) ? 'promoted' : 'ok'}
              flash={flashing.has(cls)}
              loading={loading}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <div className="pending" aria-live="polite">
          <span className="pending-tag">preview, from the class catalog, not compiled yet</span>
          {pending.map((r) => (
            <div key={`${r.sign}${r.cls}`} className={`prow ${r.sign === '+' ? 'is-add' : 'is-del'}`}>
              <span className="prow-sign">{r.sign}</span>
              <span className="prow-cls">{r.cls}</span>
              <span className="prow-css">{r.css}</span>
            </div>
          ))}
        </div>
      )}
      <p className="block-note">CSS read from this page's compile. Clicking does not compile; editing does.</p>
    </section>
  );
}
