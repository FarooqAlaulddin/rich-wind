import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../services/index.js';

let server;
let baseUrl;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('POST /api/compile', () => {
  it('accepts html + classes and returns CSS with success: true, correct projectId, pageId, non-empty css, and classes array containing expected classes', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-a',
        pageId: 'home',
        html: '<div class="text-red-500 font-semibold">Hello</div>',
        classes: 'bg-blue-500 p-4',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.projectId).toBe('proj-a');
    expect(body.pageId).toBe('home');
    expect(body.css).toBeTruthy();
    expect(body.css.length).toBeGreaterThan(0);
    expect(Array.isArray(body.classes)).toBe(true);
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).toContain('bg-blue-500');
  });

  it('returns cached: true on identical second request (same html+classes)', async () => {
    const payload = {
      projectId: 'proj-cache-test',
      pageId: 'page1',
      html: '<div class="text-green-500">Test</div>',
      classes: 'p-2',
    };

    // First request
    const response1 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body1 = await response1.json();
    expect(body1.cached).toBe(false);

    // Second identical request
    const response2 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body2 = await response2.json();
    expect(body2.cached).toBe(true);
  });

  it('returns cached: false when classes change for same project/page', async () => {
    const projectId = 'proj-update-test';
    const pageId = 'page1';

    // First compile
    const response1 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId,
        classes: 'text-blue-500',
      }),
    });
    const body1 = await response1.json();
    expect(body1.cached).toBe(false);

    // Update with different classes
    const response2 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId,
        classes: 'text-red-500',
      }),
    });
    const body2 = await response2.json();
    expect(body2.cached).toBe(false);
  });

  it('returns 400 when projectId is missing', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        html: '<div class="text-red-500"></div>',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when neither html nor classes is provided', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'test-proj',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when projectId has invalid characters', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj/bad',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when pageId has invalid characters', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'valid-proj',
        pageId: 'page/bad',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('supports project_id snake_case alias', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: 'snake-case-proj',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe('snake-case-proj');
  });

  it('supports page_id snake_case alias', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'test-proj',
        page_id: 'snake-page',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pageId).toBe('snake-page');
  });

  it('defaults pageId to "default" when omitted', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'default-page-test',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pageId).toBe('default');
  });

  it('returns 413 when html exceeds RW_MAX_HTML_CHARS', async () => {
    // Create HTML that exceeds the default limit (50000 chars)
    const longHtml = '<div class="text-red-500">' + 'x'.repeat(60000) + '</div>';

    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'test-proj',
        html: longHtml,
      }),
    });

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('accepts classes as a space-separated string', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'string-classes-test',
        classes: 'text-blue-500 font-bold p-4',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.classes).toContain('text-blue-500');
    expect(body.classes).toContain('font-bold');
    expect(body.classes).toContain('p-4');
  });

  it('accepts classes as an array', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'array-classes-test',
        classes: ['text-blue-500', 'font-bold', 'p-4'],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.classes).toContain('text-blue-500');
    expect(body.classes).toContain('font-bold');
    expect(body.classes).toContain('p-4');
  });

  it('only valid Tailwind classes appear in the response (no random strings)', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'validation-test',
        classes: 'text-red-500 not-a-real-class bg-blue-500 another-fake-class',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).toContain('bg-blue-500');
    expect(body.classes).not.toContain('not-a-real-class');
    expect(body.classes).not.toContain('another-fake-class');
  });
});

describe('GET /api/css', () => {
  it('returns cached CSS after a compile with content-type text/css', async () => {
    // First compile
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'css-get-test',
        pageId: 'page1',
        classes: 'text-purple-500',
      }),
    });

    // Get CSS
    const response = await fetch(`${baseUrl}/api/css?projectId=css-get-test&pageId=page1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('returns 404 on cache miss', async () => {
    const response = await fetch(`${baseUrl}/api/css?projectId=missing-proj&pageId=missing-page`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when projectId is missing', async () => {
    const response = await fetch(`${baseUrl}/api/css?pageId=some-page`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('supports project_id and page_id query params', async () => {
    // First compile
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'snake-query-test',
        pageId: 'page1',
        classes: 'text-orange-500',
      }),
    });

    // Get CSS with snake_case params
    const response = await fetch(`${baseUrl}/api/css?project_id=snake-query-test&page_id=page1`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });
});

describe('GET /api/projects/:projectId/css', () => {
  it('returns aggregated CSS across multiple pages in a project', async () => {
    const projectId = 'multi-page-proj';

    // Compile multiple pages
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'text-red-500',
      }),
    });

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page2',
        classes: 'bg-blue-500',
      }),
    });

    // Get aggregated CSS
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/css`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown project', async () => {
    const response = await fetch(`${baseUrl}/api/projects/unknown-project-xyz/css`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 for invalid projectId', async () => {
    const response = await fetch(`${baseUrl}/api/projects/invalid%2Fproject/css`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe('POST /api/suggest', () => {
  it('returns suggestions from cached project classes filtered by prefix', async () => {
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'suggest-proj',
        pageId: 'page1',
        classes: 'bg-blue-500 text-red-500 p-4',
      }),
    });

    const response = await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'suggest-proj',
        prefix: 'bg-',
        limit: 5,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.suggestions).toContain('bg-blue-500');
    expect(body.suggestions.find((item) => item.startsWith('text-'))).toBeFalsy();
  });

  it('includes input classes when provided without a projectId', async () => {
    const response = await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        classes: 'rounded-xl shadow-lg text-sm',
        prefix: 'shadow',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.suggestions).toContain('shadow-lg');
  });

  it('returns 400 for invalid projectId', async () => {
    const response = await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bad/id',
        prefix: 'bg-',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns fallback suggestions when cache is empty', async () => {
    const response = await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prefix: 'bg-',
        limit: 5,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
    body.suggestions.forEach((item) => {
      expect(item.startsWith('bg-')).toBe(true);
    });
  });
});

describe('GET /health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

describe('Security headers', () => {
  it('responses include X-Content-Type-Options: nosniff', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('responses include X-Frame-Options: DENY', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('no X-Powered-By header', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-powered-by')).toBeNull();
  });
});
