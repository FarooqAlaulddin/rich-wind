import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

describe('CORS configuration', () => {
  it('does not emit CORS headers when RW_CORS_ORIGIN is not set', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://demo.example.com' }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await close();
    }
  });

  it('supports wildcard CORS and handles preflight', async () => {
    const { baseUrl, close } = await createTestServer(
      { RW_CORS_ORIGIN: '*' },
      { config: { rateLimitDisabled: true } }
    );

    try {
      const preflight = await fetch(`${baseUrl}/api/compile`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://demo.example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('*');

      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: {
          Origin: 'https://demo.example.com',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          projectId: 'cors-any',
          pageId: 'home',
          classes: 'text-red-500'
        })
      });
      expect(compile.status).toBe(200);
      expect(compile.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      await close();
    }
  });

  it('supports allowlisted origins and rejects preflight from blocked origin', async () => {
    const { baseUrl, close } = await createTestServer(
      { RW_CORS_ORIGIN: 'https://demo.example.com,https://studio.example.com' },
      { config: { rateLimitDisabled: true } }
    );

    try {
      const allowed = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://studio.example.com' }
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://studio.example.com');

      const blocked = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://evil.example.com' }
      });
      expect(blocked.status).toBe(200);
      expect(blocked.headers.get('access-control-allow-origin')).toBeNull();

      const blockedPreflight = await fetch(`${baseUrl}/api/compile`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      });
      expect(blockedPreflight.status).toBe(403);
      const blockedBody = await blockedPreflight.json();
      expect(blockedBody.error).toMatch(/not allowed/i);
    } finally {
      await close();
    }
  });

  it('config.corsOrigin overrides RW_CORS_ORIGIN', async () => {
    const { baseUrl, close } = await createTestServer(
      { RW_CORS_ORIGIN: '*' },
      { config: { corsOrigin: 'https://locked.example.com', rateLimitDisabled: true } }
    );

    try {
      const allowed = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://locked.example.com' }
      });
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://locked.example.com');

      const blocked = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://other.example.com' }
      });
      expect(blocked.status).toBe(200);
      expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await close();
    }
  });
});
