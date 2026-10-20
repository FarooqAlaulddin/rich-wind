import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createCore, exportCss, exportSet, parseTheme, scanHtml } from '../services/index.js';

const INK = '--color-*: initial; --color-ink: #111111; --radius-card: 6px;';
const PAPER = '--color-*: initial; --color-ink: #222222; --color-paper: #fafafa;';

const stockHash = (classes) =>
  crypto.createHash('sha256').update([...classes].sort().join('|')).digest('hex');

// A theme plugin answering from a map the test edits, as an app holding each
// project's token file in memory would.
function themes(initial = {}) {
  const map = new Map(Object.entries(initial));
  const calls = [];
  return {
    map,
    calls,
    plugin: {
      name: 'test-themes',
      resolveTheme({ projectId, source }) {
        calls.push({ projectId, source });
        return map.get(projectId) ?? null;
      }
    }
  };
}

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a failure');
}

describe('Project themes', () => {
  it('leaves stock output byte-identical when no plugin names a theme', async () => {
    const plain = await createCore();
    const t = themes();
    const themed = await createCore({ plugins: t.plugin });
    try {
      const input = { projectId: 'stock', pageId: 'home', classes: 'p-4 bg-red-500 not-a-class' };
      const a = await plain.compile(input);
      const b = await themed.compile(input);
      expect(b).toEqual(a);
      expect(a.hash).toBe(stockHash(['bg-red-500', 'p-4']));
      const pa = await plain.getProjectCss({ projectId: 'stock' });
      const pb = await themed.getProjectCss({ projectId: 'stock' });
      expect(pb).toEqual(pa);
      expect(t.calls.length).toBeGreaterThan(0);
    } finally {
      await plain.close();
      await themed.close();
    }
  });

  it('compiles theme classes and switches off only the namespaces the theme resets', async () => {
    const t = themes({ brand: INK });
    const core = await createCore({ plugins: t.plugin });
    try {
      const out = await core.compile({
        projectId: 'brand', pageId: 'home',
        classes: 'bg-ink rounded-card rounded-lg p-4 text-sm bg-red-500'
      });
      expect(out.classes).toEqual(['bg-ink', 'p-4', 'rounded-card', 'rounded-lg', 'text-sm']);
      expect(out.rejected).toEqual(['bg-red-500']);
      expect(out.css).toContain('--color-ink: #111111');
      expect(out.css).toContain('--radius-card: 6px');
      expect(out.css).not.toContain('--color-red-500');
      expect(out.hash).not.toBe(stockHash(out.classes));
    } finally {
      await core.close();
    }
  });

  it('never shares CSS between two projects with different themes', async () => {
    const t = themes({ a: INK, b: PAPER });
    const core = await createCore({ plugins: t.plugin });
    try {
      const [a, b] = await Promise.all([
        core.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' }),
        core.compile({ projectId: 'b', pageId: 'home', classes: 'bg-ink' })
      ]);
      expect(a.css).toContain('#111111');
      expect(a.css).not.toContain('#222222');
      expect(b.css).toContain('#222222');
      expect(b.css).not.toContain('#111111');
      expect(a.hash).not.toBe(b.hash);
    } finally {
      await core.close();
    }
  });

  it('a theme change rebuilds that project and leaves the others alone', async () => {
    const t = themes({ a: INK, b: INK });
    const core = await createCore({ plugins: t.plugin });
    try {
      await core.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink p-4' });
      await core.compile({ projectId: 'b', pageId: 'home', classes: 'bg-ink p-4' });
      const before = await core.getCss({ projectId: 'a', pageId: 'home' });
      const bBefore = await core.getCss({ projectId: 'b', pageId: 'home' });

      t.map.set('a', PAPER);
      const after = await core.getCss({ projectId: 'a', pageId: 'home' });
      expect(after.css).toContain('#222222');
      expect(after.css).not.toContain('#111111');
      expect(after.etag).not.toBe(before.etag);
      const project = await core.getProjectCss({ projectId: 'a' });
      expect(project.css).toContain('#222222');

      expect(await core.getCss({ projectId: 'b', pageId: 'home' })).toEqual(bBefore);
    } finally {
      await core.close();
    }
  });

  it('drops a class the new theme no longer has', async () => {
    const t = themes({ a: PAPER });
    const core = await createCore({ plugins: t.plugin });
    try {
      await core.compile({ projectId: 'a', pageId: 'home', classes: 'bg-paper p-4' });
      t.map.set('a', INK);
      const css = await core.getCss({ projectId: 'a', pageId: 'home' });
      expect(css.css).toContain('padding');
      expect(css.css).not.toContain('bg-paper');
      const suggestions = await core.suggest({ projectId: 'a', prefix: 'bg-' });
      expect(suggestions.suggestions).not.toContain('bg-paper');
    } finally {
      await core.close();
    }
  });

  it('never serves a stored artifact built against another theme', async () => {
    const t = themes({ a: INK });
    const pages = new Map();
    const projects = new Map();
    const store = {
      readPageArtifact: ({ projectId, pageId, bundle }) => pages.get(`${projectId}/${pageId}/${bundle}`) ?? null,
      upsertPageArtifact: (input) => { pages.set(`${input.projectId}/${input.pageId}/${input.bundle}`, { ...input }); },
      readProjectArtifact: ({ projectId, bundle }) => projects.get(`${projectId}/${bundle}`) ?? null,
      upsertProjectArtifact: (input) => { projects.set(`${input.projectId}/${input.bundle}`, { ...input }); }
    };
    const writer = await createCore({ plugins: t.plugin, cacheStore: store });
    await writer.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' });
    await writer.getProjectCss({ projectId: 'a' });
    await writer.close();

    const stored = pages.get('a/home/full');
    expect(stored.themeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(projects.get('a/full').themeHash).toBe(stored.themeHash);

    // A fresh core with the same theme serves the stored artifact.
    const same = await createCore({ plugins: t.plugin, cacheStore: store });
    try {
      expect((await same.getCss({ projectId: 'a', pageId: 'home' })).css).toBe(stored.css);
      expect((await same.getProjectCss({ projectId: 'a' })).css).toContain('#111111');
    } finally {
      await same.close();
    }

    // Once the theme changes, the stored artifacts are another theme's.
    t.map.set('a', PAPER);
    const changed = await createCore({ plugins: t.plugin, cacheStore: store });
    try {
      const err = await failure(changed.getCss({ projectId: 'a', pageId: 'home' }));
      expect(err.code).toBe('NOT_FOUND');
      const out = await changed.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' });
      expect(out.cached).toBe(false);
      expect(out.css).toContain('#222222');
    } finally {
      await changed.close();
    }

    // An artifact written before themes existed is a stock artifact.
    const legacy = { css: '.p-4{padding:1rem}', classes: ['p-4'], hash: stockHash(['p-4']), expiresAt: Date.now() + 60_000 };
    const legacyStore = { readPageArtifact: () => legacy };
    const stock = await createCore({ cacheStore: legacyStore });
    const themed = await createCore({ plugins: themes({ x: INK }).plugin, cacheStore: legacyStore });
    try {
      expect((await stock.getCss({ projectId: 'x', pageId: 'home' })).css).toBe(legacy.css);
      expect((await failure(themed.getCss({ projectId: 'x', pageId: 'home' }))).code).toBe('NOT_FOUND');
    } finally {
      await stock.close();
      await themed.close();
    }
  });

  it('refuses a theme that is anything other than declarations', async () => {
    const bad = [
      '@import "https://example.com/x.css";',
      '@plugin "x";',
      '--color-ink: red; } body { color: red',
      '--color-ink: red /* unclosed',
      '--color-*: red;',
      'color: red;',
      '--color-ink: \\7d;',
      42
    ];
    for (const theme of bad) {
      const core = await createCore({ plugins: { name: 'bad', resolveTheme: () => theme } });
      try {
        const err = await failure(core.compile({ projectId: 'p', pageId: 'home', classes: 'p-4' }));
        expect(err.code, String(theme)).toBe('INVALID_THEME');
        expect(err.status).toBe(500);
      } finally {
        await core.close();
      }
    }
    expect((await failure(exportCss({ classes: 'p-4', theme: '@import "x";' }))).code).toBe('INVALID_THEME');
  });

  it('fails closed when the theme plugin throws, times out or never started', async () => {
    const cases = [
      { name: 'throws', resolveTheme() { throw new Error('boom'); } },
      { name: 'slow', timeoutMs: 20, resolveTheme: () => new Promise(() => {}) },
      { name: 'broken', setup() { throw new Error('no setup'); }, resolveTheme: () => INK }
    ];
    for (const plugin of cases) {
      const errors = [];
      const core = await createCore({
        plugins: [plugin, { name: 'watch', onError: ({ hook }) => { errors.push(hook); } }]
      });
      try {
        for (const call of [
          () => core.compile({ projectId: 'p', pageId: 'home', classes: 'p-4' }),
          () => core.getCss({ projectId: 'p', pageId: 'home' }),
          () => core.getProjectCss({ projectId: 'p' }),
          () => core.suggest({ projectId: 'p', prefix: 'p-' })
        ]) {
          const err = await failure(call());
          expect(err.status, plugin.name).toBe(500);
          expect(err.code).toBe('INTERNAL');
        }
        if (plugin.name !== 'broken') expect(errors).toContain('resolveTheme');
      } finally {
        await core.close();
      }
    }
  });

  it('a theme plugin cannot call back into the core', async () => {
    for (const callBack of [
      (ctx) => ctx.validateClasses('p-4', { projectId: ctx.projectId }),
      (ctx) => ctx.compile({ projectId: ctx.projectId, pageId: 'nested', classes: 'p-4' })
    ]) {
      const core = await createCore({
        plugins: {
          name: 'loop',
          async resolveTheme(ctx) {
            await callBack(ctx);
            return INK;
          }
        }
      });
      try {
        const err = await failure(core.compile({ projectId: 'p', pageId: 'home', classes: 'p-4' }));
        expect(err.code).toBe('INTERNAL');
        expect(err.message).toMatch(/resolveTheme cannot call back/);
      } finally {
        await core.close();
      }
    }
  });

  it('validates a plugin\'s classes against the project theme', async () => {
    let seen;
    const t = themes({ brand: INK });
    const core = await createCore({
      plugins: [t.plugin, {
        name: 'check',
        async onCompileResult(ctx) {
          seen = {
            themed: await ctx.validateClasses('bg-ink bg-red-500', { projectId: ctx.projectId }),
            stock: await ctx.validateClasses('bg-ink bg-red-500')
          };
        }
      }]
    });
    try {
      await core.compile({ projectId: 'brand', pageId: 'home', classes: 'bg-ink' });
      expect(seen).toEqual({ themed: ['bg-ink'], stock: ['bg-red-500'] });
    } finally {
      await core.close();
    }
  });

  it('suggests the theme\'s classes and not the ones it switched off', async () => {
    const core = await createCore({ plugins: themes({ brand: INK }).plugin });
    try {
      const themed = await core.suggest({ projectId: 'brand', prefix: 'bg-' });
      expect(themed.suggestions).toContain('bg-ink');
      expect(themed.suggestions).not.toContain('bg-red-500');
      const stock = await core.suggest({ prefix: 'bg-red' });
      expect(stock.suggestions).toContain('bg-red-500');
    } finally {
      await core.close();
    }
  });

  it('never asks for a theme on the base bundle', async () => {
    const t = themes({ brand: INK });
    const core = await createCore({ plugins: t.plugin });
    try {
      const base = await core.getCss({ projectId: 'brand', pageId: 'home', bundle: 'base' });
      expect(base.css.length).toBeGreaterThan(0);
      expect(t.calls).toEqual([]);
    } finally {
      await core.close();
    }
  });

  it('keeps CSS built for a theme that changed mid-compile out of the cache', async () => {
    const t = themes({ a: INK });
    let flipped = false;
    const core = await createCore({
      plugins: [t.plugin, {
        name: 'flip',
        async transformClasses(ctx) {
          if (!flipped && ctx.pageId === 'home') {
            flipped = true;
            t.map.set('a', PAPER);
            await ctx.compile({ projectId: 'a', pageId: 'other', classes: 'p-4' });
          }
          return ctx.classes;
        }
      }]
    });
    try {
      const out = await core.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' });
      expect(out.css).toContain('#111111');
      expect(out.cached).toBe(false);
      expect((await failure(core.getCss({ projectId: 'a', pageId: 'home' }))).code).toBe('NOT_FOUND');
      const again = await core.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' });
      expect(again.css).toContain('#222222');
    } finally {
      await core.close();
    }
  });

  it('exports with a theme', async () => {
    const single = await exportCss({ classes: 'bg-ink bg-red-500', theme: INK });
    expect(single.classes).toEqual(['bg-ink']);
    expect(single.rejected).toEqual(['bg-red-500']);
    expect(single.css).toContain('--color-ink: #111111');

    const scanned = await scanHtml('<div class="bg-ink bg-red-500"></div>', { theme: INK });
    expect(scanned).toEqual({ classes: ['bg-ink'], rejected: ['bg-red-500'] });

    const set = await exportSet(
      [{ id: 'a', classes: 'bg-ink p-4' }, { id: 'b', classes: 'bg-ink m-2' }],
      { theme: INK }
    );
    expect(set.shared).toContain('#111111');
    expect(set.classes.a).toEqual(['bg-ink', 'p-4']);

    const stock = await exportCss({ classes: 'p-4' });
    expect(await exportCss({ classes: 'p-4', theme: null })).toEqual(stock);
  });
});

describe('cache-store-fs keeps the theme an artifact was built for', () => {
  it('round-trips themeHash so a restart never serves another theme\'s CSS', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createFsCacheStore } = await import('../plugins/cache-store-fs/index.js');
    const dir = await mkdtemp(join(tmpdir(), 'rw-theme-'));
    const t = themes({ a: INK });
    try {
      const first = await createCore({ plugins: t.plugin, cacheStore: createFsCacheStore({ dir }) });
      await first.compile({ projectId: 'a', pageId: 'home', classes: 'bg-ink' });
      await first.getProjectCss({ projectId: 'a' });
      await first.close();

      const store = createFsCacheStore({ dir });
      const page = await store.readPageArtifact({ projectId: 'a', pageId: 'home', bundle: 'full', now: Date.now() });
      const project = await store.readProjectArtifact({ projectId: 'a', bundle: 'full', now: Date.now() });
      expect(page.themeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(project.themeHash).toBe(page.themeHash);

      const same = await createCore({ plugins: t.plugin, cacheStore: createFsCacheStore({ dir }) });
      expect((await same.getCss({ projectId: 'a', pageId: 'home' })).css).toContain('#111111');
      await same.close();

      t.map.set('a', PAPER);
      const changed = await createCore({ plugins: t.plugin, cacheStore: createFsCacheStore({ dir }) });
      expect((await failure(changed.getCss({ projectId: 'a', pageId: 'home' }))).code).toBe('NOT_FOUND');
      expect((await failure(changed.getProjectCss({ projectId: 'a' }))).code).toBe('NOT_FOUND');
      await changed.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parseTheme checks a theme as compile does', async () => {
    expect(parseTheme(null)).toEqual({ text: '', hash: '' });
    expect(parseTheme('  ')).toEqual({ text: '', hash: '' });
    const ink = parseTheme(INK);
    expect(ink.text.split('\n')).toEqual(['--color-*: initial;', '--color-ink: #111111;', '--radius-card: 6px;']);
    expect(ink.hash).toMatch(/^[0-9a-f]{64}$/);
    for (const bad of ['--x: 1; } body {', '@import "x";', '--color-*: red;', 'color: red;']) {
      expect(() => parseTheme(bad)).toThrow(expect.objectContaining({ code: 'INVALID_THEME' }));
    }
    // What parseTheme refuses, compile refuses too.
    const t = themes({ p: '@import "x";' });
    const core = await createCore({ plugins: t.plugin });
    try {
      const err = await failure(core.compile({ projectId: 'p', pageId: 'home', classes: 'p-4' }));
      expect(err.code).toBe('INVALID_THEME');
    } finally {
      await core.close();
    }
  });
});
