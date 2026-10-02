import http from 'node:http';
import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';

describe('Library import tests', () => {
  it('import { createCore } from "../services/index.js" succeeds', () => {
    expect(createCore).toBeDefined();
  });

  it('createCore returns a promise that resolves to { handler, fetch, close, ... }', async () => {
    const result = await createCore();
    try {
      expect(typeof result.handler).toBe('function');
      expect(typeof result.fetch).toBe('function');
      expect(typeof result.close).toBe('function');
    } finally {
      await result.close();
    }
  });

  it('exposes the five core functions', async () => {
    const core = await createCore();
    try {
      for (const fn of ['compile', 'getCss', 'getProjectCss', 'invalidate', 'suggest']) {
        expect(typeof core[fn]).toBe('function');
      }
    } finally {
      await core.close();
    }
  });

  it('exports RichWindError', async () => {
    const { RichWindError } = await import('../services/index.js');
    const err = new RichWindError(404, 'NOT_FOUND', 'Missing.');
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: 'RichWindError', status: 404, code: 'NOT_FOUND', message: 'Missing.' });
  });

  it('exposes compile with the HTTP success shape', async () => {
    const { compile, close } = await createCore();
    try {
      const result = await compile({ projectId: 'direct-compile', classes: 'p-4' });
      expect(result).toMatchObject({ success: true, projectId: 'direct-compile', pageId: 'default' });
      expect(result.css).toContain('.p-4');
    } finally {
      await close();
    }
  });

  it('handler is a node:http request listener and fetch serves /health', async () => {
    const core = await createCore();
    try {
      expect(core.handler.length).toBeGreaterThanOrEqual(2);
      const response = await core.fetch(new Request('http://localhost/health'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await core.close();
    }
  });

  it('can serve core.handler via http.createServer and respond to /health', async () => {
    const core = await createCore();
    const server = http.createServer(core.handler).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');

    await new Promise((resolve) => server.close(resolve));
    await core.close();
  });

  it('createCore returns separate instances', async () => {
    const result1 = await createCore();
    const result2 = await createCore();
    try {
      expect(result1.handler).not.toBe(result2.handler);
    } finally {
      await result1.close();
      await result2.close();
    }
  });
});
