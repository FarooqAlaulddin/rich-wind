import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

// Note: must set env before importing the app (createTestServer handles this).

describe('Rate limiting', () => {
  it('returns 429 and Retry-After when limit exceeded', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_RATE_LIMIT_WINDOW_MS: '60000',
      RW_RATE_LIMIT_MAX: '2',
      RW_RATE_LIMIT_DISABLED: 'false',
    });

    try {
      const r1 = await fetch(`${baseUrl}/health`);
      const r2 = await fetch(`${baseUrl}/health`);
      const r3 = await fetch(`${baseUrl}/health`);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
      expect(r3.headers.get('retry-after')).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('can be disabled with RW_RATE_LIMIT_DISABLED=true', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_RATE_LIMIT_WINDOW_MS: '60000',
      RW_RATE_LIMIT_MAX: '1',
      RW_RATE_LIMIT_DISABLED: 'true',
    });

    try {
      for (let i = 0; i < 5; i += 1) {
        const response = await fetch(`${baseUrl}/health`);
        expect(response.status).toBe(200);
      }
    } finally {
      await close();
    }
  });
});
