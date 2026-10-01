import { describe, it, expect, afterAll } from 'vitest';
import { createCore } from '../services/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeoutMs = 1500, intervalMs = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

describe('Plugin identity and name validation', () => {
  it('throws on duplicate plugin names', async () => {
    await expect(createCore({
      plugins: [
        { name: 'analytics' },
        { name: 'analytics' }
      ]
    })).rejects.toThrow(/collides with existing plugin/);
  });

  it('throws on case-insensitive name collisions (Foo vs foo)', async () => {
    await expect(createCore({
      plugins: [
        { name: 'Foo' },
        { name: 'foo' }
      ]
    })).rejects.toThrow(/collides with existing plugin/);
  });

  it('throws on invalid plugin name characters', async () => {
    await expect(createCore({
      plugins: [{ name: 'my plugin!' }]
    })).rejects.toThrow(/Invalid plugin name/);
  });

  it('throws on plugin name exceeding 64 characters', async () => {
    await expect(createCore({
      plugins: [{ name: 'a'.repeat(65) }]
    })).rejects.toThrow(/Invalid plugin name/);
  });

  it('accepts valid plugin names with hyphens and underscores', async () => {
    const { app } = await createCore({
      plugins: [
        { name: 'my-plugin_v2' },
        { name: 'AnotherPlugin123' }
      ]
    });
    expect(app).toBeTruthy();
  });

  it('auto-assigns names (plugin-1, plugin-2) that do not collide', async () => {
    const { app } = await createCore({
      plugins: [{}, {}]
    });
    expect(app).toBeTruthy();
  });

  it('auto-assigned name collides with explicit name', async () => {
    await expect(createCore({
      plugins: [
        { name: 'plugin-2' },
        {},  // would be auto-named plugin-2
      ]
    })).rejects.toThrow(/collides with existing plugin/);
  });

  it('accepts exactly 64 character name', async () => {
    const { app } = await createCore({
      plugins: [{ name: 'a'.repeat(64) }]
    });
    expect(app).toBeTruthy();
  });
});

describe('Plugin lifecycle (setup, teardown, close)', () => {
  it('calls setup() during createCore and teardown() on close', async () => {
    const events = [];
    const plugin = {
      name: 'lifecycle',
      setup(ctx) { events.push('setup'); },
      teardown() { events.push('teardown'); }
    };
    const { close } = await createCore({ plugins: [plugin] });
    expect(events).toEqual(['setup']);
    await close();
    expect(events).toEqual(['setup', 'teardown']);
  });

  it('setup error marks plugin as failed and does not prevent startup', async () => {
    const events = [];
    const failPlugin = {
      name: 'fail-setup',
      setup() { throw new Error('setup boom'); },
      onCompileStart() { events.push('should-not-fire'); }
    };
    const goodPlugin = {
      name: 'good',
      onCompileStart() { events.push('good-fired'); }
    };

    const { app, close } = await createCore({
      plugins: [failPlugin, goodPlugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p', pageId: 'pg', classes: 'text-red-500' })
    });

    await new Promise(r => server.close(r));
    await close();

    expect(events).not.toContain('should-not-fire');
    expect(events).toContain('good-fired');
  });

  it('setup timeout marks plugin as failed', async () => {
    const plugin = {
      name: 'slow-setup',
      setup() { return new Promise(r => setTimeout(r, 2000)); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      setupTimeoutMs: 50
    });
    expect(app).toBeTruthy();
    await close();
  });

  it('teardown is called in reverse order', async () => {
    const order = [];
    const { close } = await createCore({
      plugins: [
        { name: 'first', setup() {}, teardown() { order.push('first'); } },
        { name: 'second', setup() {}, teardown() { order.push('second'); } },
        { name: 'third', setup() {}, teardown() { order.push('third'); } }
      ]
    });
    await close();
    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('close() is idempotent', async () => {
    let count = 0;
    const { close } = await createCore({
      plugins: [{ name: 'counter', setup() {}, teardown() { count++; } }]
    });
    await Promise.all([close(), close(), close()]);
    expect(count).toBe(1);
  });
});

describe('Plugin routes', () => {
  let server, baseUrl, closeFn;

  afterAll(async () => {
    if (server) await new Promise(r => server.close(r));
    if (closeFn) await closeFn();
  });

  it('mounts plugin routes at /plugins/<name> and responds', async () => {
    const plugin = {
      name: 'dashboard',
      setup({ addRoute }) {
        addRoute('get', '/stats', (req, res) => {
          res.json({ ok: true });
        });
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });
    closeFn = close;

    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;

    const response = await fetch(`${baseUrl}/plugins/dashboard/stats`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it('addRoute after setup() throws', async () => {
    let capturedAddRoute;
    const plugin = {
      name: 'stasher',
      setup({ addRoute }) {
        capturedAddRoute = addRoute;
      }
    };

    const { close } = await createCore({ plugins: [plugin] });
    expect(() => capturedAddRoute('get', '/late', () => {})).toThrow(/only available during setup/);
    await close();
  });

  it('rejects invalid HTTP method', async () => {
    const plugin = {
      name: 'bad-method',
      setup({ addRoute }) {
        addRoute('TRACE', '/x', () => {});
      }
    };

    const { close } = await createCore({ plugins: [plugin] });
    await close();
    // Plugin should be marked as failed (setup threw), but createCore didn't throw
  });

  it('rejects invalid route path', async () => {
    const plugin = {
      name: 'bad-path',
      setup({ addRoute }) {
        addRoute('get', 'no-leading-slash', () => {});
      }
    };

    const { close } = await createCore({ plugins: [plugin] });
    await close();
  });

  it('failed plugin routes are not mounted', async () => {
    const plugin = {
      name: 'fail-routes',
      setup({ addRoute }) {
        addRoute('get', '/before-fail', (req, res) => res.json({ ok: true }));
        throw new Error('setup failed');
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const srv = app.listen(0);
    await new Promise(r => srv.once('listening', r));
    const { port } = srv.address();

    const response = await fetch(`http://localhost:${port}/plugins/fail-routes/before-fail`);
    expect(response.status).toBe(404);

    await new Promise(r => srv.close(r));
    await close();
  });
});

describe('Plugin context query functions', () => {
  it('returns frozen snapshots from query functions', async () => {
    const results = {};
    const plugin = {
      name: 'query-test',
      setup(ctx) {
        results.projectIds = ctx.getProjectIds();
        results.cacheStats = ctx.getCacheStats();
        results.config = ctx.getConfig();
      }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { cacheMaxPages: 100 }
    });

    expect(results.projectIds).toEqual([]);
    expect(results.cacheStats).toEqual({ totalPages: 0, maxPages: 100, projectCount: 0 });
    expect(results.config.cacheMaxPages).toBe(100);
    expect(Object.isFrozen(results.cacheStats)).toBe(true);
    expect(Object.isFrozen(results.config)).toBe(true);

    await close();
  });

  it('getCss is a pure peek (no TTL refresh, no computation)', async () => {
    let ctxRef;
    const plugin = {
      name: 'peek-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    // Before any compile, getCss returns null
    expect(ctxRef.getCss('proj', 'page', 'full')).toBeNull();

    // Compile a page
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj', pageId: 'page', classes: 'text-red-500' })
    });

    // Now getCss returns CSS
    const css = ctxRef.getCss('proj', 'page', 'full');
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);

    // Asking for utilities bundle that hasn't been compiled returns null (no computation)
    expect(ctxRef.getCss('proj', 'page', 'utilities')).toBeNull();

    await new Promise(r => server.close(r));
    await close();
  });

  it('getProjectCss is a pure peek', async () => {
    let ctxRef;
    const plugin = {
      name: 'project-peek',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    expect(ctxRef.getProjectCss('nope')).toBeNull();

    // Compile to populate project
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'pp', pageId: 'pg', classes: 'text-blue-500' })
    });

    // Project CSS cache isn't populated until the project CSS route is hit
    expect(ctxRef.getProjectCss('pp')).toBeNull();

    // Hit the project route to populate the cache
    await fetch(`http://localhost:${port}/api/projects/pp/css`);
    const css = ctxRef.getProjectCss('pp');
    expect(typeof css).toBe('string');
    expect(css.length).toBeGreaterThan(0);

    await new Promise(r => server.close(r));
    await close();
  });

  it('validateClasses returns only valid Tailwind utilities', async () => {
    let ctxRef;
    const plugin = {
      name: 'validate-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    const valid = await ctxRef.validateClasses('text-red-500 not-real bg-blue-500');
    expect(valid).toContain('text-red-500');
    expect(valid).toContain('bg-blue-500');
    expect(valid).not.toContain('not-real');

    await close();
  });

  it('hook context includes query functions', async () => {
    let hookCtx;
    const plugin = {
      name: 'hook-ctx-check',
      onCompileResult(ctx) {
        hookCtx = ctx;
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'hc', pageId: 'pg', classes: 'p-4' })
    });

    await new Promise(r => server.close(r));
    await close();

    expect(hookCtx.projectId).toBe('hc');
    expect(hookCtx.pageId).toBe('pg');
    expect(typeof hookCtx.getProjectIds).toBe('function');
    expect(typeof hookCtx.getPageIds).toBe('function');
    expect(typeof hookCtx.getCacheStats).toBe('function');
    expect(typeof hookCtx.getConfig).toBe('function');
    expect(typeof hookCtx.getCss).toBe('function');
    expect(typeof hookCtx.getProjectCss).toBe('function');
    expect(typeof hookCtx.evictPage).toBe('function');
    expect(typeof hookCtx.evictProject).toBe('function');
    expect(typeof hookCtx.purgePage).toBe('function');
    expect(typeof hookCtx.purgeProject).toBe('function');
    expect(typeof hookCtx.compile).toBe('function');
    expect(typeof hookCtx.hydratePageArtifact).toBe('function');
    expect(typeof hookCtx.hydrateProjectArtifact).toBe('function');
    expect(hookCtx.getProjectIds()).toContain('hc');
    expect(hookCtx.getPageIds('hc')).toContain('pg');
    expect(hookCtx.storage).toBeUndefined();
  });
});

describe('Plugin mutation functions', () => {
  it('setup context includes namespaced storage helpers', async () => {
    let ctxRef;
    const plugin = {
      name: 'ctx-storage',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    expect(typeof ctxRef.storage).toBe('object');
    expect(typeof ctxRef.storage.get).toBe('function');
    expect(typeof ctxRef.storage.set).toBe('function');
    expect(typeof ctxRef.storage.delete).toBe('function');
    expect(typeof ctxRef.storage.list).toBe('function');

    await close();
  });

  it('plugin storage is namespaced per plugin route name', async () => {
    const entries = new Map();
    const calls = [];

    const cacheStore = {
      async readPluginData({ pluginName, key }) {
        calls.push({ op: 'readPluginData', pluginName, key });
        return entries.has(`${pluginName}:${key}`) ? entries.get(`${pluginName}:${key}`) : null;
      },
      async writePluginData({ pluginName, key, value }) {
        calls.push({ op: 'writePluginData', pluginName, key });
        entries.set(`${pluginName}:${key}`, value);
      },
      async deletePluginData({ pluginName, key }) {
        calls.push({ op: 'deletePluginData', pluginName, key });
        entries.delete(`${pluginName}:${key}`);
      },
      async listPluginData({ pluginName, prefix }) {
        calls.push({ op: 'listPluginData', pluginName, prefix });
        const fullPrefix = `${pluginName}:`;
        const keys = [];
        for (const fullKey of entries.keys()) {
          if (!fullKey.startsWith(fullPrefix)) continue;
          const key = fullKey.slice(fullPrefix.length);
          if (!prefix || key.startsWith(prefix)) keys.push(key);
        }
        return keys;
      }
    };

    let alphaStorage;
    let betaStorage;
    const alpha = {
      name: 'Alpha',
      setup(ctx) { alphaStorage = ctx.storage; }
    };
    const beta = {
      name: 'Beta',
      setup(ctx) { betaStorage = ctx.storage; }
    };

    const { close } = await createCore({
      plugins: [alpha, beta],
      cacheStore,
      config: { rateLimitDisabled: true }
    });

    await alphaStorage.set('metrics', { count: 1 });
    await betaStorage.set('metrics', { count: 2 });
    await alphaStorage.set('meta:1', { flag: true });

    expect(await alphaStorage.get('metrics')).toEqual({ count: 1 });
    expect(await betaStorage.get('metrics')).toEqual({ count: 2 });
    expect(await alphaStorage.list()).toEqual(expect.arrayContaining(['metrics', 'meta:1']));
    expect(await alphaStorage.list('met')).toEqual(expect.arrayContaining(['metrics']));
    expect(await betaStorage.list()).toEqual(['metrics']);

    await alphaStorage.delete('metrics');
    expect(await alphaStorage.get('metrics')).toBeNull();
    expect(await betaStorage.get('metrics')).toEqual({ count: 2 });

    expect(entries.has('alpha:metrics')).toBe(false);
    expect(entries.get('beta:metrics')).toEqual({ count: 2 });
    expect(calls.some((call) => call.pluginName === 'alpha')).toBe(true);
    expect(calls.some((call) => call.pluginName === 'beta')).toBe(true);
    expect(calls.some((call) => call.op === 'listPluginData' && call.pluginName === 'alpha')).toBe(true);

    await close();
  });

  it('plugin storage fails open when cacheStore plugin methods are missing', async () => {
    const errors = [];
    let storage;
    const plugin = {
      name: 'storage-fail-open',
      setup(ctx) { storage = ctx.storage; }
    };
    const collector = {
      name: 'storage-missing-method-errors',
      onError(info) { errors.push(info); }
    };

    const { close } = await createCore({
      plugins: [plugin, collector],
      cacheStore: {},
      config: { rateLimitDisabled: true }
    });

    expect(await storage.get('metrics')).toBeNull();
    expect(await storage.set('metrics', { count: 1 })).toBe(false);
    expect(await storage.delete('metrics')).toBe(false);
    expect(await storage.list()).toEqual([]);

    const ops = errors
      .filter((entry) => entry?.stage === 'cache-store')
      .map((entry) => entry.op);

    expect(ops).toContain('readPluginData');
    expect(ops).toContain('writePluginData');
    expect(ops).toContain('deletePluginData');
    expect(ops).toContain('listPluginData');
    expect(
      errors.some(
        (entry) =>
          entry?.stage === 'cache-store' &&
          entry?.error?.code === 'CACHE_STORE_METHOD_MISSING' &&
          entry?.timedOut === false &&
          entry?.context?.pluginName === 'storage-fail-open' &&
          entry?.context?.key === 'metrics'
      )
    ).toBe(true);

    await close();
  });

  it('plugin storage honors cacheStore timeouts and reports onError', async () => {
    const errors = [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const collector = {
      name: 'collector',
      onError(ctx) { errors.push(ctx); }
    };

    let storage;
    const probe = {
      name: 'probe-store',
      setup(ctx) { storage = ctx.storage; }
    };

    const cacheStore = {
      async readPluginData() {
        await sleep(80);
        return { stale: true };
      },
      async writePluginData() {
        await sleep(80);
      },
      async deletePluginData() {
        await sleep(80);
      },
      async listPluginData() {
        await sleep(80);
        return ['metrics'];
      }
    };

    const { close } = await createCore({
      plugins: [probe, collector],
      cacheStore,
      cacheStoreTimeoutMs: 20,
      config: { rateLimitDisabled: true }
    });

    expect(await storage.get('metrics')).toBeNull();
    expect(await storage.set('metrics', { count: 1 })).toBe(false);
    expect(await storage.delete('metrics')).toBe(false);
    expect(await storage.list('met')).toEqual([]);

    const ops = errors
      .filter((entry) => entry?.stage === 'cache-store')
      .map((entry) => entry.op);

    expect(ops).toContain('readPluginData');
    expect(ops).toContain('writePluginData');
    expect(ops).toContain('deletePluginData');
    expect(ops).toContain('listPluginData');
    expect(
      errors.some(
        (entry) =>
          entry?.stage === 'cache-store' &&
          entry?.context?.pluginName === 'probe-store' &&
          entry?.context?.key === 'metrics' &&
          entry?.timedOut === true
      )
    ).toBe(true);

    await close();
  });

  it('plugin storage rejects invalid keys', async () => {
    let storage;
    const plugin = {
      name: 'storage-key-guard',
      setup(ctx) { storage = ctx.storage; }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    await expect(storage.get('bad key')).rejects.toThrow(/Invalid storage key/);
    await expect(storage.set('../metrics', { count: 1 })).rejects.toThrow(/Invalid storage key/);
    await expect(storage.delete('')).rejects.toThrow(/Invalid storage key/);
    await expect(storage.list('bad prefix')).rejects.toThrow(/Invalid storage prefix/);

    await close();
  });

  it('evictPage removes a page from cache', async () => {
    let ctxRef;
    const plugin = {
      name: 'evict-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    // Compile a page
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'evict-proj', pageId: 'p1', classes: 'text-red-500' })
    });

    expect(ctxRef.getPageIds('evict-proj')).toContain('p1');

    // Evict
    ctxRef.evictPage('evict-proj', 'p1');
    expect(ctxRef.getPageIds('evict-proj')).toBeNull(); // project removed since it was last page

    await new Promise(r => server.close(r));
    await close();
  });

  it('evictProject removes all pages and the project', async () => {
    let ctxRef;
    const plugin = {
      name: 'evict-proj-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    // Compile two pages
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ep', pageId: 'p1', classes: 'text-red-500' })
    });
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ep', pageId: 'p2', classes: 'bg-blue-500' })
    });

    expect(ctxRef.getProjectIds()).toContain('ep');
    expect(ctxRef.getPageIds('ep')).toHaveLength(2);

    ctxRef.evictProject('ep');
    expect(ctxRef.getProjectIds()).not.toContain('ep');

    await new Promise(r => server.close(r));
    await close();
  });

  it('purgePage removes in-memory cache and persisted page artifacts', async () => {
    let ctxRef;
    const pageArtifacts = new Map();

    const cacheStore = {
      async upsertPageArtifact({ projectId, pageId, bundle, css, hash, classes, updatedAt, expiresAt }) {
        pageArtifacts.set(`${projectId}:${pageId}:${bundle}`, {
          projectId, pageId, bundle, css, hash, classes, updatedAt, expiresAt
        });
      },
      async deletePageArtifact({ projectId, pageId, bundle }) {
        pageArtifacts.delete(`${projectId}:${pageId}:${bundle}`);
      }
    };

    const plugin = {
      name: 'purge-page',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({
      plugins: [plugin],
      cacheStore,
      config: { rateLimitDisabled: true }
    });

    await ctxRef.compile({ projectId: 'pp', pageId: 'home', classes: 'text-red-500', bundle: 'full' });
    await ctxRef.compile({ projectId: 'pp', pageId: 'home', classes: 'text-red-500', bundle: 'utilities' });
    await ctxRef.compile({ projectId: 'pp', pageId: 'home', classes: 'text-red-500', bundle: 'theme' });

    const wroteAll = await waitFor(() => pageArtifacts.size === 3, { timeoutMs: 2000 });
    expect(wroteAll).toBe(true);

    const result = await ctxRef.purgePage('pp', 'home');
    expect(result).toBe(true);
    expect(ctxRef.getPageIds('pp')).toBeNull();
    expect(pageArtifacts.size).toBe(0);

    await close();
  });

  it('purgeProject removes in-memory cache and persisted project/page artifacts', async () => {
    let ctxRef;
    const pageArtifacts = new Map();
    const projectArtifacts = new Map();

    const cacheStore = {
      async upsertPageArtifact({ projectId, pageId, bundle, css, hash, classes, updatedAt, expiresAt }) {
        pageArtifacts.set(`${projectId}:${pageId}:${bundle}`, {
          projectId, pageId, bundle, css, hash, classes, updatedAt, expiresAt
        });
      },
      async deletePageArtifact({ projectId, pageId, bundle }) {
        pageArtifacts.delete(`${projectId}:${pageId}:${bundle}`);
      },
      async upsertProjectArtifact({ projectId, bundle, css, hash, updatedAt, expiresAt }) {
        projectArtifacts.set(`${projectId}:${bundle}`, {
          projectId, bundle, css, hash, updatedAt, expiresAt
        });
      },
      async deleteProjectArtifact({ projectId, bundle }) {
        projectArtifacts.delete(`${projectId}:${bundle}`);
      }
    };

    const plugin = {
      name: 'purge-project',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      cacheStore,
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'purge-proj', pageId: 'p1', classes: 'text-red-500' })
    });
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'purge-proj', pageId: 'p2', classes: 'bg-blue-500' })
    });

    const projectCss = await fetch(`${baseUrl}/api/projects/purge-proj/css`);
    expect(projectCss.status).toBe(200);

    const wroteArtifacts = await waitFor(
      () => pageArtifacts.size >= 2 && projectArtifacts.size >= 1,
      { timeoutMs: 2000 }
    );
    expect(wroteArtifacts).toBe(true);

    const result = await ctxRef.purgeProject('purge-proj');
    expect(result).toBe(true);
    expect(ctxRef.getProjectIds()).not.toContain('purge-proj');
    expect(pageArtifacts.size).toBe(0);
    expect(projectArtifacts.size).toBe(0);

    const pageAfterPurge = await fetch(`${baseUrl}/api/css?projectId=purge-proj&pageId=p1`);
    expect(pageAfterPurge.status).toBe(404);
    expect(await pageAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });

    const projectAfterPurge = await fetch(`${baseUrl}/api/projects/purge-proj/css`);
    expect(projectAfterPurge.status).toBe(404);
    expect(await projectAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });

    await new Promise(r => server.close(r));
    await close();
  });

  it('compile() from plugin context populates cache', async () => {
    let ctxRef;
    const plugin = {
      name: 'compile-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const result = await ctxRef.compile({
      projectId: 'ct', pageId: 'p1', classes: 'text-red-500 bg-blue-500'
    });

    expect(result.error).toBeUndefined();
    expect(result.classes).toContain('text-red-500');
    expect(result.classes).toContain('bg-blue-500');
    expect(result.css.length).toBeGreaterThan(0);
    expect(ctxRef.getProjectIds()).toContain('ct');
    expect(ctxRef.getPageIds('ct')).toContain('p1');

    await close();
  });

  it('compile() validates inputs and returns error', async () => {
    let ctxRef;
    const plugin = {
      name: 'validate-compile',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    const r1 = await ctxRef.compile({});
    expect(r1.error).toBeTruthy();
    expect(r1.status).toBe(400);

    const r2 = await ctxRef.compile({ projectId: 'ok', pageId: 'p!!!' });
    expect(r2.error).toBeTruthy();
    expect(r2.status).toBe(400);

    await close();
  });

  it('compile() fires hooks with source "plugin" and request null', async () => {
    const hookPayloads = [];
    let ctxRef;
    const plugin = {
      name: 'source-test',
      setup(ctx) { ctxRef = ctx; },
      onCompileStart(ctx) { hookPayloads.push({ hook: 'start', source: ctx.source, request: ctx.request }); },
      onCompileResult(ctx) { hookPayloads.push({ hook: 'result', source: ctx.source, request: ctx.request }); }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    await ctxRef.compile({ projectId: 'sp', pageId: 'p1', classes: 'text-red-500' });

    const start = hookPayloads.find(h => h.hook === 'start');
    const result = hookPayloads.find(h => h.hook === 'result');
    expect(start.source).toBe('plugin');
    expect(start.request).toBeNull();
    expect(result.source).toBe('plugin');
    expect(result.request).toBeNull();

    await close();
  });

  it('HTTP compile fires hooks with source "http" and request object', async () => {
    const hookPayloads = [];
    const plugin = {
      name: 'http-source',
      onCompileStart(ctx) { hookPayloads.push({ hook: 'start', source: ctx.source, request: ctx.request }); },
      onCompileResult(ctx) { hookPayloads.push({ hook: 'result', source: ctx.source, request: ctx.request }); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'hs', pageId: 'p1', classes: 'text-red-500' })
    });

    await new Promise(r => server.close(r));
    await close();

    const start = hookPayloads.find(h => h.hook === 'start');
    expect(start.source).toBe('http');
    expect(start.request).toBeTruthy();
    expect(start.request.method).toBe('POST');
    expect(start.request.path).toBe('/api/compile');
  });

  it('hydratePageArtifact injects artifact into cache', async () => {
    let ctxRef;
    const plugin = {
      name: 'hydrate-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    const result = ctxRef.hydratePageArtifact({
      projectId: 'hp', pageId: 'p1', bundle: 'full',
      css: '.text-red-500 { color: red; }',
      classes: ['text-red-500'],
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60000
    });

    expect(result).toBe(true);
    expect(ctxRef.getProjectIds()).toContain('hp');
    expect(ctxRef.getCss('hp', 'p1', 'full')).toBe('.text-red-500 { color: red; }');

    await close();
  });

  it('hydratePageArtifact rejects invalid artifacts', async () => {
    let ctxRef;
    const plugin = {
      name: 'hydrate-reject',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    // Missing css
    expect(ctxRef.hydratePageArtifact({
      projectId: 'hp', pageId: 'p1', bundle: 'full',
      classes: ['text-red-500']
    })).toBe(false);

    // Expired
    expect(ctxRef.hydratePageArtifact({
      projectId: 'hp', pageId: 'p1', bundle: 'full',
      css: '.x { }', classes: ['x'],
      expiresAt: Date.now() - 1000
    })).toBe(false);

    await close();
  });

  it('hydratePageArtifact without classes on new page returns false', async () => {
    let ctxRef;
    const plugin = {
      name: 'hydrate-no-classes',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    const result = ctxRef.hydratePageArtifact({
      projectId: 'hnc', pageId: 'p1', bundle: 'full',
      css: '.x { color: red; }',
      expiresAt: Date.now() + 60000
    });

    expect(result).toBe(false);

    await close();
  });

  it('hydrateProjectArtifact works when project exists', async () => {
    let ctxRef;
    const plugin = {
      name: 'hydrate-proj',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    // Must have a page first
    await ctxRef.compile({ projectId: 'hpa', pageId: 'p1', classes: 'text-red-500' });

    const result = ctxRef.hydrateProjectArtifact({
      projectId: 'hpa', bundle: 'full',
      css: '.combined { color: red; }',
      hash: 'abc123',
      expiresAt: Date.now() + 60000
    });

    expect(result).toBe(true);
    expect(ctxRef.getProjectCss('hpa')).toBe('.combined { color: red; }');

    await close();
  });

  it('hydrateProjectArtifact returns false when project does not exist', async () => {
    let ctxRef;
    const plugin = {
      name: 'hydrate-proj-miss',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    const result = ctxRef.hydrateProjectArtifact({
      projectId: 'nonexistent', bundle: 'full',
      css: '.x { }', hash: 'abc',
      expiresAt: Date.now() + 60000
    });

    expect(result).toBe(false);

    await close();
  });

  it('compile() during setup warms cache before server handles requests', async () => {
    let setupComplete = false;
    const plugin = {
      name: 'warmup',
      async setup(ctx) {
        await ctx.compile({ projectId: 'warm', pageId: 'p1', classes: 'text-red-500' });
        setupComplete = true;
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    expect(setupComplete).toBe(true);

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    // The page should already be cached
    const res = await fetch(`http://localhost:${port}/api/css?projectId=warm&pageId=p1`);
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css.length).toBeGreaterThan(0);

    await new Promise(r => server.close(r));
    await close();
  });

  it('reentrancy guard: compile inside onCompileResult skips hooks', async () => {
    const hookCalls = [];
    let ctxRef;
    const plugin = {
      name: 'reentrant',
      setup(ctx) { ctxRef = ctx; },
      async onCompileResult(ctx) {
        hookCalls.push(`result:${ctx.pageId}`);
        if (ctx.pageId === 'trigger') {
          // This compile should be guarded (inside a hook)
          await ctxRef.compile({ projectId: ctx.projectId, pageId: 'inner', classes: 'bg-blue-500' });
        }
      }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    await ctxRef.compile({ projectId: 'rp', pageId: 'trigger', classes: 'text-red-500' });

    // Wait for any deferred microtasks
    await new Promise(r => setTimeout(r, 50));

    // The outer compile fires onCompileResult for 'trigger'
    // The inner compile should NOT fire onCompileResult for 'inner' (reentrancy guard)
    expect(hookCalls).toContain('result:trigger');
    expect(hookCalls).not.toContain('result:inner');

    // But the inner compile should still have cached the result
    expect(ctxRef.getPageIds('rp')).toContain('inner');

    await close();
  });

  it('chain depth enforcement rejects deep chains', async () => {
    let ctxRef;
    const plugin = {
      name: 'chain-test',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({
      plugins: [plugin],
      maxPluginCompileChainDepth: 1,
      config: { rateLimitDisabled: true }
    });

    // Direct compile from plugin context (depth 0 -> should succeed)
    const r1 = await ctxRef.compile({ projectId: 'cd', pageId: 'p1', classes: 'text-red-500' });
    expect(r1.error).toBeUndefined();

    await close();
  });

  it('pluginContext includes mutation functions', async () => {
    let ctxRef;
    const plugin = {
      name: 'ctx-fns',
      setup(ctx) { ctxRef = ctx; }
    };

    const { close } = await createCore({ plugins: [plugin] });

    // Mutation functions are available
    expect(typeof ctxRef.compile).toBe('function');
    expect(typeof ctxRef.evictPage).toBe('function');
    expect(typeof ctxRef.evictProject).toBe('function');
    expect(typeof ctxRef.purgePage).toBe('function');
    expect(typeof ctxRef.purgeProject).toBe('function');
    expect(typeof ctxRef.hydratePageArtifact).toBe('function');
    expect(typeof ctxRef.hydrateProjectArtifact).toBe('function');
    expect(typeof ctxRef.storage).toBe('object');
    expect(typeof ctxRef.storage.get).toBe('function');
    expect(typeof ctxRef.storage.set).toBe('function');
    expect(typeof ctxRef.storage.delete).toBe('function');
    expect(typeof ctxRef.storage.list).toBe('function');

    // Query functions are available
    expect(typeof ctxRef.getProjectIds).toBe('function');
    expect(typeof ctxRef.getCacheStats).toBe('function');
    expect(typeof ctxRef.validateClasses).toBe('function');

    await close();
  });
});

describe('Pipeline hooks (transformClasses, transformCss)', () => {
  it('transformClasses filters classes from compile output', async () => {
    const plugin = {
      name: 'class-filter',
      transformClasses({ value }) {
        return value.filter(c => !c.startsWith('bg-'));
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'tf', pageId: 'p1', classes: 'text-red-500 bg-blue-500' })
    });

    const body = await res.json();
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).not.toContain('bg-blue-500');

    await new Promise(r => server.close(r));
    await close();
  });

  it('transformClasses output is re-validated (invalid classes removed)', async () => {
    const plugin = {
      name: 'class-inject',
      transformClasses({ value }) {
        return [...value, 'not-a-real-class'];
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'rv', pageId: 'p1', classes: 'text-red-500' })
    });

    const body = await res.json();
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).not.toContain('not-a-real-class');

    await new Promise(r => server.close(r));
    await close();
  });

  it('transformClasses resulting in empty classes returns 400', async () => {
    const plugin = {
      name: 'class-empty',
      transformClasses() {
        return [];
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'em', pageId: 'p1', classes: 'text-red-500' })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No valid classes');

    await new Promise(r => server.close(r));
    await close();
  });

  it('transformCss modifies CSS in response', async () => {
    const plugin = {
      name: 'css-mod',
      transformCss({ value }) {
        return `/* custom header */\n${value}`;
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'cm', pageId: 'p1', classes: 'text-red-500' })
    });

    const body = await res.json();
    expect(body.css).toContain('/* custom header */');

    await new Promise(r => server.close(r));
    await close();
  });

  it('transformCss output exceeding maxCssChars is rejected', async () => {
    const errors = [];
    const plugin = {
      name: 'css-bloat',
      transformCss() {
        return 'x'.repeat(3000000);
      },
      onError(info) { errors.push(info); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true, maxCssChars: 2000000 }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'cb', pageId: 'p1', classes: 'text-red-500' })
    });

    const body = await res.json();
    expect(body.css.length).toBeLessThan(3000000);
    expect(body.success).toBe(true);

    await new Promise(r => setTimeout(r, 30));
    await new Promise(r => server.close(r));
    await close();

    expect(errors.some(e => e.stage === 'transform')).toBe(true);
  });

  it('throwing transform hook falls through gracefully', async () => {
    const plugin = {
      name: 'throw-transform',
      transformClasses() { throw new Error('transform boom'); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'tt', pageId: 'p1', classes: 'text-red-500' })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classes).toContain('text-red-500');

    await new Promise(r => server.close(r));
    await close();
  });
});

describe('Pipeline hooks (transformSuggestions)', () => {
  it('transformSuggestions modifies suggestion results', async () => {
    const plugin = {
      name: 'suggest-filter',
      transformSuggestions({ value }) {
        return value.filter(s => s.includes('red'));
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'sf', pageId: 'p1', classes: 'text-red-500 bg-blue-500' })
    });

    const res = await fetch(`http://localhost:${port}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'sf', prefix: '', limit: 50 })
    });

    const body = await res.json();
    expect(body.suggestions.every(s => s.includes('red'))).toBe(true);

    await new Promise(r => server.close(r));
    await close();
  });

  it('transformSuggestions respects limit after transform', async () => {
    const plugin = {
      name: 'suggest-expand',
      transformSuggestions({ value }) {
        return [...value, 'extra-1', 'extra-2', 'extra-3'];
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'se', prefix: '', limit: 2, classes: 'text-red-500' })
    });

    const body = await res.json();
    expect(body.suggestions.length).toBeLessThanOrEqual(2);

    await new Promise(r => server.close(r));
    await close();
  });
});

describe('Resolve hooks (resolvePageCss, resolveProjectCss)', () => {
  it('resolvePageCss short-circuits cache miss with plugin-provided CSS', async () => {
    const plugin = {
      name: 'page-resolver',
      resolvePageCss({ projectId, pageId }) {
        if (projectId === 'rp' && pageId === 'p1') {
          return { css: '.resolved { color: green; }' };
        }
        return null;
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=rp&pageId=p1`);
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toBe('.resolved { color: green; }');

    await new Promise(r => server.close(r));
    await close();
  });

  it('resolveProjectCss short-circuits project cache miss', async () => {
    const plugin = {
      name: 'project-resolver',
      resolveProjectCss({ projectId }) {
        if (projectId === 'rpp') {
          return { css: '.project-resolved { margin: 0; }' };
        }
        return null;
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/projects/rpp/css`);
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toBe('.project-resolved { margin: 0; }');

    await new Promise(r => server.close(r));
    await close();
  });

  it('resolve with invalid payload falls through to NOT_FOUND', async () => {
    const plugin = {
      name: 'bad-resolver',
      resolvePageCss() {
        return { notCss: 'oops' };
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=bad&pageId=p1`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });

    await new Promise(r => server.close(r));
    await close();
  });

  it('resolve with oversized CSS is rejected and fires onError', async () => {
    const errors = [];
    const plugin = {
      name: 'big-resolver',
      resolvePageCss() {
        return { css: 'x'.repeat(3000000) };
      },
      onError(info) { errors.push(info); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true, maxCssChars: 2000000 }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=big&pageId=p1`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });

    await new Promise(r => server.close(r));
    await close();

    expect(errors.some(e => e.stage === 'resolve')).toBe(true);
  });

  it('throwing resolve hook falls through gracefully', async () => {
    const plugin = {
      name: 'throw-resolver',
      resolvePageCss() { throw new Error('resolve boom'); }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=tr&pageId=p1`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });

    await new Promise(r => server.close(r));
    await close();
  });
});

// =============================================================================
// Adversarial tests: genuine edge cases and coverage gaps
// =============================================================================

describe('Adversarial: resolve hooks first-wins behavior', () => {
  it('first plugin wins, second resolver is never called', async () => {
    const callLog = [];
    const plugin1 = {
      name: 'resolver-first',
      resolvePageCss() {
        callLog.push('first');
        return { css: '.from-first { color: red; }' };
      }
    };
    const plugin2 = {
      name: 'resolver-second',
      resolvePageCss() {
        callLog.push('second');
        return { css: '.from-second { color: blue; }' };
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin1, plugin2],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=fw&pageId=p1`);
    const css = await res.text();

    await new Promise(r => server.close(r));
    await close();

    expect(res.status).toBe(200);
    expect(css).toBe('.from-first { color: red; }');
    expect(callLog).toEqual(['first']);
  });

  it('first returns null, second provides CSS', async () => {
    const plugin1 = {
      name: 'skip-resolve',
      resolvePageCss() { return null; }
    };
    const plugin2 = {
      name: 'fallback-resolve',
      resolvePageCss() { return { css: '.fallback { margin: 0; }' }; }
    };

    const { app, close } = await createCore({
      plugins: [plugin1, plugin2],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/css?projectId=fb&pageId=p1`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('.fallback { margin: 0; }');

    await new Promise(r => server.close(r));
    await close();
  });
});

describe('Adversarial: transformClasses edge cases', () => {
  it('returning only invalid classes after re-validation produces 400', async () => {
    const plugin = {
      name: 'inject-garbage',
      transformClasses() {
        return ['completely-fake-class-xyz', 'another-nonexistent-abc'];
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ig', pageId: 'p1', classes: 'text-red-500' })
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No valid classes');

    await new Promise(r => server.close(r));
    await close();
  });

  it('multiple pipeline plugins chain in declared order', async () => {
    const plugin1 = {
      name: 'adder',
      transformClasses({ value }) {
        return [...value, 'p-4'];
      }
    };
    const plugin2 = {
      name: 'bg-remover',
      transformClasses({ value }) {
        return value.filter(c => !c.startsWith('bg-'));
      }
    };

    const { app, close } = await createCore({
      plugins: [plugin1, plugin2],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    const res = await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ch', pageId: 'p1', classes: 'bg-blue-500 text-red-500' })
    });

    const body = await res.json();
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).toContain('p-4');
    expect(body.classes).not.toContain('bg-blue-500');

    await new Promise(r => server.close(r));
    await close();
  });
});

describe('Adversarial: evictProject state cleanup', () => {
  it('evictProject zeroes class counts and LRU entries', async () => {
    let ctxRef;
    const plugin = {
      name: 'evict-deep',
      setup(ctx) { ctxRef = ctx; }
    };

    const { app, close } = await createCore({
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    const server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    const { port } = server.address();

    // Compile two pages with overlapping classes
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ed', pageId: 'p1', classes: 'text-red-500 bg-blue-500' })
    });
    await fetch(`http://localhost:${port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'ed', pageId: 'p2', classes: 'text-red-500 p-4' })
    });

    const countsBefore = ctxRef.getClassCounts('ed');
    expect(countsBefore['text-red-500']).toBe(2);

    const statsBefore = ctxRef.getCacheStats();
    expect(statsBefore.totalPages).toBe(2);
    expect(statsBefore.projectCount).toBe(1);

    ctxRef.evictProject('ed');

    expect(ctxRef.getProjectIds()).not.toContain('ed');
    expect(ctxRef.getClassCounts('ed')).toBeNull();
    expect(ctxRef.getCacheStats().totalPages).toBe(0);
    expect(ctxRef.getCacheStats().projectCount).toBe(0);

    await new Promise(r => server.close(r));
    await close();
  });
});

describe('Adversarial: setup ordering and hook visibility', () => {
  it('compile during Plugin A setup does not fire Plugin B hooks (B not yet setup)', async () => {
    const hookCalls = [];
    const pluginA = {
      name: 'first-setup',
      async setup(ctx) {
        await ctx.compile({ projectId: 'so', pageId: 'p1', classes: 'text-red-500' });
      },
      onCompileResult(ctx) { hookCalls.push('A:result'); }
    };
    const pluginB = {
      name: 'second-setup',
      setup() { /* needs setup to not auto-activate */ },
      onCompileResult(ctx) { hookCalls.push('B:result'); }
    };

    const { close } = await createCore({
      plugins: [pluginA, pluginB],
      config: { rateLimitDisabled: true }
    });

    await new Promise(r => setTimeout(r, 50));
    await close();

    // During Plugin A's setup, Plugin A is not yet active and Plugin B hasn't started setup
    // Neither plugin's hooks should have fired
    expect(hookCalls).not.toContain('B:result');
  });
});

describe('Adversarial: chain depth tracking', () => {
  it('compile from non-deferred hook is guarded by reentrancy (skipHooks)', async () => {
    const resultPages = [];
    let ctxRef;
    const plugin = {
      name: 'reentrant-chain',
      setup(ctx) { ctxRef = ctx; },
      async onCompileResult(ctx) {
        resultPages.push(ctx.pageId);
        // Try to trigger a recursive compile from within a non-deferred hook
        if (ctx.pageId === 'a') {
          const r = await ctxRef.compile({ projectId: ctx.projectId, pageId: 'b', classes: 'bg-blue-500' });
          // Inner compile should succeed but skip hooks (reentrancy guard)
          expect(r.error).toBeUndefined();
        }
      }
    };

    const { close } = await createCore({
      plugins: [plugin],
      maxPluginCompileChainDepth: 1,
      config: { rateLimitDisabled: true }
    });

    await ctxRef.compile({ projectId: 'rg', pageId: 'a', classes: 'text-red-500' });
    await new Promise(r => setTimeout(r, 50));
    await close();

    // 'a' fires onCompileResult. 'b' should NOT fire onCompileResult (hooks skipped).
    expect(resultPages).toContain('a');
    expect(resultPages).not.toContain('b');

    // But 'b' should still be cached
    expect(ctxRef.getPageIds('rg')).toContain('b');
  });

  it('deferred hook chain is bounded by maxPluginCompileChainDepth', async () => {
    const compileResults = [];
    let ctxRef;
    const plugin = {
      name: 'deferred-chain',
      deferHooks: ['onCompileResult'],
      setup(ctx) { ctxRef = ctx; },
      async onCompileResult(ctx) {
        compileResults.push(ctx.pageId);
        // Each deferred onCompileResult tries to compile the next page
        const match = ctx.pageId.match(/^chain-(\d+)$/);
        if (match) {
          const depth = parseInt(match[1], 10);
          if (depth < 5) {
            await ctxRef.compile({
              projectId: ctx.projectId,
              pageId: `chain-${depth + 1}`,
              classes: 'text-red-500'
            });
          }
        }
      }
    };

    const { close } = await createCore({
      plugins: [plugin],
      maxPluginCompileChainDepth: 2,
      config: { rateLimitDisabled: true }
    });

    await ctxRef.compile({ projectId: 'dc', pageId: 'chain-0', classes: 'bg-blue-500' });
    // Wait for deferred chain to settle
    await new Promise(r => setTimeout(r, 500));
    await close();

    // With maxPluginCompileChainDepth: 2, the chain should stop:
    // chain-0 (depth 1) → deferred hook → chain-1 (depth 2) → deferred hook → chain-2 (depth 3 > limit, rejected)
    // So we should see chain-0 and chain-1 in results, but NOT chain-2+
    const chainPages = compileResults.filter(p => p.startsWith('chain-'));
    expect(chainPages).toContain('chain-0');
    expect(chainPages).toContain('chain-1');
    expect(chainPages).not.toContain('chain-2');
    expect(chainPages).not.toContain('chain-3');
  });
});
