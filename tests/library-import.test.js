import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';

describe('Library import tests', () => {
  it('import { createCore } from "../services/index.js" succeeds', () => {
    expect(createCore).toBeDefined();
  });

  it('createCore returns an Express app', () => {
    const app = createCore();
    expect(typeof app).toBe('function');
  });

  it('app has .get, .post, .listen, .use methods', () => {
    const app = createCore();
    expect(typeof app.get).toBe('function');
    expect(typeof app.post).toBe('function');
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('can call app.listen(0) and get a running server that responds to /health', async () => {
    const app = createCore();
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
    const app1 = createCore();
    const app2 = createCore();
    expect(app1).not.toBe(app2);
  });
});
