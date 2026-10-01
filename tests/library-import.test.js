import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';

describe('Library import tests', () => {
  it('import { createCore } from "../services/index.js" succeeds', () => {
    expect(createCore).toBeDefined();
  });

  it('createCore returns a promise that resolves to { app, close }', async () => {
    const result = await createCore();
    expect(result).toHaveProperty('app');
    expect(result).toHaveProperty('close');
    expect(typeof result.app).toBe('function');
    expect(typeof result.close).toBe('function');
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

  it('app has .get, .post, .listen, .use methods', async () => {
    const { app } = await createCore();
    expect(typeof app.get).toBe('function');
    expect(typeof app.post).toBe('function');
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('can call app.listen(0) and get a running server that responds to /health', async () => {
    const { app } = await createCore();
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');

    await new Promise((resolve) => server.close(resolve));
  });

  it('createCore returns separate instances', async () => {
    const result1 = await createCore();
    const result2 = await createCore();
    expect(result1.app).not.toBe(result2.app);
  });
});
