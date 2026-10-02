import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createCore, scanHtml, exportCss, exportSet } from '../services/index.js';
import { createAutoPromotePlugin } from '../plugins/auto-promote/index.js';

const hasRule = (css, cls) => new RegExp(`\\.${cls.replace(/[-[\]/:.]/g, '\\$&')}\\s*\\{`).test(css);
const ruleAt = (css, cls) => css.search(new RegExp(`\\.${cls.replace(/[-[\]/:.]/g, '\\$&')}\\s*\\{`));
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

const PAGE_HTML = `<main class="p-4 text-red-500 bogus-class">
  <p class='font-bold not-a-utility'>flex grid words in prose</p>
  <div className="rounded">x</div>
</main>`;

describe('scanHtml', () => {
  it('returns valid classes and rejects only class-attribute tokens', async () => {
    const { classes, rejected } = await scanHtml(PAGE_HTML);
    expect(classes).toEqual(expect.arrayContaining(['p-4', 'text-red-500', 'font-bold', 'rounded']));
    expect(rejected).toEqual(['bogus-class', 'not-a-utility']);
    expect(rejected).not.toContain('words');
  });

  it('decodes entities in class attributes and compiles those classes', async () => {
    const html = '<p class="[.theme-dark_&amp;]:text-slate-100 p-4 a&lt;b &#x70;-2">x</p>';
    const { classes, rejected } = await scanHtml(html);
    expect(classes).toEqual(expect.arrayContaining(['[.theme-dark_&]:text-slate-100', 'p-2', 'p-4']));
    expect(rejected).toEqual(['a<b']);
    const { css } = await exportCss({ html });
    expect(css).toMatch(/\.theme-dark .*text-slate-100|text-slate-100[\s\S]*\.theme-dark/);
    const core = await createCore();
    try {
      const result = await core.compile({ projectId: 'ent', pageId: 'p', html });
      expect(result.classes).toContain('[.theme-dark_&]:text-slate-100');
      expect(result.rejected).toEqual(['a<b']);
    } finally {
      await core.close();
    }
  });

  it('handles empty and non-string input', async () => {
    expect(await scanHtml('')).toEqual({ classes: [], rejected: [] });
    expect(await scanHtml(undefined)).toEqual({ classes: [], rejected: [] });
  });
});

describe('compile reports rejected classes for HTML input', () => {
  it('fills rejected for an HTML-only compile, through the library and HTTP', async () => {
    const core = await createCore();
    try {
      const result = await core.compile({ projectId: 'rej', pageId: 'p', html: PAGE_HTML });
      expect(result.rejected).toEqual(['bogus-class', 'not-a-utility']);
      expect(hasRule(result.css, 'p-4')).toBe(true);

      const res = await core.fetch(new Request('http://localhost/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'rej', pageId: 'q', html: PAGE_HTML, classes: 'nope-x m-2' })
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.rejected).toEqual(['bogus-class', 'nope-x', 'not-a-utility']);
    } finally {
      await core.close();
    }
  });
});

describe('exportCss', () => {
  it('returns complete standalone CSS', async () => {
    const { css, classes, rejected } = await exportCss({ html: PAGE_HTML, classes: 'm-2 zz-nope' });
    expect(css).toMatch(/box-sizing: border-box/); // preflight
    expect(css).toMatch(/--color-red-500:/); // theme variables
    for (const cls of ['p-4', 'm-2', 'text-red-500', 'font-bold', 'rounded']) expect(hasRule(css, cls)).toBe(true);
    expect(classes).toContain('m-2');
    expect(rejected).toEqual(['bogus-class', 'not-a-utility', 'zz-nope']);
  });

  it('does not depend on cache or promoted-bundle state', async () => {
    const before = await exportCss({ html: PAGE_HTML });
    const plugin = createAutoPromotePlugin({ threshold: 1 });
    const core = await createCore({ plugins: [plugin] });
    try {
      await core.compile({ projectId: 'state', pageId: 'a', html: PAGE_HTML });
      await core.compile({ projectId: 'state', pageId: 'b', html: PAGE_HTML });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await plugin.settled();
      const stripped = await core.compile({ projectId: 'state', pageId: 'a', html: PAGE_HTML, bundle: 'utilities' });
      expect(hasRule(stripped.css, 'p-4')).toBe(false); // promoted away from the page
      expect((await exportCss({ html: PAGE_HTML })).css).toBe(before.css);
    } finally {
      await core.close();
    }
  });

  it('is byte-identical across calls, input order and processes', async () => {
    const a = await exportCss({ classes: 'p-4 m-2 hover:bg-blue-500 md:flex' });
    const b = await exportCss({ classes: 'md:flex hover:bg-blue-500 m-2 p-4 p-4' });
    expect(b.css).toBe(a.css);
    const script = `import { exportCss } from ${JSON.stringify(new URL('../services/index.js', import.meta.url).href)};
      const { css } = await exportCss({ classes: 'p-4 m-2 hover:bg-blue-500 md:flex' });
      process.stdout.write(css);`;
    const fresh = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(sha(fresh)).toBe(sha(a.css));
  });
});

describe('exportSet', () => {
  const pages = [
    { id: 'home', html: '<div class="p-4 text-red-500 flex">home</div>' },
    { id: 'about', classes: 'p-4 text-red-500 grid' },
    { id: 'contact', html: '<div class="px-2 p-4 bogus-x">c</div>' }
  ];

  it('splits into one shared sheet and one sheet per page', async () => {
    const out = await exportSet(pages);
    expect(Object.keys(out.pages)).toEqual(['about', 'contact', 'home']);
    expect(out.shared).toMatch(/box-sizing: border-box/);
    expect(hasRule(out.shared, 'p-4')).toBe(true);
    expect(hasRule(out.shared, 'text-red-500')).toBe(true);
    expect(hasRule(out.shared, 'flex')).toBe(false);
    expect(out.shared).toMatch(/--color-red-500:/);
    expect(hasRule(out.pages.home, 'flex')).toBe(true);
    expect(hasRule(out.pages.about, 'grid')).toBe(true);
    expect(out.rejected).toEqual({ about: [], contact: ['bogus-x'], home: [] });
    for (const page of pages) {
      for (const cls of out.classes[page.id]) {
        expect(hasRule(out.shared, cls) || hasRule(out.pages[page.id], cls), `${page.id} ${cls}`).toBe(true);
      }
    }
  });

  it('keeps Tailwind cascade order when a shared class sorts after a page class', async () => {
    // px-2 is shared, p-4 is contact's own; Tailwind puts px-2 after p-4, so
    // contact's sheet must repeat px-2 after p-4 or p-4 would win.
    const out = await exportSet([
      { id: 'contact', classes: 'p-4 px-2' },
      { id: 'other', classes: 'px-2' }
    ]);
    expect(hasRule(out.shared, 'px-2')).toBe(true);
    const sheet = out.pages.contact;
    expect(ruleAt(sheet, 'p-4')).toBeGreaterThanOrEqual(0);
    expect(ruleAt(sheet, 'px-2')).toBeGreaterThan(ruleAt(sheet, 'p-4'));
    expect(out.pages.other).toBe('');
  });

  it('is deterministic whatever the page order', async () => {
    const a = await exportSet(pages);
    const b = await exportSet(pages.slice().reverse());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('honours minPages and handles an empty set', async () => {
    const out = await exportSet(pages, { minPages: 3 });
    expect(hasRule(out.shared, 'p-4')).toBe(true);
    expect(hasRule(out.shared, 'text-red-500')).toBe(false);
    const empty = await exportSet([]);
    expect(empty.pages).toEqual({});
    expect(empty.shared).toMatch(/box-sizing: border-box/);
  });

  it('rejects bad input', async () => {
    await expect(exportSet('nope')).rejects.toThrow(TypeError);
    await expect(exportSet([{ id: 'a' }, { id: 'a' }])).rejects.toThrow(/duplicate/);
    await expect(exportSet([{ html: '<p></p>' }])).rejects.toThrow(/string id/);
  });
});
