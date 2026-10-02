import React, { useMemo } from 'react';
import { buildCssIndex } from '../inspect/cssIndex';
import { EXAMPLES } from '../examples';

const TRY = ['make it bold', 'bigger', 'background blue', 'hover red'];
const LINES = 3;

/** A rule as one short string: "font-size: 2.25rem". */
function ruleText(rule) {
  const decls = rule.groups.flatMap((g) => g.decls).filter((d) => !d.internal);
  const shown = decls.slice(0, 2).map((d) => `${d.prop}: ${d.value}`).join('; ');
  return decls.length > 2 ? `${shown}; ...` : shown;
}

/** Real classes from the current page that have a compiled rule, plain utilities first. */
function samples(used, index) {
  const out = [];
  const plain = used.filter((c) => !c.includes(':') && !c.includes('['));
  for (const cls of [...plain, ...used]) {
    if (out.length >= LINES) break;
    if (out.some((o) => o.cls === cls)) continue;
    const rule = index.rulesFor(cls)[0];
    if (rule) out.push({ cls, text: ruleText(rule) });
  }
  return out;
}

/**
 * The state before anything is selected: a way in (try phrases, an example)
 * and what Rich Wind does, shown with classes that are on this page now.
 */
export default function Landing({ css, used, onTry, onExample }) {
  const index = useMemo(() => buildCssIndex(css), [css]);
  const lines = useMemo(() => samples(used, index), [used, index]);
  const example = EXAMPLES[0];

  return (
    <section className="panel-block landing" aria-label="How Rich Wind works">
      <div className="landing-try">
        <span className="shelf-label">Try</span>
        {TRY.map((p) => (
          <button key={p} type="button" className="pchip" onClick={() => onTry(p)}>{p}</button>
        ))}
      </div>

      <h2 className="block-title">How it works</h2>
      {lines.length > 0 ? (
        <ol className="explain">
          {lines.map((l) => (
            <li key={l.cls} className="explain-row">
              <code className="explain-cls">{l.cls}</code>
              <span className="explain-arrow" aria-hidden="true">-&gt;</span>
              <code className="explain-rule">{l.text}</code>
            </li>
          ))}
        </ol>
      ) : (
        <p className="block-note">Add a class to the page and its CSS shows up here.</p>
      )}
      <p className="explain-foot">Compiled at runtime by Rich Wind. The page ships HTML only: no stylesheet, no build step.</p>
      <p className="block-note">Click any text in the page to see its classes and the CSS they became.</p>
      {example && (
        <button type="button" className="btn btn-sm" onClick={() => onExample(example)}>
          Load example: {example.label}
        </button>
      )}
    </section>
  );
}
