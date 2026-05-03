import { describe, it, expect } from 'vitest';
import { createRateLimitPlugin } from '../plugins/rate-limit/index.js';
import { createTestServer } from './helpers/createTestServer.js';

describe('Rate limit plugin', () => {
  it('returns 429 and Retry-After when limit exceeded', async () => {
    const plugin = createRateLimitPlugin({ windowMs: 60000, max: 2 });
    const { baseUrl, close } = await createTestServer({}, { plugins: [plugin] });

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

  it('disabled option bypasses all limiting', async () => {
    const plugin = createRateLimitPlugin({ windowMs: 60000, max: 1, disabled: true });
    const { baseUrl, close } = await createTestServer({}, { plugins: [plugin] });

    try {
      for (let i = 0; i < 5; i += 1) {
        const response = await fetch(`${baseUrl}/health`);
        expect(response.status).toBe(200);
      }
    } finally {
      await close();
    }
  });

  it('no rate limiting when plugin is not registered', async () => {
    const { baseUrl, close } = await createTestServer({}, { plugins: [] });

    try {
      for (let i = 0; i < 10; i += 1) {
        const response = await fetch(`${baseUrl}/health`);
        expect(response.status).toBe(200);
      }
    } finally {
      await close();
    }
  });

  it('ignores X-Forwarded-For when trust proxy is disabled', async () => {
    const plugin = createRateLimitPlugin({ windowMs: 60000, max: 1 });
    const { baseUrl, close } = await createTestServer(
      { RW_TRUST_PROXY: 'false' },
      { plugins: [plugin] }
    );

    try {
      const r1 = await fetch(`${baseUrl}/health`, {
        headers: { 'x-forwarded-for': '1.1.1.1' },
      });
      const r2 = await fetch(`${baseUrl}/health`, {
        headers: { 'x-forwarded-for': '2.2.2.2' },
      });

      // trust proxy off → both requests share the real loopback IP → r2 is blocked
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(429);
    } finally {
      await close();
    }
  });

  it('uses X-Forwarded-For when trust proxy is enabled', async () => {
    const plugin = createRateLimitPlugin({ windowMs: 60000, max: 1 });
    const { baseUrl, close } = await createTestServer(
      { RW_TRUST_PROXY: 'true' },
      { plugins: [plugin] }
    );

    try {
      const r1 = await fetch(`${baseUrl}/health`, {
        headers: { 'x-forwarded-for': '1.1.1.1' },
      });
      const r2 = await fetch(`${baseUrl}/health`, {
        headers: { 'x-forwarded-for': '2.2.2.2' },
      });

      // trust proxy on → different forwarded IPs → each has its own bucket → both pass
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
    } finally {
      await close();
    }
  });
});
