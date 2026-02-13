import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

describe('JS config overrides', () => {
  it('honors config.maxClassCount', async () => {
    const { baseUrl, close } = await createTestServer({}, {
      config: { maxClassCount: 1 }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'demo',
          pageId: 'hero',
          classes: 'bg-red-500 bg-blue-500'
        })
      });

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toMatch(/Too many classes/i);
    } finally {
      await close();
    }
  });

  it('config overrides env values', async () => {
    const { baseUrl, close } = await createTestServer(
      { RW_MAX_CLASS_COUNT: '1' },
      { config: { maxClassCount: 5 } }
    );

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'demo',
          pageId: 'hero',
          classes: 'bg-red-500 bg-blue-500'
        })
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.classes).toHaveLength(2);
    } finally {
      await close();
    }
  });
});
