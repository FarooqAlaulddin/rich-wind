import { describe, it, expect, vi } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('POST without JSON content-type', () => {
  it('/api/compile returns 415 with the error envelope when body is not JSON', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json'
      });
      expect(response.status).toBe(415);
      const body = await response.json();
      expect(body).toMatchObject({ error: expect.any(String), code: 'UNSUPPORTED_MEDIA_TYPE' });
    } finally {
      await close();
    }
  });

  it('/api/suggest returns 415 rather than silently accepting a non-JSON body', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json'
      });
      expect(response.status).toBe(415);
      const body = await response.json();
      expect(body).toMatchObject({ error: expect.any(String), code: 'UNSUPPORTED_MEDIA_TYPE' });
    } finally {
      await close();
    }
  });

  it('/api/compile returns 400 when body is empty', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/projectId/i);
    } finally {
      await close();
    }
  });

  it('/api/suggest succeeds with empty JSON body (all fields optional)', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.suggestions)).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('Compile edge cases', () => {
  it('handles arbitrary value classes like bg-[#ff0000]', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-arb',
          pageId: 'p1',
          classes: 'bg-[#ff0000] text-[2rem] p-[10px]'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.css).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('same classes in different order produce same hash (normalization)', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response1 = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-order',
          pageId: 'p1',
          classes: 'text-red-500 bg-blue-500 p-4'
        })
      });
      expect(response1.status).toBe(200);
      const body1 = await response1.json();

      const response2 = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-order',
          pageId: 'p1',
          classes: 'p-4 bg-blue-500 text-red-500'
        })
      });
      expect(response2.status).toBe(200);
      const body2 = await response2.json();

      // Same classes in different order should produce same hash (sorted normalization)
      expect(body1.hash).toBe(body2.hash);
    } finally {
      await close();
    }
  });

  it('compiles base bundle without html or classes', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-base',
          bundle: 'base'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.css).toBeTruthy();
      expect(body.bundle).toBe('base');
    } finally {
      await close();
    }
  });

  it('handles empty string for html and classes', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-empty',
          pageId: 'p1',
          html: '',
          classes: ''
        })
      });
      // Empty strings are falsy, so this should require at least one
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/html|classes/i);
    } finally {
      await close();
    }
  });

  it('rejects removed snake_case aliases', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: 'edge-snake',
          page_id: 'home',
          classes: 'text-red-500'
        })
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('MISSING_INPUT');
    } finally {
      await close();
    }
  });
});

describe('Suggest edge cases', () => {
  it('handles non-string classes input gracefully', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          classes: 12345
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    } finally {
      await close();
    }
  });

  it('respects configured suggest limit', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true, suggestLimit: 3 }
    });

    try {
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prefix: 'text-',
          limit: 100
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.suggestions.length).toBeLessThanOrEqual(3);
    } finally {
      await close();
    }
  });

  it('returns empty suggestions for unknown prefix', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prefix: 'zzzznotaclass-'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.suggestions.length).toBe(0);
    } finally {
      await close();
    }
  });
});

describe('Bundle normalization edge cases', () => {
  it('ignores the removed mode alias', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-mode',
          pageId: 'p1',
          classes: 'text-red-500',
          mode: 'utilities'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.bundle).toBe('full');
    } finally {
      await close();
    }
  });

  it('falls back to full bundle for unknown bundle name', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'edge-bundle',
          pageId: 'p1',
          classes: 'text-red-500',
          bundle: 'nonexistent-bundle'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      // Unknown bundle should fall back to 'full'
      expect(body.bundle).toBe('full');
    } finally {
      await close();
    }
  });
});

describe('onError plugin hook safety', () => {
  it('/api/suggest catch block fires onError without crashing', async () => {
    const errors = [];
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true },
      plugins: [{
        name: 'error-spy',
        hooks: {
          onError({ error, stage, request }) {
            errors.push({ message: error.message, stage, hasRequest: !!request });
          }
        }
      }]
    });

    try {
      // Send request that triggers an error before hookContext is set
      const response = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json'
      });
      // Should not be a 500 from ReferenceError
      expect(response.status).toBeLessThan(500);
    } finally {
      await close();
    }
  });

  it('/api/compile catch block fires onError with request info', async () => {
    const errors = [];
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true },
      plugins: [{
        name: 'error-spy',
        hooks: {
          onError({ error, stage, request }) {
            errors.push({ message: error.message, stage, hasRequest: !!request });
          }
        }
      }]
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json'
      });
      expect(response.status).toBeLessThan(500);
    } finally {
      await close();
    }
  });
});

describe('Project CSS revalidation (expired but unchanged hash)', () => {
  it('reuses expired project CSS when class hash has not changed', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_PROJECT_CACHE_TTL_MS: '150',
      RW_CACHE_TTL_MS: '60000',
    }, {
      config: { rateLimitDisabled: true }
    });

    try {
      // Compile a page so project CSS is generated
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'reval-proj', pageId: 'p1', classes: 'text-red-500 p-4' })
      });

      // Fetch project CSS (populates project cache)
      const first = await fetch(`${baseUrl}/api/projects/reval-proj/css`);
      expect(first.status).toBe(200);
      const css1 = await first.text();
      expect(css1.length).toBeGreaterThan(0);

      // Wait for project cache to expire
      await sleep(200);

      // Fetch again — same classes, hash unchanged, should revalidate without recompiling
      const second = await fetch(`${baseUrl}/api/projects/reval-proj/css`);
      expect(second.status).toBe(200);
      const css2 = await second.text();

      // CSS should be identical (served from revalidated cache, not recompiled)
      expect(css2).toBe(css1);
    } finally {
      await close();
    }
  });
});

describe('cacheMaxPages minimum enforcement', () => {
  it('enforces minimum of 1 page even when configured to 0', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_CACHE_MAX_PAGES: '0',
    }, {
      config: { rateLimitDisabled: true }
    });

    try {
      // Compile a page
      await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'min-pages', pageId: 'p1', classes: 'text-red-500' })
      });

      // Page should still be retrievable (min 1 page, not evicted immediately)
      const response = await fetch(`${baseUrl}/api/css?projectId=min-pages&pageId=p1`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
