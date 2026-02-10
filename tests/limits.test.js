import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

describe('Limits and validation', () => {
  it('returns 413 when request body exceeds RW_MAX_BODY_BYTES', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_MAX_BODY_BYTES: '1024',
    });

    try {
      const longHtml = '<div class="text-red-500">' + 'x'.repeat(5000) + '</div>';
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'body-limit', html: longHtml }),
      });

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 413 when classes exceed RW_MAX_CLASS_CHARS', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_MAX_CLASS_CHARS: '20',
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'class-char-limit',
          classes: 'text-red-500 text-blue-500 text-green-500',
        }),
      });

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 413 when class count exceeds RW_MAX_CLASS_COUNT', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_MAX_CLASS_COUNT: '3',
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'class-count-limit',
          classes: 'text-red-500 text-blue-500 text-green-500 text-yellow-500',
        }),
      });

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 400 when no valid Tailwind classes are found', async () => {
    const { baseUrl, close } = await createTestServer();

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'invalid-class-test',
          classes: 'not-a-class totally-invalid',
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('returns 400 when projectId exceeds RW_MAX_ID_LENGTH', async () => {
    const { baseUrl, close } = await createTestServer({
      RW_MAX_ID_LENGTH: '10',
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-id-too-long',
          classes: 'text-red-500',
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    } finally {
      await close();
    }
  });
});
