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

describe('Cache-Control and ETag on /api/css', () => {
  it('returns ETag header after a page is compiled', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-etag', 'page1', 'text-red-500');
      const res = await fetch(`${baseUrl}/api/css?projectId=proj-etag&pageId=page1`);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 304 when If-None-Match matches current ETag', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-304', 'page1', 'text-blue-500');
      const first = await fetch(`${baseUrl}/api/css?projectId=proj-304&pageId=page1`);
      const etag = first.headers.get('etag');
      expect(etag).toBeTruthy();

      const second = await fetch(`${baseUrl}/api/css?projectId=proj-304&pageId=page1`, {
        headers: { 'if-none-match': etag },
      });
      expect(second.status).toBe(304);
      expect(await second.text()).toBe('');
    } finally {
      await close();
    }
  });

  it('returns 200 with new CSS when If-None-Match is stale', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-stale', 'page1', 'text-green-500');
      const res = await fetch(`${baseUrl}/api/css?projectId=proj-stale&pageId=page1`, {
        headers: { 'if-none-match': '"stale-etag-that-does-not-match"' },
      });
      expect(res.status).toBe(200);
      const css = await res.text();
      expect(css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('returns Cache-Control: no-cache when ETag is present', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-cc', 'page1', 'p-4');
      const res = await fetch(`${baseUrl}/api/css?projectId=proj-cc&pageId=page1`);
      expect(res.headers.get('cache-control')).toBe('no-cache');
    } finally {
      await close();
    }
  });

  it('returns empty CSS for an uncached page (cache miss)', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/css?projectId=proj-miss&pageId=nonexistent`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    } finally {
      await close();
    }
  });
});

describe('Cache-Control and ETag on /api/projects/:projectId/css', () => {
  it('returns ETag header after pages are compiled', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-p-etag', 'page1', 'text-red-500');
      await compile(baseUrl, 'proj-p-etag', 'page2', 'bg-blue-500');
      const res = await fetch(`${baseUrl}/api/projects/proj-p-etag/css`);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 304 when If-None-Match matches project ETag', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      await compile(baseUrl, 'proj-p-304', 'page1', 'font-bold');
      const first = await fetch(`${baseUrl}/api/projects/proj-p-304/css`);
      const etag = first.headers.get('etag');
      expect(etag).toBeTruthy();

      const second = await fetch(`${baseUrl}/api/projects/proj-p-304/css`, {
        headers: { 'if-none-match': etag },
      });
      expect(second.status).toBe(304);
    } finally {
      await close();
    }
  });

  it('returns empty CSS for an unknown project', async () => {
    const { baseUrl, close } = await createTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/projects/unknown-proj/css`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    } finally {
      await close();
    }
  });
});
