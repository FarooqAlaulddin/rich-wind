import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createCore } from '../services/index.js';

function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0);
  return new Promise((resolve) =>
    server.once('listening', () =>
      resolve({
        baseUrl: `http://localhost:${server.address().port}`,
        stop: () => new Promise((done) => server.close(done))
      })
    )
  );
}

function makeSeenPlugin(seen) {
  return {
    name: 'seen',
    guard(request) {
      seen.push(request.path);
      return null;
    }
  };
}

// Exercises the routes core serves, under `prefix`.
async function exerciseRoutes(baseUrl, prefix, projectId) {
  const compile = await fetch(`${baseUrl}${prefix}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId: 'p1', classes: 'p-4 text-red-500' })
  });
  expect(compile.status).toBe(200);

  const css = await fetch(`${baseUrl}${prefix}/api/css?projectId=${projectId}&pageId=p1`);
  expect(css.status).toBe(200);
  expect(css.headers.get('content-type')).toMatch(/css/);
  expect(await css.text()).toContain('text-red-500');

  const project = await fetch(`${baseUrl}${prefix}/api/projects/${projectId}/css`);
  expect(project.status).toBe(200);
  expect(project.headers.get('content-type')).toMatch(/css/);

  const loader = await fetch(`${baseUrl}${prefix}/richwind-loader.js`);
  expect(loader.status).toBe(200);
  expect(loader.headers.get('content-type')).toMatch(/javascript/);
}

describe('Embedding: Express host mounts core.handler under a prefix', () => {
  let core;
  let host;
  const seen = [];

  beforeAll(async () => {
    core = await createCore({ plugins: [makeSeenPlugin(seen)] });
    const app = express();
    const auth = (req, res, next) =>
      req.header('x-api-key') === 'secret' ? next() : res.status(401).json({ error: 'host says no' });
    app.use('/rw/api', auth);
    app.use('/rw', core.handler);
    host = await listen(app);
  });

  afterAll(async () => {
    await host.stop();
    await core.close();
  });

  it('serves compile, CSS GETs and the loader under /rw', async () => {
    const res = await fetch(`${host.baseUrl}/rw/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'secret' },
      body: JSON.stringify({ projectId: 'emb-express', pageId: 'p1', classes: 'p-4 text-red-500' })
    });
    expect(res.status).toBe(200);

    const headers = { 'x-api-key': 'secret' };
    const css = await fetch(`${host.baseUrl}/rw/api/css?projectId=emb-express&pageId=p1`, { headers });
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('text-red-500');

    const project = await fetch(`${host.baseUrl}/rw/api/projects/emb-express/css`, { headers });
    expect(project.status).toBe(200);
    expect(project.headers.get('content-type')).toMatch(/css/);

    const loader = await fetch(`${host.baseUrl}/rw/richwind-loader.js`);
    expect(loader.status).toBe(200);
    expect(loader.headers.get('content-type')).toMatch(/javascript/);
  });

  it('host middleware answers before core runs', async () => {
    seen.length = 0;
    const blocked = await fetch(`${host.baseUrl}/rw/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'emb-blocked', pageId: 'p1', classes: 'p-4' })
    });
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual({ error: 'host says no' });
    expect(seen).toEqual([]);

    const allowed = await fetch(`${host.baseUrl}/rw/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'secret' },
      body: JSON.stringify({ projectId: 'emb-allowed', pageId: 'p1', classes: 'p-4' })
    });
    expect(allowed.status).toBe(200);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('Embedding: plain node:http host strips the prefix', () => {
  let core;
  let host;

  beforeAll(async () => {
    core = await createCore();
    host = await listen((req, res) => {
      if (req.url === '/rw' || req.url.startsWith('/rw/') || req.url.startsWith('/rw?')) {
        req.url = req.url.slice(3) || '/';
        if (req.url[0] === '?') req.url = `/${req.url}`;
        return core.handler(req, res);
      }
      res.statusCode = 404;
      res.end('host 404');
    });
  });

  afterAll(async () => {
    await host.stop();
    await core.close();
  });

  it('serves the same routes under /rw, query strings intact', async () => {
    await exerciseRoutes(host.baseUrl, '/rw', 'emb-http');
  });

  it('leaves paths outside the prefix to the host', async () => {
    const res = await fetch(`${host.baseUrl}/api/css?projectId=emb-http&pageId=p1`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('host 404');
  });
});

describe('Embedding: core.fetch with basePath', () => {
  let core;
  let host;

  beforeAll(async () => {
    core = await createCore();
    // Bridge a Node request to a web Request, as a framework route handler does.
    host = await listen(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Buffer.concat(chunks) : undefined
      });
      const response = await core.fetch(request, { basePath: '/rw' });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  });

  afterAll(async () => {
    await host.stop();
    await core.close();
  });

  it('serves the same routes under /rw', async () => {
    await exerciseRoutes(host.baseUrl, '/rw', 'emb-fetch');
  });

  it('answers 404 outside the prefix', async () => {
    const res = await fetch(`${host.baseUrl}/api/css?projectId=emb-fetch&pageId=p1`);
    expect(res.status).toBe(404);
    const direct = await core.fetch(new Request('http://x/other/api/compile', { method: 'POST' }), {
      basePath: '/rw'
    });
    expect(direct.status).toBe(404);
  });
});
