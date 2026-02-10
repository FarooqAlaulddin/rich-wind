import { vi } from 'vitest';

export async function createTestServer(envOverrides = {}) {
  const originalEnv = { ...process.env };
  Object.assign(process.env, envOverrides);

  vi.resetModules();
  const moduleUrl = new URL('../../services/index.js', import.meta.url).href;
  const { app } = await import(moduleUrl);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  }

  return { server, baseUrl: `http://localhost:${port}`, close };
}
