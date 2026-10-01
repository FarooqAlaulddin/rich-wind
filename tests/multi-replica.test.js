import http from 'node:http';
import { describe, it, expect } from 'vitest';
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

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function createSharedCacheStore(options = {}) {
  const pageArtifacts = new Map();
  const projectArtifacts = new Map();
  const pluginData = new Map();
  const delayMs = options.delayMs ?? 0;

  const calls = {
    readPageArtifact: 0,
    upsertPageArtifact: 0,
    deletePageArtifact: 0,
    deleteProjectPageArtifacts: 0,
    readProjectArtifact: 0,
    upsertProjectArtifact: 0,
    deleteProjectArtifact: 0,
    readPluginData: 0,
    writePluginData: 0,
    deletePluginData: 0,
    listPluginData: 0
  };

  const resolveDelayMs = () => {
    const value = typeof delayMs === 'function' ? delayMs() : delayMs;
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value;
  };

  const withDelay = async () => {
    const ms = resolveDelayMs();
    if (ms > 0) await sleep(ms);
  };

  const pageKey = ({ projectId, pageId, bundle }) => `${projectId}::${pageId}::${bundle || 'full'}`;
  const projectKey = ({ projectId, bundle }) => `${projectId}::${bundle || 'full'}`;
  const pluginKey = ({ pluginName, key }) => `${pluginName}::${key}`;

  return {
    async readPageArtifact(input) {
      calls.readPageArtifact += 1;
      await withDelay();
      return clone(pageArtifacts.get(pageKey(input)) ?? null);
    },
    async upsertPageArtifact(input) {
      calls.upsertPageArtifact += 1;
      await withDelay();
      pageArtifacts.set(pageKey(input), clone(input));
    },
    async deletePageArtifact(input) {
      calls.deletePageArtifact += 1;
      await withDelay();
      pageArtifacts.delete(pageKey(input));
    },
    async deleteProjectPageArtifacts({ projectId }) {
      calls.deleteProjectPageArtifacts += 1;
      await withDelay();
      const prefix = `${projectId}::`;
      for (const key of pageArtifacts.keys()) {
        if (key.startsWith(prefix)) {
          pageArtifacts.delete(key);
        }
      }
    },
    async readProjectArtifact(input) {
      calls.readProjectArtifact += 1;
      await withDelay();
      return clone(projectArtifacts.get(projectKey(input)) ?? null);
    },
    async upsertProjectArtifact(input) {
      calls.upsertProjectArtifact += 1;
      await withDelay();
      projectArtifacts.set(projectKey(input), clone(input));
    },
    async deleteProjectArtifact(input) {
      calls.deleteProjectArtifact += 1;
      await withDelay();
      projectArtifacts.delete(projectKey(input));
    },
    async readPluginData(input) {
      calls.readPluginData += 1;
      await withDelay();
      return clone(pluginData.get(pluginKey(input)) ?? null);
    },
    async writePluginData(input) {
      calls.writePluginData += 1;
      await withDelay();
      pluginData.set(pluginKey(input), clone(input.value));
    },
    async deletePluginData(input) {
      calls.deletePluginData += 1;
      await withDelay();
      pluginData.delete(pluginKey(input));
    },
    async listPluginData(input) {
      calls.listPluginData += 1;
      await withDelay();
      const prefix = `${input.pluginName}::`;
      const list = [];
      for (const key of pluginData.keys()) {
        if (!key.startsWith(prefix)) continue;
        const localKey = key.slice(prefix.length);
        if (!input.prefix || localKey.startsWith(input.prefix)) {
          list.push(localKey);
        }
      }
      return list;
    },
    getSnapshot() {
      return {
        pageArtifactCount: pageArtifacts.size,
        projectArtifactCount: projectArtifacts.size,
        pluginDataCount: pluginData.size,
        calls: { ...calls }
      };
    }
  };
}

function createSharedCounterPlugin() {
  return {
    name: 'shared-counter',
    setup(ctx) {
      ctx.addRoute('post', '/increment', async (_req) => {
        const current = Number(await ctx.storage.get('count')) || 0;
        const next = current + 1;
        await ctx.storage.set('count', next);
        return { body: { count: next } };
      });
      ctx.addRoute('get', '/value', async (_req) => {
        const current = Number(await ctx.storage.get('count')) || 0;
        return { body: { count: current } };
      });
    }
  };
}

function createSharedKvPlugin() {
  return {
    name: 'shared-kv',
    setup(ctx) {
      ctx.addRoute('post', '/kv/:key', async (req) => {
        const { key } = req.params;
        const reqBody = await req.json();
        const hasValue = Object.prototype.hasOwnProperty.call(reqBody ?? {}, 'value');
        const value = hasValue ? reqBody.value : true;
        const ok = await ctx.storage.set(key, value);
        return { body: { ok, value } };
      });

      ctx.addRoute('get', '/kv/:key', async (req) => {
        const { key } = req.params;
        const value = await ctx.storage.get(key);
        return { body: { exists: value !== null, value } };
      });

      ctx.addRoute('delete', '/kv/:key', async (req) => {
        const { key } = req.params;
        const ok = await ctx.storage.delete(key);
        return { body: { ok } };
      });
    }
  };
}

function createRestoreProbePlugin() {
  let localCount = 0;

  return {
    name: 'restore-probe',
    async setup(ctx) {
      const snapshot = await ctx.storage.get('snapshot_v1');
      if (snapshot && Number.isFinite(snapshot.count) && snapshot.count >= 0) {
        localCount = snapshot.count;
      }

      ctx.addRoute('post', '/bump', async (_req) => {
        localCount += 1;
        await ctx.storage.set('snapshot_v1', { count: localCount });
        return { body: { count: localCount } };
      });

      ctx.addRoute('get', '/state', (_req) => {
        return { body: { count: localCount } };
      });
    }
  };
}

function createPurgeBridgePlugin() {
  return {
    name: 'purge-bridge',
    setup(ctx) {
      ctx.addRoute('post', '/page/:projectId/:pageId/purge', async (req) => {
        const { projectId, pageId } = req.params;
        const ok = await ctx.purgePage(projectId, pageId);
        return { body: { ok } };
      });

      ctx.addRoute('post', '/project/:projectId/purge', async (req) => {
        const { projectId } = req.params;
        const ok = await ctx.purgeProject(projectId);
        return { body: { ok } };
      });
    }
  };
}

async function startReplica({ cacheStore, plugins = [], config = {}, ...rest } = {}) {
  const { handler, close } = await createCore({
    cacheStore,
    plugins,
    config: {
      rateLimitDisabled: true,
      ...config
    },
    ...rest
  });

  const server = http.createServer(handler).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  return {
    port,
    baseUrl: `http://localhost:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  };
}

async function closeReplicas(replicas) {
  await Promise.allSettled(replicas.map((replica) => replica.close()));
}

async function compile(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

describe('Multi-replica cacheStore behavior', () => {
  it('shares page artifacts across replicas and hydrates project suggestions', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        config: { suggestFallback: false }
      });
      const replicaB = await startReplica({
        cacheStore: store,
        config: { suggestFallback: false }
      });
      replicas.push(replicaA, replicaB);

      const firstCompile = await compile(replicaA.baseUrl, {
        projectId: 'replica-proj',
        pageId: 'home',
        classes: 'bg-rose-500 p-4'
      });
      expect(firstCompile.status).toBe(200);
      expect(firstCompile.body.cached).toBe(false);

      const wrotePage = await waitFor(
        () => store.getSnapshot().pageArtifactCount === 1,
        { timeoutMs: 2000 }
      );
      expect(wrotePage).toBe(true);

      const cssResponse = await fetch(
        `${replicaB.baseUrl}/api/css?projectId=replica-proj&pageId=home`
      );
      expect(cssResponse.status).toBe(200);
      const css = await cssResponse.text();
      expect(css).toContain('bg-rose-500');

      const suggestResponse = await fetch(`${replicaB.baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'replica-proj',
          prefix: 'bg-rose-',
          limit: 10
        })
      });
      expect(suggestResponse.status).toBe(200);
      const suggestBody = await suggestResponse.json();
      expect(suggestBody.suggestions).toContain('bg-rose-500');
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('returns cached=true on another replica after pre-hydrating from shared store', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({ cacheStore: store });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const firstCompile = await compile(replicaA.baseUrl, {
        projectId: 'hydrate-proj',
        pageId: 'landing',
        classes: 'text-cyan-500 p-6'
      });
      expect(firstCompile.status).toBe(200);
      expect(firstCompile.body.cached).toBe(false);

      const wrotePage = await waitFor(
        () => store.getSnapshot().pageArtifactCount === 1,
        { timeoutMs: 2000 }
      );
      expect(wrotePage).toBe(true);

      const before = store.getSnapshot().calls;

      const secondCompile = await compile(replicaB.baseUrl, {
        projectId: 'hydrate-proj',
        pageId: 'landing',
        classes: 'text-cyan-500 p-6'
      });
      expect(secondCompile.status).toBe(200);
      expect(secondCompile.body.cached).toBe(true);

      await sleep(30);
      const after = store.getSnapshot().calls;
      expect(after.readPageArtifact).toBeGreaterThan(before.readPageArtifact);
      expect(after.upsertPageArtifact).toBe(before.upsertPageArtifact);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('serves project CSS from shared project artifacts without re-upserting from the reader replica', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({ cacheStore: store });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const compileResponse = await compile(replicaA.baseUrl, {
        projectId: 'project-share',
        pageId: 'p1',
        classes: 'border border-lime-500'
      });
      expect(compileResponse.status).toBe(200);

      const aggregateA = await fetch(
        `${replicaA.baseUrl}/api/projects/project-share/css`
      );
      expect(aggregateA.status).toBe(200);

      const wroteProject = await waitFor(
        () => store.getSnapshot().projectArtifactCount === 1,
        { timeoutMs: 2000 }
      );
      expect(wroteProject).toBe(true);

      const upsertsBeforeReplicaRead = store.getSnapshot().calls.upsertProjectArtifact;

      const aggregateB = await fetch(
        `${replicaB.baseUrl}/api/projects/project-share/css`
      );
      expect(aggregateB.status).toBe(200);
      const css = await aggregateB.text();
      expect(css).toContain('border-lime-500');

      await sleep(30);
      const calls = store.getSnapshot().calls;
      expect(calls.readProjectArtifact).toBeGreaterThan(0);
      expect(calls.upsertProjectArtifact).toBe(upsertsBeforeReplicaRead);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('shares plugin storage writes between active replicas', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createSharedCounterPlugin()]
      });
      const replicaB = await startReplica({
        cacheStore: store,
        plugins: [createSharedCounterPlugin()]
      });
      const replicaC = await startReplica({
        cacheStore: store,
        plugins: [createSharedCounterPlugin()]
      });
      replicas.push(replicaA, replicaB, replicaC);

      const incA = await fetch(`${replicaA.baseUrl}/plugins/shared-counter/increment`, {
        method: 'POST'
      });
      expect(incA.status).toBe(200);
      expect((await incA.json()).count).toBe(1);

      const valueB = await fetch(`${replicaB.baseUrl}/plugins/shared-counter/value`);
      expect(valueB.status).toBe(200);
      expect((await valueB.json()).count).toBe(1);

      const incC = await fetch(`${replicaC.baseUrl}/plugins/shared-counter/increment`, {
        method: 'POST'
      });
      expect(incC.status).toBe(200);
      expect((await incC.json()).count).toBe(2);

      const valueA = await fetch(`${replicaA.baseUrl}/plugins/shared-counter/value`);
      expect(valueA.status).toBe(200);
      expect((await valueA.json()).count).toBe(2);

      expect(store.getSnapshot().pluginDataCount).toBe(1);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('supports plugin storage insert/update/delete across replicas', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createSharedKvPlugin()]
      });
      const replicaB = await startReplica({
        cacheStore: store,
        plugins: [createSharedKvPlugin()]
      });
      replicas.push(replicaA, replicaB);

      const insert = await fetch(`${replicaA.baseUrl}/plugins/shared-kv/kv/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: { version: 1, enabled: true } })
      });
      expect(insert.status).toBe(200);
      expect((await insert.json()).ok).toBe(true);

      const readAfterInsert = await fetch(`${replicaB.baseUrl}/plugins/shared-kv/kv/state`);
      expect(readAfterInsert.status).toBe(200);
      const insertedBody = await readAfterInsert.json();
      expect(insertedBody.exists).toBe(true);
      expect(insertedBody.value).toEqual({ version: 1, enabled: true });

      const update = await fetch(`${replicaB.baseUrl}/plugins/shared-kv/kv/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: { version: 2, enabled: false } })
      });
      expect(update.status).toBe(200);
      expect((await update.json()).ok).toBe(true);

      const readAfterUpdate = await fetch(`${replicaA.baseUrl}/plugins/shared-kv/kv/state`);
      expect(readAfterUpdate.status).toBe(200);
      const updatedBody = await readAfterUpdate.json();
      expect(updatedBody.exists).toBe(true);
      expect(updatedBody.value).toEqual({ version: 2, enabled: false });

      const remove = await fetch(`${replicaA.baseUrl}/plugins/shared-kv/kv/state`, {
        method: 'DELETE'
      });
      expect(remove.status).toBe(200);
      expect((await remove.json()).ok).toBe(true);

      const readAfterDelete = await fetch(`${replicaB.baseUrl}/plugins/shared-kv/kv/state`);
      expect(readAfterDelete.status).toBe(200);
      const deletedBody = await readAfterDelete.json();
      expect(deletedBody.exists).toBe(false);
      expect(deletedBody.value).toBeNull();
      expect(store.getSnapshot().pluginDataCount).toBe(0);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('propagates page artifact updates across replicas', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({ cacheStore: store });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const first = await compile(replicaA.baseUrl, {
        projectId: 'update-proj',
        pageId: 'hero',
        classes: 'bg-red-500'
      });
      expect(first.status).toBe(200);
      expect(first.body.cached).toBe(false);

      const wroteFirst = await waitFor(
        () => store.getSnapshot().calls.upsertPageArtifact >= 1,
        { timeoutMs: 2000 }
      );
      expect(wroteFirst).toBe(true);

      const second = await compile(replicaB.baseUrl, {
        projectId: 'update-proj',
        pageId: 'hero',
        classes: 'bg-emerald-500'
      });
      expect(second.status).toBe(200);
      expect(second.body.cached).toBe(false);

      const wroteSecond = await waitFor(
        () => store.getSnapshot().calls.upsertPageArtifact >= 2,
        { timeoutMs: 2000 }
      );
      expect(wroteSecond).toBe(true);

      const replicaC = await startReplica({ cacheStore: store });
      replicas.push(replicaC);

      const cssResponse = await fetch(
        `${replicaC.baseUrl}/api/css?projectId=update-proj&pageId=hero`
      );
      expect(cssResponse.status).toBe(200);
      const css = await cssResponse.text();
      expect(css).toContain('bg-emerald-500');
      expect(css).not.toContain('bg-red-500');
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('purgePage deletes persisted artifacts so other replicas cannot rehydrate', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createPurgeBridgePlugin()]
      });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const compileResponse = await compile(replicaA.baseUrl, {
        projectId: 'purge-shared-page',
        pageId: 'hero',
        classes: 'bg-fuchsia-500'
      });
      expect(compileResponse.status).toBe(200);

      const wrotePage = await waitFor(
        () => store.getSnapshot().pageArtifactCount === 1,
        { timeoutMs: 2000 }
      );
      expect(wrotePage).toBe(true);

      const purgeResponse = await fetch(
        `${replicaA.baseUrl}/plugins/purge-bridge/page/purge-shared-page/hero/purge`,
        { method: 'POST' }
      );
      expect(purgeResponse.status).toBe(200);
      expect((await purgeResponse.json()).ok).toBe(true);

      const deleted = await waitFor(
        () => store.getSnapshot().pageArtifactCount === 0,
        { timeoutMs: 2000 }
      );
      expect(deleted).toBe(true);

      const cssAfterPurge = await fetch(
        `${replicaB.baseUrl}/api/css?projectId=purge-shared-page&pageId=hero`
      );
      expect(cssAfterPurge.status).toBe(404);
      expect(await cssAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('purgeProject deletes persisted page/project artifacts across replicas', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createPurgeBridgePlugin()]
      });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const firstCompile = await compile(replicaA.baseUrl, {
        projectId: 'purge-shared-project',
        pageId: 'p1',
        classes: 'text-amber-500'
      });
      expect(firstCompile.status).toBe(200);

      const secondCompile = await compile(replicaA.baseUrl, {
        projectId: 'purge-shared-project',
        pageId: 'p2',
        classes: 'border border-amber-500'
      });
      expect(secondCompile.status).toBe(200);

      const projectCss = await fetch(
        `${replicaA.baseUrl}/api/projects/purge-shared-project/css`
      );
      expect(projectCss.status).toBe(200);

      const wroteArtifacts = await waitFor(
        () => {
          const snapshot = store.getSnapshot();
          return snapshot.pageArtifactCount >= 2 && snapshot.projectArtifactCount >= 1;
        },
        { timeoutMs: 2500 }
      );
      expect(wroteArtifacts).toBe(true);

      const purgeResponse = await fetch(
        `${replicaA.baseUrl}/plugins/purge-bridge/project/purge-shared-project/purge`,
        { method: 'POST' }
      );
      expect(purgeResponse.status).toBe(200);
      expect((await purgeResponse.json()).ok).toBe(true);

      const deletedAll = await waitFor(
        () => {
          const snapshot = store.getSnapshot();
          return snapshot.pageArtifactCount === 0 && snapshot.projectArtifactCount === 0;
        },
        { timeoutMs: 2500 }
      );
      expect(deletedAll).toBe(true);

      const pageAfterPurge = await fetch(
        `${replicaB.baseUrl}/api/css?projectId=purge-shared-project&pageId=p1`
      );
      expect(pageAfterPurge.status).toBe(404);
      expect(await pageAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });

      const projectAfterPurge = await fetch(
        `${replicaB.baseUrl}/api/projects/purge-shared-project/css`
      );
      expect(projectAfterPurge.status).toBe(404);
      expect(await projectAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('purgeProject from a cold replica uses bulk project-page delete for global cleanup', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createPurgeBridgePlugin()]
      });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const firstCompile = await compile(replicaB.baseUrl, {
        projectId: 'cold-purge-project',
        pageId: 'p1',
        classes: 'text-emerald-500'
      });
      expect(firstCompile.status).toBe(200);

      const secondCompile = await compile(replicaB.baseUrl, {
        projectId: 'cold-purge-project',
        pageId: 'p2',
        classes: 'border border-emerald-500'
      });
      expect(secondCompile.status).toBe(200);

      const projectCss = await fetch(
        `${replicaB.baseUrl}/api/projects/cold-purge-project/css`
      );
      expect(projectCss.status).toBe(200);

      const wroteArtifacts = await waitFor(
        () => {
          const snapshot = store.getSnapshot();
          return snapshot.pageArtifactCount >= 2 && snapshot.projectArtifactCount >= 1;
        },
        { timeoutMs: 2500 }
      );
      expect(wroteArtifacts).toBe(true);

      const purgeResponse = await fetch(
        `${replicaA.baseUrl}/plugins/purge-bridge/project/cold-purge-project/purge`,
        { method: 'POST' }
      );
      expect(purgeResponse.status).toBe(200);
      expect((await purgeResponse.json()).ok).toBe(true);

      const deletedAll = await waitFor(
        () => {
          const snapshot = store.getSnapshot();
          return snapshot.pageArtifactCount === 0 && snapshot.projectArtifactCount === 0;
        },
        { timeoutMs: 2500 }
      );
      expect(deletedAll).toBe(true);
      expect(store.getSnapshot().calls.deleteProjectPageArtifacts).toBeGreaterThan(0);

      const replicaC = await startReplica({ cacheStore: store });
      replicas.push(replicaC);

      const pageAfterPurge = await fetch(
        `${replicaC.baseUrl}/api/css?projectId=cold-purge-project&pageId=p1`
      );
      expect(pageAfterPurge.status).toBe(404);
      expect(await pageAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });

      const projectAfterPurge = await fetch(
        `${replicaC.baseUrl}/api/projects/cold-purge-project/css`
      );
      expect(projectAfterPurge.status).toBe(404);
      expect(await projectAfterPurge.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('purgeProject from a cold replica returns false when bulk project-page delete is not implemented', async () => {
    const storeWithBulk = createSharedCacheStore();
    const { deleteProjectPageArtifacts, ...store } = storeWithBulk; // eslint-disable-line no-unused-vars
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createPurgeBridgePlugin()]
      });
      const replicaB = await startReplica({ cacheStore: store });
      replicas.push(replicaA, replicaB);

      const firstCompile = await compile(replicaB.baseUrl, {
        projectId: 'cold-purge-missing-bulk',
        pageId: 'p1',
        classes: 'text-rose-500'
      });
      expect(firstCompile.status).toBe(200);

      const secondCompile = await compile(replicaB.baseUrl, {
        projectId: 'cold-purge-missing-bulk',
        pageId: 'p2',
        classes: 'border border-rose-500'
      });
      expect(secondCompile.status).toBe(200);

      const projectCss = await fetch(
        `${replicaB.baseUrl}/api/projects/cold-purge-missing-bulk/css`
      );
      expect(projectCss.status).toBe(200);

      const wroteArtifacts = await waitFor(
        () => {
          const snapshot = store.getSnapshot();
          return snapshot.pageArtifactCount >= 2 && snapshot.projectArtifactCount >= 1;
        },
        { timeoutMs: 2500 }
      );
      expect(wroteArtifacts).toBe(true);

      const purgeResponse = await fetch(
        `${replicaA.baseUrl}/plugins/purge-bridge/project/cold-purge-missing-bulk/purge`,
        { method: 'POST' }
      );
      expect(purgeResponse.status).toBe(200);
      expect((await purgeResponse.json()).ok).toBe(false);

      const snapshot = store.getSnapshot();
      expect(snapshot.pageArtifactCount).toBeGreaterThan(0);
      expect(snapshot.projectArtifactCount).toBe(0);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('restores plugin local state on a new replica from shared cacheStore data', async () => {
    const store = createSharedCacheStore();
    const replicas = [];

    try {
      const replicaA = await startReplica({
        cacheStore: store,
        plugins: [createRestoreProbePlugin()]
      });
      replicas.push(replicaA);

      const bump1 = await fetch(`${replicaA.baseUrl}/plugins/restore-probe/bump`, {
        method: 'POST'
      });
      expect(bump1.status).toBe(200);
      expect((await bump1.json()).count).toBe(1);

      const bump2 = await fetch(`${replicaA.baseUrl}/plugins/restore-probe/bump`, {
        method: 'POST'
      });
      expect(bump2.status).toBe(200);
      expect((await bump2.json()).count).toBe(2);

      const replicaB = await startReplica({
        cacheStore: store,
        plugins: [createRestoreProbePlugin()]
      });
      replicas.push(replicaB);

      const restoredState = await fetch(`${replicaB.baseUrl}/plugins/restore-probe/state`);
      expect(restoredState.status).toBe(200);
      expect((await restoredState.json()).count).toBe(2);

      const bumpB = await fetch(`${replicaB.baseUrl}/plugins/restore-probe/bump`, {
        method: 'POST'
      });
      expect(bumpB.status).toBe(200);
      expect((await bumpB.json()).count).toBe(3);

      const replicaC = await startReplica({
        cacheStore: store,
        plugins: [createRestoreProbePlugin()]
      });
      replicas.push(replicaC);

      const restoredStateC = await fetch(`${replicaC.baseUrl}/plugins/restore-probe/state`);
      expect(restoredStateC.status).toBe(200);
      expect((await restoredStateC.json()).count).toBe(3);
    } finally {
      await closeReplicas(replicas);
    }
  });

  it('stays healthy under concurrent multi-replica compile and cache traffic', async () => {
    const store = createSharedCacheStore({
      delayMs: () => Math.floor(Math.random() * 8)
    });
    const replicas = [];

    try {
      for (let i = 0; i < 4; i++) {
        replicas.push(await startReplica({
          cacheStore: store,
          config: { cacheMaxPages: 500 }
        }));
      }

      const classVariants = [
        'bg-red-500 p-4',
        'text-blue-500 m-2',
        'border border-emerald-500',
        'ring-2 ring-indigo-400'
      ];

      const pages = Array.from({ length: 12 }, (_, index) => ({
        projectId: 'mesh-proj',
        pageId: `page-${index + 1}`,
        classes: classVariants[index % classVariants.length]
      }));

      const compileResponses = await Promise.all(
        pages.map((payload, index) =>
          compile(replicas[index % replicas.length].baseUrl, payload)
        )
      );

      for (const response of compileResponses) {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }

      const wroteAll = await waitFor(
        () => store.getSnapshot().pageArtifactCount >= pages.length,
        { timeoutMs: 4000, intervalMs: 25 }
      );
      expect(wroteAll).toBe(true);

      const cssResponses = await Promise.all(
        pages.map(({ projectId, pageId }, index) =>
          fetch(
            `${replicas[(index + 1) % replicas.length].baseUrl}/api/css?projectId=${projectId}&pageId=${pageId}`
          )
        )
      );

      const cssBodies = await Promise.all(cssResponses.map((response) => response.text()));
      for (let i = 0; i < cssResponses.length; i++) {
        expect(cssResponses[i].status).toBe(200);
        expect(cssBodies[i].length).toBeGreaterThan(0);
      }

      const healthChecks = await Promise.all(
        replicas.map((replica) => fetch(`${replica.baseUrl}/health`))
      );
      for (const health of healthChecks) {
        expect(health.status).toBe(200);
      }
    } finally {
      await closeReplicas(replicas);
    }
  }, 30000);
});
