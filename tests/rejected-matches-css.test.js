import { describe, it, expect } from 'vitest';
import { createCore, scanHtml, exportCss, exportSet } from '../services/index.js';

// The guarantee: a class is in `rejected` exactly when no CSS rule was emitted
// for it. Every entry point that returns `rejected` beside CSS is held to it,
// so an entry point added later is one more row below, not a new reading of
// the rule. A character ban once reported text-(--ink) as rejected while its
// rule was in the CSS, and an agent told to fix it had nothing to fix.

// Tailwind escapes every character outside [A-Za-z0-9_-] in a selector.
const selector = (cls) => `.${cls.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`)}`;
const hasRule = (css, cls) => {
  const sel = selector(cls);
  let at = css.indexOf(sel);
  while (at !== -1) {
    const next = css[at + sel.length];
    if (next === undefined || /[\s{:,]/.test(next)) return true;
    at = css.indexOf(sel, at + 1);
  }
  return false;
};

const COMPILES = [
  'text-(--ink)',
  'bg-(--paper)',
  'p-(--space-3)',
  'rounded-(--radius-card)',
  'border-(--rule)',
  'text-(length:--text-body)',
  'md:p-(--space-3)',
  'grid-cols-[repeat(2,minmax(0,1fr))]',
  'shadow-[0_1px_2px_rgb(0_0_0/0.1)]',
  'bg-[oklch(0.98_0.01_80)]',
  'w-[calc(100%-2rem)]',
  'p-4'
];
const DOES_NOT = ['bogus-class', 'bg-{red,blue}-500', 'not-a-utility'];
const ALL = [...COMPILES, ...DOES_NOT];
const HTML = `<main class="${ALL.join(' ')}">x</main>`;

function holds(name, { css, rejected }) {
  for (const cls of ALL) {
    expect(rejected.includes(cls), `${name}: ${cls} rejected`).toBe(!hasRule(css, cls));
  }
  expect([...rejected].sort(), name).toEqual([...DOES_NOT].sort());
}

describe('rejected names exactly the classes with no CSS', () => {
  it('holds for core.compile, from html and from classes', async () => {
    const core = await createCore();
    try {
      holds('compile html', await core.compile({ projectId: 'rmc', pageId: 'html', html: HTML }));
      holds('compile classes', await core.compile({ projectId: 'rmc', pageId: 'cls', classes: ALL.join(' ') }));
    } finally {
      await core.close();
    }
  });

  it('holds for POST /api/compile', async () => {
    const core = await createCore();
    try {
      for (const [pageId, body] of [['h', { html: HTML }], ['c', { classes: ALL.join(' ') }]]) {
        const res = await core.fetch(new Request('http://localhost/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: 'rmc-http', pageId, ...body })
        }));
        expect(res.status).toBe(200);
        holds(`http ${pageId}`, await res.json());
      }
    } finally {
      await core.close();
    }
  });

  it('holds for exportCss', async () => {
    holds('exportCss html', await exportCss({ html: HTML }));
    holds('exportCss classes', await exportCss({ classes: ALL.join(' ') }));
  });

  it('holds for exportSet, per page against the shared sheet and its own', async () => {
    const out = await exportSet([{ id: 'a', html: HTML }, { id: 'b', classes: ALL.join(' ') }]);
    for (const id of ['a', 'b']) {
      holds(`exportSet ${id}`, { css: `${out.shared}\n${out.pages[id]}`, rejected: out.rejected[id] });
    }
  });

  it('scanHtml lists the class-attribute tokens Tailwind cannot compile, and only those', async () => {
    const { classes, rejected } = await scanHtml(HTML);
    expect([...rejected].sort()).toEqual([...DOES_NOT].sort());
    for (const cls of COMPILES) expect(classes, cls).toContain(cls);
  });

  it('never expands brace syntax, however deep', async () => {
    const bomb = `bg-${'{a,b}'.repeat(40)}`;
    const started = Date.now();
    const out = await exportCss({ html: `<p class="${bomb} p-4">x</p>`, classes: bomb });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(out.rejected).toEqual([bomb]);
    expect(hasRule(out.css, 'p-4')).toBe(true);
  });
});
