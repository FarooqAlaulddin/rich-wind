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
    const { baseUrl, close } = await createTestServer({}, {
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

    const compileResult = await ctxRef.compile({
      projectId: 'reader-plugin',
      pageId: 'p1',
      classes: 'text-red-500'
    });
    expect(compileResult.status).toBe(409);
    expect(compileResult.code).toBe('READ_ONLY_REPLICA');

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

    const { app, close } = await createCore({
      cacheStore,
      config: { nodeRole: 'reader', rateLimitDisabled: true }
    });

    const server = app.listen(0);
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
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });
});
