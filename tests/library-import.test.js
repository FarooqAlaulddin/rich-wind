import { describe, it, expect } from 'vitest';
import { app } from '../services/index.js';

describe('Library import tests', () => {
  it('import { app } from "../services/index.js" succeeds', () => {
    expect(app).toBeDefined();
  });

  it('app is a function (Express app)', () => {
    expect(typeof app).toBe('function');
  });

  it('app has .get, .post, .listen, .use methods', () => {
    expect(typeof app.get).toBe('function');
    expect(typeof app.post).toBe('function');
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('can call app.listen(0) and get a running server that responds to /health', async () => {
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

  it('multiple imports return the same app instance (singleton)', async () => {
    const { app: app1 } = await import('../services/index.js');
    const { app: app2 } = await import('../services/index.js');
    expect(app1).toBe(app2);
  });
});
