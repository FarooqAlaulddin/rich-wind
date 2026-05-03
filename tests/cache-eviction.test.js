import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Cache eviction and TTL', () => {
  it('evicts oldest page when RW_CACHE_MAX_PAGES is exceeded (LRU)', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_MAX_PAGES: '2',
      RW_CACHE_TTL_MS: '60000',
    });

    try {
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-proj', pageId: 'page1', classes: 'text-red-500' }),
      });
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-proj', pageId: 'page2', classes: 'text-blue-500' }),
      });
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-proj', pageId: 'page3', classes: 'text-green-500' }),
      });

      const response = await fetch(`${baseUrl}/api/css?projectId=lru-proj&pageId=page1`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    } finally {
      await close();
    }
  });

  it('updates LRU order on page reads so recently used pages are kept', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_MAX_PAGES: '2',
      RW_CACHE_TTL_MS: '60000',
    });

    try {
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-touch', pageId: 'page1', classes: 'text-red-500' }),
      });
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-touch', pageId: 'page2', classes: 'text-blue-500' }),
      });

      // Touch page1 so page2 becomes the eviction candidate.
      const touch = await fetch(`${baseUrl}/api/css?projectId=lru-touch&pageId=page1`);
      expect(touch.status).toBe(200);

      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'lru-touch', pageId: 'page3', classes: 'text-green-500' }),
      });

      const page1 = await fetch(`${baseUrl}/api/css?projectId=lru-touch&pageId=page1`);
      const page2 = await fetch(`${baseUrl}/api/css?projectId=lru-touch&pageId=page2`);
      const page3 = await fetch(`${baseUrl}/api/css?projectId=lru-touch&pageId=page3`);

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(await page2.text()).toBe('');
      expect(page3.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('expires cached page after RW_CACHE_TTL_MS', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_TTL_MS: '150',
      RW_CACHE_MAX_PAGES: '50',
    });

    try {
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'ttl-proj', pageId: 'page1', classes: 'text-purple-500' }),
      });

      await sleep(200);

      const response = await fetch(`${baseUrl}/api/css?projectId=ttl-proj&pageId=page1`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    } finally {
      await close();
    }
  });

  it('extends page TTL on reads (sliding TTL)', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_TTL_MS: '200',
      RW_CACHE_MAX_PAGES: '50',
    });

    try {
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'ttl-slide-read', pageId: 'page1', classes: 'text-purple-500' }),
      });

      await sleep(120);
      const touch = await fetch(`${baseUrl}/api/css?projectId=ttl-slide-read&pageId=page1`);
      expect(touch.status).toBe(200);

      // Past the original TTL window, but within the refreshed one.
      await sleep(120);
      const stillCached = await fetch(`${baseUrl}/api/css?projectId=ttl-slide-read&pageId=page1`);
      expect(stillCached.status).toBe(200);

      await sleep(220);
      const expired = await fetch(`${baseUrl}/api/css?projectId=ttl-slide-read&pageId=page1`);
      expect(expired.status).toBe(200);
      expect(await expired.text()).toBe('');
    } finally {
      await close();
    }
  });

  it('extends page TTL on compile cache hits (sliding TTL)', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_TTL_MS: '220',
      RW_CACHE_MAX_PAGES: '50',
    });

    try {
      const payload = {
        projectId: 'ttl-slide-compile',
        pageId: 'page1',
        classes: 'text-fuchsia-500'
      };

      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await sleep(140);

      const hit = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const hitBody = await hit.json();
      expect(hit.status).toBe(200);
      expect(hitBody.cached).toBe(true);

      // Past original expiry, still inside refreshed window.
      await sleep(140);
      const stillCached = await fetch(`${baseUrl}/api/css?projectId=ttl-slide-compile&pageId=page1`);
      expect(stillCached.status).toBe(200);

      await sleep(240);
      const expired = await fetch(`${baseUrl}/api/css?projectId=ttl-slide-compile&pageId=page1`);
      expect(expired.status).toBe(200);
      expect(await expired.text()).toBe('');
    } finally {
      await close();
    }
  });

  it('project aggregated CSS still serves after RW_PROJECT_CACHE_TTL_MS expiry', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_PROJECT_CACHE_TTL_MS: '120',
      RW_CACHE_TTL_MS: '60000',
    });

    try {
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-ttl', pageId: 'page1', classes: 'text-red-500' }),
      });

      const first = await fetch(`${baseUrl}/api/projects/proj-ttl/css`);
      expect(first.status).toBe(200);
      const css1 = await first.text();
      expect(css1.length).toBeGreaterThan(0);

      await sleep(160);

      const second = await fetch(`${baseUrl}/api/projects/proj-ttl/css`);
      expect(second.status).toBe(200);
      const css2 = await second.text();
      expect(css2.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
