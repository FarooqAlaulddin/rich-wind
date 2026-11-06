import { describe, it, expect, afterEach } from 'vitest';
import { createCore } from '../services/index.js';

// In-memory cache store. `bulk: false` leaves out deleteProjectPageArtifacts;
// `failDelete` makes every page artifact delete throw.
function createStore({ bulk = true, failDelete = false } = {}) {
  const pages = new Map();
  const key = ({ projectId, pageId, bundle }) => `${projectId}|${pageId}|${bundle || 'full'}`;
  const store = {
    pages,
    readPageArtifact: (input) => structuredClone(pages.get(key(input)) ?? null),
    upsertPageArtifact: (input) => { pages.set(key(input), structuredClone(input)); },
    deletePageArtifact: (input) => {
      if (failDelete) throw new Error('delete failed');
      pages.delete(key(input));
    },
    readProjectArtifact: () => null,
    upsertProjectArtifact: () => {},
    deleteProjectArtifact: () => {},
    readPluginData: () => null,
    writePluginData: () => {}
  };
  if (bulk) {
    store.deleteProjectPageArtifacts = ({ projectId }) => {
      if (failDelete) throw new Error('delete failed');
      for (const k of pages.keys()) if (k.startsWith(`${projectId}|`)) pages.delete(k);
    };
  }
  return store;
}

function createRecorder() {
  const events = [];
  let ctx = null;
  return {
    events,
    ctx: () => ctx,
    plugin: {
      name: 'recorder',
      setup(context) { ctx = context; },
      onInvalidate({ projectId, pageId, source }) { events.push({ projectId, pageId, source }); }
    }
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('onInvalidate', () => {
  let core;
  afterEach(async () => {
    await core?.close();
    core = null;
  });

  async function start(options = {}) {
    const recorder = createRecorder();
    core = await createCore({ plugins: [recorder.plugin], ...options });
    await core.compile({ projectId: 'p', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'p', pageId: 'b', classes: 'm-2' });
    await flush();
    return recorder;
  }

  it('fires for page and project invalidation without a store, even for pages not in memory', async () => {
    const { events } = await start();
    await core.invalidate({ projectId: 'p', pageId: 'a' });
    await core.invalidate({ projectId: 'p', pageId: 'never-compiled' });
    await core.invalidate({ projectId: 'p' });
    expect(events).toEqual([
      { projectId: 'p', pageId: 'a', source: 'core' },
      { projectId: 'p', pageId: 'never-compiled', source: 'core' },
      { projectId: 'p', pageId: null, source: 'core' }
    ]);
  });

  it('fires once the store confirms the deletes', async () => {
    const { events } = await start({ cacheStore: createStore() });
    await core.invalidate({ projectId: 'p', pageId: 'a' });
    await core.invalidate({ projectId: 'p' });
    expect(events).toEqual([
      { projectId: 'p', pageId: 'a', source: 'core' },
      { projectId: 'p', pageId: null, source: 'core' }
    ]);
  });

  it('does not fire when a store delete fails', async () => {
    const { events, ctx } = await start({ cacheStore: createStore({ failDelete: true }) });
    await core.invalidate({ projectId: 'p', pageId: 'a' });
    await core.invalidate({ projectId: 'p' });
    expect(await ctx().purgePage('p', 'b')).toBe(false);
    expect(await ctx().purgeProject('p')).toBe(false);
    expect(events).toEqual([]);
  });

  it('a project invalidate without a bulk page delete leaves page artifacts, so it does not fire', async () => {
    const store = createStore({ bulk: false });
    const { events } = await start({ cacheStore: store });
    await core.invalidate({ projectId: 'p' });
    expect(store.pages.size).toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it('ctx.purgePage and ctx.purgeProject fire with source plugin', async () => {
    const { events, ctx } = await start({ cacheStore: createStore() });
    expect(await ctx().purgePage('p', 'a')).toBe(true);
    expect(await ctx().purgeProject('p')).toBe(true);
    expect(events).toEqual([
      { projectId: 'p', pageId: 'a', source: 'plugin' },
      { projectId: 'p', pageId: null, source: 'plugin' }
    ]);
  });

  it('ctx.purgeProject without a bulk page delete fires only for the resident pages it deleted', async () => {
    const { events, ctx } = await start({ cacheStore: createStore({ bulk: false }) });
    await ctx().purgeProject('p');
    expect(events.map((e) => e.pageId).sort()).toEqual(['a', 'b']);
  });

  it('memory eviction never fires it', async () => {
    const { events, ctx } = await start({ cacheStore: createStore(), config: { cacheMaxPages: 1 } });
    await core.compile({ projectId: 'p', pageId: 'c', classes: 'flex' }); // LRU evicts
    ctx().evictPage('p', 'c');
    await core.compile({ projectId: 'q', pageId: 'x', classes: 'flex' });
    ctx().evictProject('q');
    await flush();
    expect(events).toEqual([]);
  });

  it('getCacheStats reports whether page artifacts outlive memory', async () => {
    const withStore = await start({ cacheStore: createStore() });
    expect(withStore.ctx().getCacheStats().pageStore).toBe(true);
    await core.close();

    const dataOnly = createRecorder();
    core = await createCore({ plugins: [dataOnly.plugin], cacheStore: { readPluginData: () => null, writePluginData: () => {} } });
    expect(dataOnly.ctx().getCacheStats().pageStore).toBe(false);
    await core.close();

    const none = createRecorder();
    core = await createCore({ plugins: [none.plugin] });
    expect(none.ctx().getCacheStats().pageStore).toBe(false);
  });

  it('fires with source http from POST /api/invalidate', async () => {
    const { events } = await start();
    const res = await core.fetch(new Request('http://localhost/api/invalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p', pageId: 'a' })
    }));
    expect(res.status).toBe(200);
    expect(events).toEqual([{ projectId: 'p', pageId: 'a', source: 'http' }]);
  });
});
