import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';
import { createAnalyticsPlugin } from '../plugins/analytics/index.js';

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
    },
    get(key) {
      return map.get(key);
    }
  };
}

async function startServer(coreOptions = {}) {
  const { app, close } = await createCore({
    config: { rateLimitDisabled: true },
    ...coreOptions
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return { port, server, close };
}

async function stopServer({ server, close }) {
  await new Promise((resolve) => server.close(resolve));
  await close();
}

describe('Analytics Plugin storage integration', () => {
  it('persists metrics and restores them on a fresh core instance', async () => {
    const cacheStore = createPluginDataStore();

    const analytics1 = createAnalyticsPlugin();
    const s1 = await startServer({
      plugins: [analytics1],
      cacheStore
    });

    await fetch(`http://localhost:${s1.port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'analytics-proj',
        pageId: 'p1',
        classes: 'text-red-500 p-4'
      })
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const firstDataRes = await fetch(`http://localhost:${s1.port}/plugins/analytics/data`);
    expect(firstDataRes.status).toBe(200);
    const firstData = await firstDataRes.json();
    expect(firstData.compiles.total).toBeGreaterThan(0);

    await stopServer(s1);
    expect(cacheStore.get('analytics:metrics_v1')).toBeTruthy();

    const analytics2 = createAnalyticsPlugin();
    const s2 = await startServer({
      plugins: [analytics2],
      cacheStore
    });

    const secondDataRes = await fetch(`http://localhost:${s2.port}/plugins/analytics/data`);
    expect(secondDataRes.status).toBe(200);
    const secondData = await secondDataRes.json();
    expect(secondData.compiles.total).toBeGreaterThanOrEqual(firstData.compiles.total);

    await stopServer(s2);
  });

  it('flushes latest metrics on teardown even before debounce fires', async () => {
    const cacheStore = createPluginDataStore();

    const analytics1 = createAnalyticsPlugin();
    const s1 = await startServer({
      plugins: [analytics1],
      cacheStore
    });

    await fetch(`http://localhost:${s1.port}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'analytics-proj-2',
        pageId: 'p1',
        classes: 'bg-blue-500'
      })
    });

    // Immediate stop (without waiting for debounce) should still flush via teardown.
    await stopServer(s1);

    const analytics2 = createAnalyticsPlugin();
    const s2 = await startServer({
      plugins: [analytics2],
      cacheStore
    });

    const dataRes = await fetch(`http://localhost:${s2.port}/plugins/analytics/data`);
    expect(dataRes.status).toBe(200);
    const data = await dataRes.json();
    expect(data.compiles.total).toBeGreaterThan(0);

    await stopServer(s2);
  });
});
