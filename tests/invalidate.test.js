import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

async function compile(baseUrl, projectId, pageId, classes) {
  const res = await fetch(`${baseUrl}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId, classes }),
  });
  return res.json();
}

async function invalidate(baseUrl, body) {
  return fetch(`${baseUrl}/api/invalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getPageCss(baseUrl, projectId, pageId) {
  const res = await fetch(`${baseUrl}/api/css?projectId=${projectId}&pageId=${pageId}`);
  return res.text();
}

describe('POST /api/invalidate', () => {
  it('returns 400 when projectId is missing', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await invalidate(baseUrl, {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/projectId/i);
    } finally {
      await close();
    }
  });

  it('returns 400 for invalid projectId', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await invalidate(baseUrl, { projectId: 'bad id with spaces' });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('returns 400 for invalid pageId', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await invalidate(baseUrl, { projectId: 'proj', pageId: 'bad/page' });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('returns 409 on a reader node', async () => {
    const { baseUrl, close } = await createTestServer({ RW_NODE_ROLE: 'reader' });
    try {
      const res = await invalidate(baseUrl, { projectId: 'proj' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('READ_ONLY_REPLICA');
    } finally {
      await close();
    }
  });

  it('purges a single page — subsequent GET returns empty CSS', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-inv', 'page1', 'text-red-500');

      // Confirm page is cached
      const before = await getPageCss(baseUrl, 'proj-inv', 'page1');
      expect(before.length).toBeGreaterThan(0);

      const res = await invalidate(baseUrl, { projectId: 'proj-inv', pageId: 'page1' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invalidated).toBe(true);
      expect(body.projectId).toBe('proj-inv');
      expect(body.pageId).toBe('page1');

      // After invalidation, the page has no compiled CSS in cache
      const after = await getPageCss(baseUrl, 'proj-inv', 'page1');
      expect(after).toBe('');
    } finally {
      await close();
    }
  });

  it('purging a page does not affect other pages in the same project', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-partial', 'page1', 'text-red-500');
      await compile(baseUrl, 'proj-partial', 'page2', 'bg-blue-500');

      await invalidate(baseUrl, { projectId: 'proj-partial', pageId: 'page1' });

      const page1Css = await getPageCss(baseUrl, 'proj-partial', 'page1');
      const page2Css = await getPageCss(baseUrl, 'proj-partial', 'page2');

      expect(page1Css).toBe('');
      expect(page2Css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('purges an entire project — all pages return empty CSS', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-all', 'page1', 'text-red-500');
      await compile(baseUrl, 'proj-all', 'page2', 'bg-blue-500');

      const res = await invalidate(baseUrl, { projectId: 'proj-all' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invalidated).toBe(true);
      expect(body.projectId).toBe('proj-all');
      expect(body.pageId).toBeUndefined();

      expect(await getPageCss(baseUrl, 'proj-all', 'page1')).toBe('');
      expect(await getPageCss(baseUrl, 'proj-all', 'page2')).toBe('');
    } finally {
      await close();
    }
  });

  it('after page invalidation, recompile repopulates the cache', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-repop', 'page1', 'text-red-500');
      await invalidate(baseUrl, { projectId: 'proj-repop', pageId: 'page1' });

      // Should be empty now
      expect(await getPageCss(baseUrl, 'proj-repop', 'page1')).toBe('');

      // Recompile
      await compile(baseUrl, 'proj-repop', 'page1', 'text-red-500');
      const after = await getPageCss(baseUrl, 'proj-repop', 'page1');
      expect(after.length).toBeGreaterThan(0);
      expect(after).toMatch(/text-red/);
    } finally {
      await close();
    }
  });

  it('invalidating a non-existent project succeeds without error', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await invalidate(baseUrl, { projectId: 'does-not-exist' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invalidated).toBe(true);
    } finally {
      await close();
    }
  });
});
