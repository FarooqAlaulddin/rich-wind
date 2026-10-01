import http from 'node:http';
import { describe, it, expect, afterAll } from 'vitest';
import { createCore } from '../../services/index.js';
import { createAutoPromotePlugin } from './index.js';

// Helper: compile a page via HTTP
async function compileViaHttp(port, projectId, pageId, classes) {
  const res = await fetch(`http://localhost:${port}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId, classes })
  });
  return res.json();
}

// Helper: start a server, return { port, server, close }
async function startServer(coreOptions) {
  const { handler, close } = await createCore({
    ...coreOptions
  });
  const server = http.createServer(handler).listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  return { port, server, close };
}

// Helper: stop server
async function stopServer({ server, close }) {
  await new Promise(r => server.close(r));
  await close();
}

function createPluginDataStore() {
  const map = new Map();
  return {
    async readPluginData({ pluginName, key }) {
      const raw = map.get(`${pluginName}:${key}`);
      if (raw === undefined) return null;
      return JSON.parse(JSON.stringify(raw));
    },
    async writePluginData({ pluginName, key, value }) {
      map.set(`${pluginName}:${key}`, JSON.parse(JSON.stringify(value)));
    },
    async deletePluginData({ pluginName, key }) {
      map.delete(`${pluginName}:${key}`);
    }
  };
}

describe('Auto-Promote Plugin', () => {
  describe('basic promotion tracking', () => {
    it('classes below threshold are NOT promoted', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 3 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Compile on 2 pages (below threshold of 3)
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 100));

      // Stats should show 0 promoted
      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      const stats = await statsRes.json();
      expect(stats.proj.promotedClasses).toBe(0);
      expect(stats.proj.promoted).toEqual([]);

      await stopServer({ server, close });
    });

    it('classes reaching threshold ARE promoted', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 3 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Compile text-red-500 on 3 pages
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      await new Promise(r => setTimeout(r, 200));

      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      const stats = await statsRes.json();
      expect(stats.proj.promotedClasses).toBeGreaterThanOrEqual(1);
      expect(stats.proj.promoted).toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('only classes at threshold are promoted — sub-threshold classes stay per-page', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 3 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // text-red-500 hits threshold (3 pages); p-4 and bg-blue-500 do not (1 page each)
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 m-2');
      await compileViaHttp(port, 'proj', 'page3', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      const bundleCss = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleCss).toMatch(/\.text-red-500/);
      expect(bundleCss).not.toMatch(/\.p-4/);
      expect(bundleCss).not.toMatch(/\.bg-blue-500/);

      // Per-page compile: promoted class stripped, non-promoted ones kept
      const result = await compileViaHttp(port, 'proj', 'page4', 'text-red-500 p-4');
      expect(result.css).not.toMatch(/\.text-red-500/);
      expect(result.css).toMatch(/\.p-4/);

      await stopServer({ server, close });
    });
  });

  describe('transformClasses stripping', () => {
    it('promoted classes are stripped from per-page compile output', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Get text-red-500 promoted (needs 2 pages)
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 200));

      // Now compile a new page that uses text-red-500 — it should be stripped
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      expect(result.classes).not.toContain('text-red-500');
      expect(result.classes).toContain('m-2');

      await stopServer({ server, close });
    });

    it('all-promoted edge case: returns undefined (keeps original classes)', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Promote text-red-500
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));

      // Now compile with ONLY the promoted class — should NOT get 400 error
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500');
      expect(result.success).toBe(true);
      expect(result.classes).toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('__auto_promote__ synthetic page is not stripped', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // Promote text-red-500
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      // Promoted CSS must be non-empty — if the synthetic page were stripped,
      // text-red-500 would be removed before compilation and the CSS would be empty
      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      expect(cssRes.status).toBe(200);
      const css = await cssRes.text();
      expect(css).toContain('.text-red-500');

      await stopServer({ server, close });
    });

    it('stripped promoted classes are absent from compiled CSS, not just the class list', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // Promote text-red-500
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      // Fetch the per-page CSS directly — text-red-500 must not appear in it
      const cssRes = await fetch(`http://localhost:${port}/api/css?projectId=proj&pageId=page3`);
      // page3 hasn't compiled yet, but compile it now and inspect the returned CSS
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      expect(result.css).not.toMatch(/\.text-red-500/);
      expect(result.css).toMatch(/\.m-2/);

      await stopServer({ server, close });
    });

    it('bundle contains ALL promoted classes when multiple cross threshold simultaneously', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // Both text-red-500 and font-bold appear on 2 pages
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 font-bold p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 font-bold bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      const bundleCss = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleCss).toMatch(/\.text-red-500/);
      expect(bundleCss).toMatch(/\.font-bold/);

      // Per-page compile must contain neither promoted class
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 font-bold m-2');
      expect(result.css).not.toMatch(/\.text-red-500/);
      expect(result.css).not.toMatch(/\.font-bold/);
      expect(result.css).toMatch(/\.m-2/);

      await stopServer({ server, close });
    });

    it('the compile that tips a class over threshold still includes it — stripping starts next compile', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');

      // page2 is the compile that crosses threshold — transformClasses runs before
      // onCompileResult (deferred), so promotion is not yet effective for this compile
      const triggeringResult = await compileViaHttp(port, 'proj', 'page2', 'text-red-500 m-2');
      expect(triggeringResult.css).toMatch(/\.text-red-500/);

      // Wait for deferred onCompileResult to promote the class
      await new Promise(r => setTimeout(r, 500));

      // Next compile of page2 — now text-red-500 is promoted, gets stripped
      const nextResult = await compileViaHttp(port, 'proj', 'page2', 'text-red-500 m-2');
      expect(nextResult.css).not.toMatch(/\.text-red-500/);

      await stopServer({ server, close });
    });

    it('promoted class exists in exactly one place: bundle has it, per-page does not', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      // Promoted bundle must contain the class
      const bundleCss = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleCss).toMatch(/\.text-red-500/);

      // Per-page CSS for a new compile must not contain it
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      expect(result.css).not.toMatch(/\.text-red-500/);

      await stopServer({ server, close });
    });
  });

  describe('custom routes', () => {
    it('stats returns empty object before any compiles', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      const stats = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(stats).toEqual({});

      await stopServer({ server, close });
    });

    it('stats route returns correct counts', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      await compileViaHttp(port, 'projA', 'p1', 'text-red-500 p-4');
      await compileViaHttp(port, 'projA', 'p2', 'text-red-500');

      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      expect(statsRes.status).toBe(200);
      const stats = await statsRes.json();
      expect(stats.projA).toBeDefined();
      expect(stats.projA.trackedClasses).toBeGreaterThan(0);
      expect(stats.projA.threshold).toBe(2);

      await stopServer({ server, close });
    });

    it('CSS route serves promoted CSS', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(port, 'proj', 'p1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'p2', 'text-red-500');
      // Wait for deferred onCompileResult to generate promoted CSS
      await new Promise(r => setTimeout(r, 500));

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      const css = await cssRes.text();
      expect(css.length).toBeGreaterThan(0);

      await stopServer({ server, close });
    });

    it('CSS route returns empty CSS when no promoted classes', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 5 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/nonexistent`);
      expect(cssRes.status).toBe(200);
      expect(await cssRes.text()).toBe('');

      await stopServer({ server, close });
    });

    it('promoted bundle sets Cache-Control: public with max-age', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      expect(cssRes.headers.get('cache-control')).toMatch(/public/);
      expect(cssRes.headers.get('cache-control')).toMatch(/max-age=/);

      await stopServer({ server, close });
    });

    it('promoted bundle sets ETag when CSS is present', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(port, 'proj', 'p1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'p2', 'text-red-500');
      await new Promise(r => setTimeout(r, 500));

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers.get('etag')).toBeTruthy();

      await stopServer({ server, close });
    });

    it('promoted bundle returns 304 when If-None-Match matches ETag', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(port, 'proj', 'p1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'p2', 'text-red-500');
      await new Promise(r => setTimeout(r, 500));

      const first = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      const etag = first.headers.get('etag');
      expect(etag).toBeTruthy();

      const second = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`, {
        headers: { 'if-none-match': etag }
      });
      expect(second.status).toBe(304);
      expect(await second.text()).toBe('');

      await stopServer({ server, close });
    });

    it('empty promoted bundle returns empty CSS body', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 5 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/nonexistent`);
      expect(cssRes.status).toBe(200);
      expect(await cssRes.text()).toBe('');

      await stopServer({ server, close });
    });
  });

  describe('options', () => {
    it('custom threshold option works', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // With threshold 2, just 2 pages should promote
      await compileViaHttp(port, 'proj', 'p1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'p2', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));

      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      const stats = await statsRes.json();
      expect(stats.proj.promoted).toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('default threshold is 5: not promoted at 4, promoted at 5', async () => {
      const plugin = createAutoPromotePlugin();
      const { port, server, close } = await startServer({ plugins: [plugin] });

      for (let i = 0; i < 4; i++) {
        await compileViaHttp(port, 'proj', `p${i}`, 'text-red-500 p-4');
      }
      await new Promise(r => setTimeout(r, 100));

      const before = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(before.proj.promotedClasses).toBe(0);

      // 5th page tips it over the default threshold
      await compileViaHttp(port, 'proj', 'p4', 'text-red-500 p-4');
      await new Promise(r => setTimeout(r, 200));

      const after = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(after.proj.promoted).toContain('text-red-500');

      await stopServer({ server, close });
    });
  });

  describe('setup seeding', () => {
    it('setup seeds from existing cache state', async () => {
      // First, create a core with some pre-existing data, no auto-promote
      const seedPlugin = {
        name: 'seeder',
        setup: () => {}
      };
      const { handler, close: close1 } = await createCore({
        plugins: [seedPlugin],
      });
      const server1 = http.createServer(handler).listen(0);
      await new Promise(r => server1.once('listening', r));
      const { port: port1 } = server1.address();

      // Compile several pages with shared classes
      await compileViaHttp(port1, 'seed-proj', 'p1', 'text-red-500 p-4');
      await compileViaHttp(port1, 'seed-proj', 'p2', 'text-red-500 bg-blue-500');
      await compileViaHttp(port1, 'seed-proj', 'p3', 'text-red-500 m-2');

      await new Promise(r => server1.close(r));
      await close1();

      // Now create a fresh core, but we can't share state between instances.
      // Instead, test that setup() seeds properly by using compile in setup
      // to warm cache, then adding auto-promote.
      let ctxRef;
      const warmPlugin = {
        name: 'warmer',
        async setup(ctx) {
          ctxRef = ctx;
          await ctx.compile({ projectId: 'sp', pageId: 'p1', classes: 'text-red-500 p-4' });
          await ctx.compile({ projectId: 'sp', pageId: 'p2', classes: 'text-red-500 bg-blue-500' });
          await ctx.compile({ projectId: 'sp', pageId: 'p3', classes: 'text-red-500 m-2' });
        }
      };

      const autoPromote = createAutoPromotePlugin({ threshold: 3 });

      const { port, server, close } = await startServer({
        plugins: [warmPlugin, autoPromote]
      });

      // auto-promote setup should have seeded from the warmer's pages
      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      const stats = await statsRes.json();
      expect(stats.sp).toBeDefined();
      expect(stats.sp.trackedClasses).toBeGreaterThan(0);
      expect(stats.sp.promoted).toContain('text-red-500');

      await stopServer({ server, close });
    });
  });

  describe('storage persistence', () => {
    it('restores promoted stats and CSS on a fresh core instance', async () => {
      const cacheStore = createPluginDataStore();

      const plugin1 = createAutoPromotePlugin({ threshold: 2 });
      const s1 = await startServer({
        plugins: [plugin1],
        cacheStore,
        maxPluginCompileChainDepth: 3
      });

      await compileViaHttp(s1.port, 'persist-proj', 'p1', 'text-red-500 p-4');
      await compileViaHttp(s1.port, 'persist-proj', 'p2', 'text-red-500 bg-blue-500');
      await new Promise((resolve) => setTimeout(resolve, 500));

      const cssRes1 = await fetch(`http://localhost:${s1.port}/plugins/auto-promote/css/persist-proj`);
      expect(cssRes1.status).toBe(200);
      const css1 = await cssRes1.text();
      expect(css1.length).toBeGreaterThan(0);

      await stopServer(s1);

      const plugin2 = createAutoPromotePlugin({ threshold: 2 });
      const s2 = await startServer({
        plugins: [plugin2],
        cacheStore,
        maxPluginCompileChainDepth: 3
      });

      const statsRes = await fetch(`http://localhost:${s2.port}/plugins/auto-promote/stats`);
      expect(statsRes.status).toBe(200);
      const stats = await statsRes.json();
      expect(stats['persist-proj']).toBeDefined();
      expect(stats['persist-proj'].promoted).toContain('text-red-500');

      const cssRes2 = await fetch(`http://localhost:${s2.port}/plugins/auto-promote/css/persist-proj`);
      expect(cssRes2.status).toBe(200);
      const css2 = await cssRes2.text();
      expect(css2.length).toBeGreaterThan(0);
      expect(css2).toContain('.text-red-500');

      await stopServer(s2);
    });

    it('restoring with a higher threshold reapplies it to tracking maps and discards stale CSS cache', async () => {
      const cacheStore = createPluginDataStore();

      // Persist with threshold=2 — text-red-500 promoted (2 pages)
      const p1 = createAutoPromotePlugin({ threshold: 2 });
      const s1 = await startServer({ plugins: [p1], cacheStore, maxPluginCompileChainDepth: 3 });
      await compileViaHttp(s1.port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(s1.port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 500));
      await stopServer(s1);

      // Restore with threshold=3 — text-red-500 only has 2 page votes, no longer qualifies
      const p2 = createAutoPromotePlugin({ threshold: 3 });
      const s2 = await startServer({ plugins: [p2], cacheStore });

      const stats = await (await fetch(`http://localhost:${s2.port}/plugins/auto-promote/stats`)).json();
      expect(stats.proj.promoted).not.toContain('text-red-500');

      const bundleCss = await (await fetch(`http://localhost:${s2.port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleCss).toBe('');

      await stopServer(s2);
    });
  });

  describe('demotion', () => {
    it('removing a class from a page loses its vote', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Promote text-red-500 via two pages
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));

      const before = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(before.proj.promoted).toContain('text-red-500');

      // page2 stops using text-red-500 — only 1 page left, below threshold
      await compileViaHttp(port, 'proj', 'page2', 'bg-blue-500');
      await new Promise(r => setTimeout(r, 200));

      const after = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(after.proj.promoted).not.toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('demoted class is no longer stripped from per-page compiles', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Promote, then demote text-red-500
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));
      await compileViaHttp(port, 'proj', 'page2', 'bg-blue-500');
      await new Promise(r => setTimeout(r, 200));

      // text-red-500 is no longer promoted, so it should appear in per-page output
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      expect(result.classes).toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('demoted class exists in exactly one place: per-page has it, bundle does not', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // Promote text-red-500
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 500));

      const bundleBefore = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleBefore).toMatch(/\.text-red-500/);

      // Demote by dropping page2's vote
      await compileViaHttp(port, 'proj', 'page2', 'bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      // Bundle must no longer contain the class
      const bundleAfter = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();
      expect(bundleAfter).not.toMatch(/\.text-red-500/);

      // Per-page compile must now include it
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      expect(result.css).toMatch(/\.text-red-500/);

      await stopServer({ server, close });
    });
  });

  describe('cross-project isolation', () => {
    it('promotion in one project does not affect another', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Promote text-red-500 in projA only
      await compileViaHttp(port, 'projA', 'p1', 'text-red-500');
      await compileViaHttp(port, 'projA', 'p2', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));

      const stats = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(stats.projA.promoted).toContain('text-red-500');
      // projB has no data at all — it is not affected
      expect(stats.projB).toBeUndefined();

      // Compiling text-red-500 on projB should NOT strip it (not promoted there)
      const result = await compileViaHttp(port, 'projB', 'p1', 'text-red-500 m-2');
      expect(result.classes).toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('each project reaches threshold independently', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // projA promotes text-red-500
      await compileViaHttp(port, 'projA', 'p1', 'text-red-500');
      await compileViaHttp(port, 'projA', 'p2', 'text-red-500');
      // projB only has 1 page with text-red-500 — not promoted
      await compileViaHttp(port, 'projB', 'p1', 'text-red-500');
      await new Promise(r => setTimeout(r, 200));

      const stats = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(stats.projA.promoted).toContain('text-red-500');
      expect(stats.projB.promoted).not.toContain('text-red-500');

      await stopServer({ server, close });
    });
  });

  describe('loading model', () => {
    it('complete styling requires promoted bundle + per-page CSS — neither alone is sufficient', async () => {
      // Correct client loading pattern:
      //   1. /api/css?bundle=base                — preflight/reset
      //   2. /api/projects/:id/css?bundle=theme  — design tokens
      //   3. /plugins/auto-promote/css/:id       — promoted utilities  ← this test
      //   4. per-page CSS from /api/compile      — page-specific utilities  ← this test
      //
      // Stripping only applies to compiles that happen AFTER promotion is established.
      // Pre-promotion cached pages still carry the class until recompiled.
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // Establish promotion
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 500));

      // Compile a new page AFTER promotion with a promoted + a non-promoted class
      const result = await compileViaHttp(port, 'proj', 'page3', 'text-red-500 m-2');
      const perPageCss = result.css;
      const bundleCss = await (await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`)).text();

      // Neither source alone has everything
      expect(perPageCss).not.toMatch(/\.text-red-500/); // promoted class stripped from per-page
      expect(bundleCss).not.toMatch(/\.m-2/);           // non-promoted class absent from bundle

      // Together: complete styling
      const combined = bundleCss + perPageCss;
      expect(combined).toMatch(/\.text-red-500/);
      expect(combined).toMatch(/\.m-2/);

      await stopServer({ server, close });
    });

    it('pre-promotion cached pages still carry the promoted class until recompiled', async () => {
      // Stripping is not retroactive — it only applies to compiles made after promotion
      // is established. GET /api/css for a page compiled before promotion returns stale CSS
      // that still includes the promoted class, creating temporary duplication with the bundle.
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3
      });

      // page1 compiles — no promotion yet
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      // page2 tips threshold — but page1's cache is not invalidated
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500 bg-blue-500');
      await new Promise(r => setTimeout(r, 500));

      // page1's cached CSS still has text-red-500 (compiled before promotion)
      const page1Css = await (await fetch(`http://localhost:${port}/api/css?projectId=proj&pageId=page1`)).text();
      expect(page1Css).toMatch(/\.text-red-500/);

      // page1 recompiles — now gets stripping
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500 p-4');
      const page1CssAfter = await (await fetch(`http://localhost:${port}/api/css?projectId=proj&pageId=page1`)).text();
      expect(page1CssAfter).not.toMatch(/\.text-red-500/);

      await stopServer({ server, close });
    });
  });

  describe('regression', () => {
    it('demotion works correctly when a voter page has been LRU-evicted from core cache', async () => {
      // evictIfNeeded() removes pages from core cache with no plugin notification.
      // reconcileProject() runs at the start of onCompileResult to purge ghost votes
      // for pages no longer present in ctx.getPageIds().
      const plugin = createAutoPromotePlugin({ threshold: 2 });
      const { port, server, close } = await startServer({
        plugins: [plugin],
        maxPluginCompileChainDepth: 3,
        config: { cacheMaxPages: 2 }
      });

      // page1 and page2 both vote for text-red-500 → promoted
      await compileViaHttp(port, 'proj', 'page1', 'text-red-500');
      await compileViaHttp(port, 'proj', 'page2', 'text-red-500');
      await new Promise(r => setTimeout(r, 300));

      const before = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(before.proj.promoted).toContain('text-red-500');

      // page3 compile evicts page1 from core cache (cacheMaxPages: 2)
      await compileViaHttp(port, 'proj', 'page3', 'bg-blue-500');

      // page2 stops using text-red-500 — reconcileProject removes page1's ghost vote
      await compileViaHttp(port, 'proj', 'page2', 'bg-blue-500');
      await new Promise(r => setTimeout(r, 300));

      const after = await (await fetch(`http://localhost:${port}/plugins/auto-promote/stats`)).json();
      expect(after.proj.promoted).not.toContain('text-red-500');

      await stopServer({ server, close });
    });

    it('no spurious storage persist when promoted set is and remains empty', async () => {
      // Previously, onCompileResult always set shouldPersist=true when
      // newPromoted.size===0, even when nothing changed (no classes ever promoted).
      // Fixed by gating on `changed &&` so unchanged-empty state skips the persist.
      let persistCallCount = 0;
      const plugin = createAutoPromotePlugin({ threshold: 10 }); // threshold never reached
      const { port, server, close } = await startServer({
        plugins: [plugin],
        cacheStore: {
          async readPageArtifact() { return null; },
          async upsertPageArtifact() {},
          async deletePageArtifact() {},
          async deleteProjectPageArtifacts() {},
          async readProjectArtifact() { return null; },
          async upsertProjectArtifact() {},
          async deleteProjectArtifact() {},
          async readPluginData() { return null; },
          async writePluginData() { persistCallCount++; },
          async deletePluginData() {},
          async listPluginData() { return []; }
        }
      });

      const before = persistCallCount;
      // Rapid burst of compiles — all below threshold, promoted set stays empty
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          compileViaHttp(port, 'proj', `p${i}`, 'text-red-500')
        )
      );
      await new Promise(r => setTimeout(r, 500));

      // transformClasses persists on class tracking changes (expected, debounced to ≤1).
      // onCompileResult must NOT add extra persists when promoted set stays empty.
      const persistsFromCompiles = persistCallCount - before;
      expect(persistsFromCompiles).toBeLessThanOrEqual(1);

      await stopServer({ server, close });
    });
  });
});
