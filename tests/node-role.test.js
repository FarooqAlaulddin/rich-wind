import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';
import { createTestServer } from './helpers/createTestServer.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hashClasses = (classes) =>
  crypto.createHash('sha256').update([...classes].sort().join('|')).digest('hex');

async function withEnv(overrides, fn) {
  const original = { ...process.env };
  Object.assign(process.env, overrides);
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(original)) {
      process.env[key] = value;
    }
  }
}

function createSharedStore() {
  const pageArtifacts = new Map();
  const projectArtifacts = new Map();
  const pluginData = new Map();

  const pageKey = ({ projectId, pageId, bundle }) => `${projectId}::${pageId}::${bundle || 'full'}`;
  const projectKey = ({ projectId, bundle }) => `${projectId}::${bundle || 'full'}`;
  const pluginKey = ({ pluginName, key }) => `${pluginName}::${key}`;

  const clone = (value) => {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  };

  return {
    async readPageArtifact(input) {
      return clone(pageArtifacts.get(pageKey(input)) ?? null);
    },
    async upsertPageArtifact(input) {
      pageArtifacts.set(pageKey(input), clone(input));
    },
    async deletePageArtifact(input) {
      pageArtifacts.delete(pageKey(input));
    },
    async deleteProjectPageArtifacts({ projectId }) {
      const prefix = `${projectId}::`;
      for (const key of pageArtifacts.keys()) {
        if (key.startsWith(prefix)) pageArtifacts.delete(key);
      }
    },
    async readProjectArtifact(input) {
      return clone(projectArtifacts.get(projectKey(input)) ?? null);
    },
    async upsertProjectArtifact(input) {
      projectArtifacts.set(projectKey(input), clone(input));
    },
    async deleteProjectArtifact(input) {
      projectArtifacts.delete(projectKey(input));
    },
    async readPluginData(input) {
      return clone(pluginData.get(pluginKey(input)) ?? null);
    },
    async writePluginData(input) {
      pluginData.set(pluginKey(input), clone(input.value));
    },
    async deletePluginData(input) {
      pluginData.delete(pluginKey(input));
    },
    async listPluginData({ pluginName, prefix = '' }) {
      const base = `${pluginName}::`;
      const keys = [];
      for (const fullKey of pluginData.keys()) {
        if (!fullKey.startsWith(base)) continue;
        const local = fullKey.slice(base.length);
        if (!prefix || local.startsWith(prefix)) keys.push(local);
      }
      return keys;
    }
  };
}

async function startCore(options = {}) {
  const { handler, close } = await createCore(options);
  const server = http.createServer(handler).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://localhost:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  };
}

describe('Node role behavior (single writer, many readers)', () => {
  it('uses RW_NODE_ROLE and allows config override', async () => {
    let envRole = null;
    let overrideRole = null;

    await withEnv({ RW_NODE_ROLE: 'reader' }, async () => {
      const envPlugin = {
        name: 'node-role-env',
        setup(ctx) {
          envRole = ctx.getConfig().nodeRole;
        }
      };
      const { close: closeEnv } = await createCore({
        plugins: [envPlugin]
      });
      await closeEnv();

      const overridePlugin = {
        name: 'node-role-override',
        setup(ctx) {
          overrideRole = ctx.getConfig().nodeRole;
        }
      };
      const { close: closeOverride } = await createCore({
        plugins: [overridePlugin],
        config: { nodeRole: 'writer' }
      });
      await closeOverride();
    });

    expect(envRole).toBe('reader');
    expect(overrideRole).toBe('writer');
  });

  it('falls back to hybrid for invalid nodeRole', async () => {
    let role = null;
    const plugin = {
      name: 'node-role-invalid',
      setup(ctx) {
        role = ctx.getConfig().nodeRole;
      }
    };

    const { close } = await createCore({
      plugins: [plugin],
      config: { nodeRole: 'not-a-role' }
    });

    expect(role).toBe('hybrid');
    await close();
  });

  it('blocks POST /api/compile on reader replicas', async () => {
    const errors = [];
    const plugin = {
      name: 'reader-http-errors',
      onError(info) {
        errors.push(info);
      }
    };
    const { baseUrl, close } = await createTestServer({}, {
      plugins: [plugin],
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'reader-http',
          pageId: 'home',
          classes: 'bg-red-500'
        })
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe('READ_ONLY_REPLICA');
      expect(body.error).toMatch(/read-only/i);

      const blocked = errors.find(
        (entry) =>
          entry?.stage === 'replica-role' &&
          entry?.context?.action === 'http-compile'
      );
      expect(blocked).toBeTruthy();
      expect(blocked.code).toBe('READ_ONLY_REPLICA');
    } finally {
      await close();
    }
  });

  it('allows POST /api/compile on writer replicas', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { nodeRole: 'writer', rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'writer-http',
          pageId: 'home',
          classes: 'bg-blue-500'
        })
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.projectId).toBe('writer-http');
    } finally {
      await close();
    }
  });

  it('blocks plugin mutation helpers and storage writes on reader replicas', async () => {
    const errors = [];
    const calls = {
      readPluginData: 0,
      writePluginData: 0,
      deletePluginData: 0,
      listPluginData: 0
    };
    const cacheStore = {
      async readPluginData() {
        calls.readPluginData += 1;
        return null;
      },
      async writePluginData() {
        calls.writePluginData += 1;
      },
      async deletePluginData() {
        calls.deletePluginData += 1;
      },
      async listPluginData() {
        calls.listPluginData += 1;
        return [];
      }
    };

    let ctxRef;
    let storage;
    const probe = {
      name: 'node-role-probe',
      setup(ctx) {
        ctxRef = ctx;
        storage = ctx.storage;
      }
    };
    const collector = {
      name: 'node-role-errors',
      onError(info) {
        errors.push(info);
      }
    };

    const { close } = await createCore({
      plugins: [probe, collector],
      cacheStore,
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    await expect(ctxRef.compile({
      projectId: 'reader-plugin',
      pageId: 'p1',
      classes: 'text-red-500'
    })).rejects.toMatchObject({ name: 'RichWindError', status: 409, code: 'READ_ONLY_REPLICA' });

    expect(await ctxRef.purgePage('reader-plugin', 'p1')).toBe(false);
    expect(await ctxRef.purgeProject('reader-plugin')).toBe(false);
    expect(
      ctxRef.hydratePageArtifact({
        projectId: 'reader-plugin',
        pageId: 'p1',
        bundle: 'full',
        css: '.text-red-500{color:red}',
        classes: ['text-red-500'],
        updatedAt: Date.now(),
        expiresAt: Date.now() + 60_000
      })
    ).toBe(false);
    expect(
      ctxRef.hydrateProjectArtifact({
        projectId: 'reader-plugin',
        bundle: 'full',
        css: '.text-red-500{color:red}',
        hash: hashClasses(['text-red-500']),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 60_000
      })
    ).toBe(false);

    ctxRef.evictPage('reader-plugin', 'p1');
    ctxRef.evictProject('reader-plugin');

    expect(await storage.set('metrics', { count: 1 })).toBe(false);
    expect(await storage.delete('metrics')).toBe(false);
    expect(await storage.get('metrics')).toBeNull();
    expect(await storage.list('met')).toEqual([]);

    expect(calls.writePluginData).toBe(0);
    expect(calls.deletePluginData).toBe(0);
    expect(calls.readPluginData).toBe(1);
    expect(calls.listPluginData).toBe(1);

    await sleep(25);

    const actions = errors
      .filter((entry) => entry?.stage === 'replica-role')
      .map((entry) => entry?.context?.action);
    expect(actions).toContain('plugin-compile');
    expect(actions).toContain('plugin-purge-page');
    expect(actions).toContain('plugin-purge-project');
    expect(actions).toContain('plugin-hydrate-page-artifact');
    expect(actions).toContain('plugin-hydrate-project-artifact');
    expect(actions).toContain('plugin-evict-page');
    expect(actions).toContain('plugin-evict-project');
    expect(actions).toContain('plugin-storage-set');
    expect(actions).toContain('plugin-storage-delete');

    await close();
  });

  it('reader replicas use cacheStore as source-of-truth for page reads', async () => {
    const artifacts = new Map();
    const key = 'reader-store::home::full';
    const classes = ['bg-lime-500'];
    artifacts.set(key, {
      css: '.bg-lime-500{background-color:#84cc16}',
      classes,
      hash: hashClasses(classes),
      expiresAt: Date.now() + 60_000
    });

    const cacheStore = {
      async readPageArtifact({ projectId, pageId, bundle }) {
        return artifacts.get(`${projectId}::${pageId}::${bundle}`) ?? null;
      }
    };

    const { handler, close } = await createCore({
      cacheStore,
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    const server = http.createServer(handler).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    try {
      const first = await fetch(`${baseUrl}/api/css?projectId=reader-store&pageId=home`);
      expect(first.status).toBe(200);
      const firstCss = await first.text();
      expect(firstCss).toContain('bg-lime-500');

      // Remove shared artifact. Reader must not serve stale local memory copy.
      artifacts.delete(key);

      const second = await fetch(`${baseUrl}/api/css?projectId=reader-store&pageId=home`);
      expect(second.status).toBe(404);
      expect(await second.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });

  it('reader replicas use cacheStore as source-of-truth for project reads', async () => {
    const projectKey = 'reader-project::full';
    const artifacts = new Map();
    artifacts.set(projectKey, {
      css: '.text-cyan-500{color:#06b6d4}',
      hash: hashClasses(['text-cyan-500']),
      expiresAt: Date.now() + 60_000
    });

    const cacheStore = {
      async readProjectArtifact({ projectId, bundle }) {
        return artifacts.get(`${projectId}::${bundle}`) ?? null;
      }
    };

    const { handler, close } = await createCore({
      cacheStore,
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    const server = http.createServer(handler).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    try {
      const first = await fetch(`${baseUrl}/api/projects/reader-project/css`);
      expect(first.status).toBe(200);
      const firstCss = await first.text();
      expect(firstCss).toContain('text-cyan-500');

      artifacts.delete(projectKey);

      const second = await fetch(`${baseUrl}/api/projects/reader-project/css`);
      expect(second.status).toBe(404);
      expect(await second.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });

  it('behaves like real traffic with one writer and one reader sharing cacheStore', async () => {
    const store = createSharedStore();
    const errors = [];

    const mutationProbePlugin = {
      name: 'mutation-probe',
      setup(ctx) {
        ctx.addRoute('post', '/mutate/:projectId/:pageId', async (req) => {
          const { projectId, pageId } = req.params;
          const reqBody = await req.json().catch(() => ({}));
          const writeOk = await ctx.storage.set('probe', { enabled: true });
          let compileStatus = 200;
          let compileCode = null;
          try {
            await ctx.compile({
              projectId,
              pageId,
              classes: reqBody?.classes || 'text-red-500'
            });
          } catch (err) {
            compileStatus = err.status;
            compileCode = err.code;
          }
          const purgeOk = await ctx.purgePage(projectId, pageId);
          return { body: { writeOk, purgeOk, compileStatus, compileCode } };
        });
      },
      onError(info) {
        errors.push(info);
      }
    };

    const writer = await startCore({
      cacheStore: store,
      plugins: [mutationProbePlugin],
      config: { nodeRole: 'writer', rateLimitDisabled: true }
    });
    const reader = await startCore({
      cacheStore: store,
      plugins: [mutationProbePlugin],
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    try {
      const firstWrite = await fetch(`${writer.baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'real-life',
          pageId: 'home',
          classes: 'bg-red-500'
        })
      });
      expect(firstWrite.status).toBe(200);

      const projectSeed = await fetch(`${writer.baseUrl}/api/projects/real-life/css`);
      expect(projectSeed.status).toBe(200);

      const readerPage = await fetch(`${reader.baseUrl}/api/css?projectId=real-life&pageId=home`);
      expect(readerPage.status).toBe(200);
      expect(await readerPage.text()).toContain('bg-red-500');

      const secondWrite = await fetch(`${writer.baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'real-life',
          pageId: 'home',
          classes: 'bg-blue-500'
        })
      });
      expect(secondWrite.status).toBe(200);

      const readerAfterUpdate = await fetch(`${reader.baseUrl}/api/css?projectId=real-life&pageId=home`);
      expect(readerAfterUpdate.status).toBe(200);
      const updatedCss = await readerAfterUpdate.text();
      expect(updatedCss).toContain('bg-blue-500');
      expect(updatedCss).not.toContain('bg-red-500');

      const readerCompile = await fetch(`${reader.baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'real-life',
          pageId: 'home',
          classes: 'bg-emerald-500'
        })
      });
      expect(readerCompile.status).toBe(409);

      const writerMutationRoute = await fetch(
        `${writer.baseUrl}/plugins/mutation-probe/mutate/real-life/home`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ classes: 'text-indigo-500' })
        }
      );
      expect(writerMutationRoute.status).toBe(200);
      const writerMutationBody = await writerMutationRoute.json();
      expect(writerMutationBody.writeOk).toBe(true);
      expect(writerMutationBody.purgeOk).toBe(true);
      expect(writerMutationBody.compileStatus).toBe(200);
      expect(writerMutationBody.compileCode).toBeNull();

      const readerAfterWriterDelete = await fetch(
        `${reader.baseUrl}/api/css?projectId=real-life&pageId=home`
      );
      expect(readerAfterWriterDelete.status).toBe(404);
      expect(await readerAfterWriterDelete.json()).toMatchObject({ code: 'NOT_FOUND' });

      const readerMutationRoute = await fetch(
        `${reader.baseUrl}/plugins/mutation-probe/mutate/real-life/home`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ classes: 'bg-emerald-500' })
        }
      );
      expect(readerMutationRoute.status).toBe(200);
      const readerMutationBody = await readerMutationRoute.json();
      expect(readerMutationBody.writeOk).toBe(false);
      expect(readerMutationBody.purgeOk).toBe(false);
      expect(readerMutationBody.compileStatus).toBe(409);
      expect(readerMutationBody.compileCode).toBe('READ_ONLY_REPLICA');

      const replicaRoleErrors = errors.filter((entry) => entry?.stage === 'replica-role');
      expect(replicaRoleErrors.length).toBeGreaterThan(0);
      expect(
        replicaRoleErrors.some((entry) => entry?.context?.action === 'http-compile')
      ).toBe(true);
      expect(
        replicaRoleErrors.some((entry) => entry?.context?.action === 'plugin-storage-set')
      ).toBe(true);
    } finally {
      await Promise.all([writer.close(), reader.close()]);
    }
  });
});
