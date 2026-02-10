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
      expect(response.status).toBe(404);
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
      expect(response.status).toBe(404);
    } finally {
      await close();
    }
  });
});
