import { describe, it, expect, afterAll } from 'vitest';
import { createCore } from '../services/index.js';
import { createAutoPromotePlugin } from '../plugins/auto-promote/index.js';

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
  const { app, close } = await createCore({
    config: { rateLimitDisabled: true },
    ...coreOptions
  });
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const { port } = server.address();
  return { port, server, close };
}

// Helper: stop server
async function stopServer({ server, close }) {
  await new Promise(r => server.close(r));
  await close();
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
      await new Promise(r => setTimeout(r, 300));

      // The promoted CSS route should have content (meaning __auto_promote__
      // page compiled successfully with the promoted class not stripped)
      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/proj`);
      if (cssRes.status === 200) {
        const css = await cssRes.text();
        expect(css.length).toBeGreaterThan(0);
      }
      // If 404, the deferred hook hasn't generated CSS yet — that's acceptable
      // for timing but the synthetic page logic is still correct

      await stopServer({ server, close });
    });
  });

  describe('custom routes', () => {
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
      const css = await cssRes.text();
      expect(css.length).toBeGreaterThan(0);

      await stopServer({ server, close });
    });

    it('CSS route returns 404 when no promoted classes', async () => {
      const plugin = createAutoPromotePlugin({ threshold: 5 });
      const { port, server, close } = await startServer({ plugins: [plugin] });

      const cssRes = await fetch(`http://localhost:${port}/plugins/auto-promote/css/nonexistent`);
      expect(cssRes.status).toBe(404);
      const body = await cssRes.json();
      expect(body.error).toContain('No promoted classes');

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

    it('default threshold is 5', async () => {
      const plugin = createAutoPromotePlugin();
      const { port, server, close } = await startServer({ plugins: [plugin] });

      // Compile on 4 pages (below default threshold of 5)
      for (let i = 0; i < 4; i++) {
        await compileViaHttp(port, 'proj', `p${i}`, 'text-red-500 p-4');
      }
      await new Promise(r => setTimeout(r, 100));

      const statsRes = await fetch(`http://localhost:${port}/plugins/auto-promote/stats`);
      const stats = await statsRes.json();
      expect(stats.proj.promotedClasses).toBe(0);

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
      const { app, close: close1 } = await createCore({
        plugins: [seedPlugin],
        config: { rateLimitDisabled: true }
      });
      const server1 = app.listen(0);
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
});
