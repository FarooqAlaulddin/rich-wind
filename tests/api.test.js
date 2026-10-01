import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCore } from '../services/index.js';
import { createTestServer } from './helpers/createTestServer.js';

let server;
let baseUrl;

beforeAll(async () => {
  const { app } = await createCore();
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
    expect(body.rejected).toEqual([]);
    expect(body.classes).toContain('text-red-500');
    expect(body.classes).toContain('bg-blue-500');
  });

  it('reports invalid explicit class tokens without treating HTML scanner noise as rejects', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'rejected-tokens',
        html: '<p>prose words should not become rejection feedback</p>',
        classes: 'text-red-500 definitely-not-a-tailwind-class text-red-500',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.classes).toContain('text-red-500');
    expect(body.rejected).toEqual(['definitely-not-a-tailwind-class']);
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

  it('rejects the removed project_id alias', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_id: 'snake-case-proj',
        classes: 'text-red-500',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('MISSING_INPUT');
  });

  it('ignores the removed page_id alias and uses the default page', async () => {
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
    expect(body.pageId).toBe('default');
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

  it('supports bundle=base without html/classes and returns only preflight CSS', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-base-only',
        bundle: 'base'
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('base');
    expect(Array.isArray(body.classes)).toBe(true);
    expect(body.classes.length).toBe(0);
    expect(body.css).toMatch(/box-sizing:\s*border-box/);
    expect(body.css).not.toContain('bg-red-500');
    expect(body.css).not.toContain('--color-');
  });

  it('supports bundle=utilities and omits preflight and theme styles', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-utils',
        pageId: 'page1',
        classes: 'bg-red-500 text-white',
        bundle: 'utilities'
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('utilities');
    expect(body.css).toContain('bg-red-500');
    expect(body.css).not.toMatch(/box-sizing:\s*border-box/);
    expect(body.css).not.toContain(':root, :host');
  });

  it('supports bundle=theme and returns only theme tokens', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-theme',
        pageId: 'page1',
        classes: 'bg-red-500 text-white',
        bundle: 'theme'
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('theme');
    expect(body.css).toContain('--color-');
    expect(body.css).not.toMatch(/box-sizing:\s*border-box/);
    expect(body.css).not.toContain('bg-red-500');
  });

  it('supports bundle=full and includes base + utilities', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-full',
        pageId: 'page1',
        classes: 'bg-red-500 text-white',
        bundle: 'full'
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('full');
    expect(body.css).toContain('bg-red-500');
    expect(body.css).toMatch(/box-sizing:\s*border-box/);
    expect(body.css).toContain('--color-');
  });

  it('ignores the removed mode alias for bundle', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-alias',
        pageId: 'page1',
        classes: 'bg-red-500',
        mode: 'utilities',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('full');
    expect(body.css).toContain('bg-red-500');
    expect(body.css).toMatch(/box-sizing:\s*border-box/);
    expect(body.css).toContain(':root, :host');
  });

  it('defaults invalid bundle values to full', async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'bundle-invalid',
        pageId: 'page1',
        classes: 'bg-red-500',
        bundle: 'not-real',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bundle).toBe('full');
    expect(body.css).toContain('bg-red-500');
    expect(body.css).toMatch(/box-sizing:\s*border-box/);
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
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('returns empty CSS on cache miss', async () => {
    const response = await fetch(`${baseUrl}/api/css?projectId=missing-proj&pageId=missing-page`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('returns 400 when projectId is missing', async () => {
    const response = await fetch(`${baseUrl}/api/css?pageId=some-page`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when pageId is invalid', async () => {
    const response = await fetch(`${baseUrl}/api/css?projectId=valid-proj&pageId=bad%2Fid`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('does not accept project_id and page_id query aliases', async () => {
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
    expect(response.status).toBe(400);
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('returns base bundle even without cached page', async () => {
    const response = await fetch(`${baseUrl}/api/css?projectId=base-miss&pageId=page1&bundle=base`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toMatch(/box-sizing:\s*border-box/);
  });

  it('returns utilities bundle for a cached page', async () => {
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'css-utils-test',
        pageId: 'page1',
        classes: 'bg-green-500 text-white'
      })
    });

    const response = await fetch(`${baseUrl}/api/css?projectId=css-utils-test&pageId=page1&bundle=utilities`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toContain('bg-green-500');
    expect(css).not.toMatch(/box-sizing:\s*border-box/);
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
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('returns empty CSS for unknown project', async () => {
    const response = await fetch(`${baseUrl}/api/projects/unknown-project-xyz/css`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('returns 400 for invalid projectId', async () => {
    const response = await fetch(`${baseUrl}/api/projects/invalid%2Fproject/css`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it('returns base bundle even when project is missing', async () => {
    const response = await fetch(`${baseUrl}/api/projects/base-project-miss/css?bundle=base`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toMatch(/box-sizing:\s*border-box/);
  });

  it('returns utilities bundle aggregated across pages', async () => {
    const projectId = 'utilities-project';

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'bg-blue-500'
      })
    });

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page2',
        classes: 'text-red-500'
      })
    });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/css?bundle=utilities`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css).toContain('bg-blue-500');
    expect(css).toContain('text-red-500');
    expect(css).not.toMatch(/box-sizing:\s*border-box/);
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

  it('returns no suggestions when fallback is disabled and cache is empty', async () => {
    const { baseUrl: tempBase, close } = await createTestServer({
      RW_SUGGEST_FALLBACK: 'false',
    });

    try {
      const response = await fetch(`${tempBase}/api/suggest`, {
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
      expect(body.suggestions.length).toBe(0);
    } finally {
      await close();
    }
  });

  it('clamps suggestion limit to RW_SUGGEST_LIMIT', async () => {
    const { baseUrl: tempBase, close } = await createTestServer({
      RW_SUGGEST_LIMIT: '5',
    });

    try {
      const response = await fetch(`${tempBase}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prefix: 'bg-',
          limit: 50,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.suggestions.length).toBeLessThanOrEqual(5);
    } finally {
      await close();
    }
  });

  it('supports variant prefixes like hover:bg-', async () => {
    const response = await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prefix: 'hover:bg-',
        limit: 5,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
    body.suggestions.forEach((item) => {
      expect(item.startsWith('hover:bg-')).toBe(true);
    });
  });
});

describe('GET /richwind-loader.js', () => {
  it('returns the browser loader as cacheable JavaScript', async () => {
    const response = await fetch(`${baseUrl}/richwind-loader.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');

    const js = await response.text();
    expect(js).toContain('data-project-id');
    expect(js).toContain('/api/compile');
    expect(js).toContain('/api/projects/');
    expect(() => new Function(js)).not.toThrow();
  });
});

describe('GET /richwind-reload.js', () => {
  it('returns the reload helper as cacheable JavaScript', async () => {
    const response = await fetch(`${baseUrl}/richwind-reload.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');

    const js = await response.text();
    expect(js).toContain('rich-wind-reload-button');
    expect(js).toContain('rwReload');
    expect(js).toContain('window.location.replace');
    expect(() => new Function(js)).not.toThrow();
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
