import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import express from 'express';
import { createCore } from '../services/index.js';

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    server,
    baseUrl: `http://localhost:${server.address().port}`,
    port: server.address().port,
    stop: () => new Promise((resolve) => server.close(resolve))
  };
}

// Sends raw bytes so tests control framing (chunked, short bodies, bad lengths).
function rawRequest(port, raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    socket.on('data', (c) => chunks.push(c));
    socket.on('error', reject);
    socket.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const [head, ...rest] = text.split('\r\n\r\n');
      const [statusLine, ...headerLines] = head.split('\r\n');
      const headers = {};
      for (const line of headerLines) {
        const i = line.indexOf(':');
        headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({ status: Number(statusLine.split(' ')[1]), headers, body: rest.join('\r\n\r\n') });
    });
    socket.write(raw);
    socket.end();
  });
}

const postJson = (url, body, headers = {}) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

describe('HTTP surface rules', () => {
  let core;
  let srv;

  beforeAll(async () => {
    core = await createCore({ config: { maxBodyBytes: 2048 } });
    srv = await listen(core.handler);
  });

  afterAll(async () => {
    await srv.stop();
    await core.close();
  });

  it('paths are exact and case-sensitive, with no trailing slash', async () => {
    for (const path of ['/API/CSS?projectId=a', '/api/css/?projectId=a', '/Health', '/health/', '/nope']) {
      const res = await fetch(`${srv.baseUrl}${path}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found.', code: 'NOT_FOUND' });
    }
  });

  it('an unknown method on a known path is 404 in the envelope', async () => {
    const res = await fetch(`${srv.baseUrl}/health`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found.', code: 'NOT_FOUND' });
  });

  it('HEAD is answered on every GET route without a body', async () => {
    await core.compile({ projectId: 'head', pageId: 'p', classes: 'p-4' });
    for (const path of ['/health', '/richwind-loader.js', '/richwind-reload.js', '/api/css?projectId=head&pageId=p', '/api/projects/head/css']) {
      const get = await fetch(`${srv.baseUrl}${path}`);
      const head = await fetch(`${srv.baseUrl}${path}`, { method: 'HEAD' });
      expect(head.status).toBe(get.status);
      expect(head.headers.get('content-type')).toBe(get.headers.get('content-type'));
      expect(head.headers.get('content-length')).toBe(get.headers.get('content-length'));
      expect(await head.text()).toBe('');
    }
  });

  it('a bad percent-encoded projectId is 400 INVALID_ID', async () => {
    const res = await fetch(`${srv.baseUrl}/api/projects/%E0%A4%A/css`);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_ID');
  });

  it('a repeated query parameter is rejected', async () => {
    await core.compile({ projectId: 'rep', classes: 'p-4' });
    const res = await fetch(`${srv.baseUrl}/api/css?projectId=rep&projectId=rep`);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_ID');
  });

  it('loader scripts carry an explicit ETag, max-age and answer 304', async () => {
    for (const path of ['/richwind-loader.js', '/richwind-reload.js']) {
      const res = await fetch(`${srv.baseUrl}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
      const etag = res.headers.get('etag');
      expect(etag).toMatch(/^"[0-9a-f]{20}"$/);
      const again = await fetch(`${srv.baseUrl}${path}`, { headers: { 'If-None-Match': etag } });
      expect(again.status).toBe(304);
    }
  });

  it('JSON responses carry no ETag', async () => {
    const res = await fetch(`${srv.baseUrl}/health`);
    expect(res.headers.get('etag')).toBeNull();
  });

  it('security headers are on every response, failures included', async () => {
    for (const path of ['/health', '/nope']) {
      const res = await fetch(`${srv.baseUrl}${path}`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
  });
});

describe('Request bodies', () => {
  let core;
  let srv;
  let guardSawBody;
  const errors = [];

  beforeAll(async () => {
    core = await createCore({
      config: { maxBodyBytes: 1024 },
      plugins: [{
        name: 'body-probe',
        guard(request) {
          guardSawBody = 'body' in request;
          return null;
        },
        onError(info) { errors.push(info); }
      }]
    });
    srv = await listen(core.handler);
  });

  afterAll(async () => {
    await srv.stop();
    await core.close();
  });

  it('a POST without application/json is 415', async () => {
    const res = await fetch(`${srv.baseUrl}/api/compile`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}'
    });
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('a POST with Content-Encoding is 415', async () => {
    const res = await postJson(`${srv.baseUrl}/api/compile`, { projectId: 'a', classes: 'p-4' }, { 'Content-Encoding': 'gzip' });
    expect(res.status).toBe(415);
  });

  it('the guard runs before the body is read', async () => {
    const res = await postJson(`${srv.baseUrl}/api/compile`, { projectId: 'g', classes: 'p-4' });
    expect(res.status).toBe(200);
    expect(guardSawBody).toBe(false);
  });

  it('a Content-Length over maxBodyBytes is refused before reading, with Connection: close', async () => {
    const res = await rawRequest(srv.port,
      'POST /api/compile HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n' +
      'Content-Length: 100000\r\n\r\n{"projectId":"a"');
    expect(res.status).toBe(413);
    expect(res.headers.connection).toBe('close');
    expect(JSON.parse(res.body)).toEqual({ error: 'Payload too large.', code: 'PAYLOAD_TOO_LARGE' });
  });

  it('a chunked body over maxBodyBytes is capped while reading', async () => {
    const chunk = 'x'.repeat(600);
    const res = await rawRequest(srv.port,
      'POST /api/compile HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n' +
      'Transfer-Encoding: chunked\r\n\r\n' +
      `${chunk.length.toString(16)}\r\n${chunk}\r\n${chunk.length.toString(16)}\r\n${chunk}\r\n0\r\n\r\n`);
    expect(res.status).toBe(413);
    expect(res.headers.connection).toBe('close');
  });

  it('invalid UTF-8 is 400 INVALID_BODY', async () => {
    const res = await fetch(`${srv.baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d])
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_BODY');
  });

  it('malformed JSON and non-object bodies are 400 INVALID_BODY', async () => {
    for (const body of ['{"projectId":', '[1,2]', '"text"', '42', 'null', '']) {
      const res = await postJson(`${srv.baseUrl}/api/compile`, body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('INVALID_BODY');
    }
  });

  it('a body length mismatch is 400 INVALID_BODY under core.fetch', async () => {
    const body = JSON.stringify({ projectId: 'a', classes: 'p-4' });
    const res = await core.fetch(new Request('http://x/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length + 5) },
      body
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_BODY');
  });

  it('body failures reach onError with stage "body"', async () => {
    errors.length = 0;
    await postJson(`${srv.baseUrl}/api/compile`, '{bad');
    expect(errors.some((e) => e.stage === 'body')).toBe(true);
  });
});

describe('Unexpected failures', () => {
  it('a throwing request hook does not break the response; a handler failure is 500 INTERNAL with no stack', async () => {
    const errors = [];
    const core = await createCore({
      plugins: [{
        name: 'boom',
        setup(ctx) {
          ctx.addRoute('get', '/explode', () => { throw new Error('secret stack detail'); });
        },
        onError(info) { errors.push(info); }
      }]
    });
    const srv = await listen(core.handler);
    try {
      const res = await fetch(`${srv.baseUrl}/plugins/boom/explode`);
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/json');
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: 'Internal server error.', code: 'INTERNAL' });
      expect(text).not.toContain('secret');
      expect(errors.some((e) => e.stage === 'plugin-route' && e.error.message === 'secret stack detail')).toBe(true);
    } finally {
      await srv.stop();
      await core.close();
    }
  });
});

describe('core.fetch', () => {
  let core;

  beforeAll(async () => {
    core = await createCore();
  });

  afterAll(async () => {
    await core.close();
  });

  it('routes a Request without basePath', async () => {
    const res = await core.fetch(new Request('http://x/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'f1', classes: 'p-4' })
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).css).toContain('.p-4');
    const css = await core.fetch(new Request('http://x/api/css?projectId=f1'));
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
  });

  it('strips basePath and answers 404 outside it', async () => {
    const inside = await core.fetch(new Request('http://x/rw/health'), { basePath: '/rw' });
    expect(inside.status).toBe(200);
    const trailing = await core.fetch(new Request('http://x/rw/health'), { basePath: '/rw/' });
    expect(trailing.status).toBe(200);
    for (const url of ['http://x/health', 'http://x/rwx/health', 'http://x/other/rw/health']) {
      const res = await core.fetch(new Request(url), { basePath: '/rw' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found.', code: 'NOT_FOUND' });
    }
  });

  it('answers CORS preflight like the Node adapter', async () => {
    const corsCore = await createCore({ config: { corsOrigin: 'https://app.example' } });
    try {
      const ok = await corsCore.fetch(new Request('http://x/api/compile', {
        method: 'OPTIONS', headers: { Origin: 'https://app.example' }
      }));
      expect(ok.status).toBe(204);
      expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
      expect(ok.headers.get('vary')).toBe('Origin');
      const denied = await corsCore.fetch(new Request('http://x/api/compile', {
        method: 'OPTIONS', headers: { Origin: 'https://evil.example' }
      }));
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: 'CORS origin not allowed.', code: 'FORBIDDEN' });
    } finally {
      await corsCore.close();
    }
  });
});

describe('Mounted in an Express host', () => {
  it('serves under a prefix, with or without the host parsing JSON first', async () => {
    const core = await createCore();
    const app = express();
    app.use('/plain', core.handler);
    app.use('/parsed', express.json(), core.handler);
    const srv = await listen(app);
    try {
      for (const prefix of ['/plain', '/parsed']) {
        const res = await postJson(`${srv.baseUrl}${prefix}/api/compile`, { projectId: `m${prefix.slice(1)}`, classes: 'p-4' });
        expect(res.status).toBe(200);
        expect((await res.json()).css).toContain('.p-4');
        const health = await fetch(`${srv.baseUrl}${prefix}/health`);
        expect(await health.json()).toEqual({ status: 'ok' });
      }
    } finally {
      await srv.stop();
      await core.close();
    }
  });
});

describe('Plugin routes under both adapters', () => {
  let core;
  let srv;

  beforeAll(async () => {
    core = await createCore({
      config: { maxBodyBytes: 1024 },
      plugins: [{
        name: 'routes',
        setup(ctx) {
          ctx.addRoute('get', '/', () => ({ body: { root: true } }));
          ctx.addRoute('get', '/item/:id', (req) => ({
            body: { id: req.params.id, q: req.query.getAll('q'), h: req.headers.get('x-test'), method: req.method, path: req.path }
          }));
          ctx.addRoute('post', '/echo', async (req) => ({ status: 201, body: { got: await req.json() } }));
          ctx.addRoute('post', '/text', async (req) => ({
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: await req.text()
          }));
          ctx.addRoute('get', '/fail', () => ({ status: 418, body: { error: 'Teapot.' } }));
          ctx.addRoute('get', '/empty', () => undefined);
        }
      }]
    });
    srv = await listen(core.handler);
  });

  afterAll(async () => {
    await srv.stop();
    await core.close();
  });

  const viaBoth = async (path, init) => [
    await fetch(`${srv.baseUrl}${path}`, init),
    await core.fetch(new Request(`http://x${path}`, init))
  ];

  it('route params, query and headers reach the neutral request', async () => {
    for (const res of await viaBoth('/plugins/routes/item/a%20b?q=1&q=2', { headers: { 'X-Test': 'yes' } })) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: 'a b', q: ['1', '2'], h: 'yes', method: 'GET', path: '/plugins/routes/item/a%20b'
      });
    }
  });

  it('the route "/" is served at /plugins/<name>', async () => {
    for (const res of await viaBoth('/plugins/routes')) {
      expect(await res.json()).toEqual({ root: true });
    }
  });

  it('json() and text() read the body, capped at maxBodyBytes', async () => {
    const init = () => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1 }) });
    for (const res of [await fetch(`${srv.baseUrl}/plugins/routes/echo`, init()), await core.fetch(new Request('http://x/plugins/routes/echo', init()))]) {
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ got: { a: 1 } });
    }
    const big = { method: 'POST', body: 'y'.repeat(2000) };
    const res = await fetch(`${srv.baseUrl}/plugins/routes/text`, big);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('PAYLOAD_TOO_LARGE');
    const small = await core.fetch(new Request('http://x/plugins/routes/text', { method: 'POST', body: 'hello' }));
    expect(await small.text()).toBe('hello');
  });

  it('error bodies without a code get the envelope code; an empty result is 204', async () => {
    const [nodeRes, fetchRes] = await viaBoth('/plugins/routes/fail');
    for (const res of [nodeRes, fetchRes]) {
      expect(res.status).toBe(418);
      expect((await res.json()).error).toBe('Teapot.');
    }
    for (const res of await viaBoth('/plugins/routes/empty')) {
      expect(res.status).toBe(204);
    }
  });
});

describe('Client identity', () => {
  const ipProbe = (seen) => ({
    name: 'ip-probe',
    onRequestStart(info) { seen.push(info.request.ip); }
  });

  it('under a hop count a spoofed leftmost X-Forwarded-For does not change request.ip', async () => {
    const seen = [];
    const core = await createCore({ config: { trustProxy: 1 }, plugins: [ipProbe(seen)] });
    try {
      await core.fetch(new Request('http://x/health', { headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.9' } }), { ip: '10.0.0.1' });
      expect(seen).toEqual(['203.0.113.9']);
    } finally {
      await core.close();
    }
  });

  it('RW_TRUST_PROXY parses hop counts, booleans and subnet lists', async () => {
    const cases = [
      ['1', '10.0.0.1', '6.6.6.6, 203.0.113.9', '203.0.113.9'],
      ['2', '10.0.0.1', '6.6.6.6, 203.0.113.9', '6.6.6.6'],
      ['true', '10.0.0.1', '6.6.6.6, 203.0.113.9', '6.6.6.6'],
      ['false', '10.0.0.1', '6.6.6.6, 203.0.113.9', '10.0.0.1'],
      ['10.0.0.0/8, 192.168.1.1', '10.0.0.1', '6.6.6.6, 192.168.1.1', '6.6.6.6'],
      ['loopback', '10.0.0.1', '6.6.6.6', '10.0.0.1']
    ];
    for (const [setting, socketIp, xff, expected] of cases) {
      const seen = [];
      const core = await createCore({ config: { trustProxy: setting }, plugins: [ipProbe(seen)] });
      try {
        await core.fetch(new Request('http://x/health', { headers: { 'X-Forwarded-For': xff } }), { ip: socketIp });
        expect([setting, seen[0]]).toEqual([setting, expected]);
      } finally {
        await core.close();
      }
    }
  });

  it('without trustProxy, the socket address is used and X-Forwarded-For ignored', async () => {
    const seen = [];
    const core = await createCore({ plugins: [ipProbe(seen)] });
    const srv = await listen(core.handler);
    try {
      await fetch(`${srv.baseUrl}/health`, { headers: { 'X-Forwarded-For': '6.6.6.6' } });
      expect(seen[0]).toMatch(/127\.0\.0\.1|::1/);
    } finally {
      await srv.stop();
      await core.close();
    }
  });

  it('mounted in an Express host with trust proxy set, plugin hooks see the host-resolved address', async () => {
    const seen = [];
    const core = await createCore({ plugins: [ipProbe(seen)] });
    const app = express();
    app.set('trust proxy', 'loopback');
    app.use('/rw', core.handler);
    const srv = await listen(app);
    try {
      await fetch(`${srv.baseUrl}/rw/health`, { headers: { 'X-Forwarded-For': '198.51.100.7' } });
      expect(seen).toEqual(['198.51.100.7']);
    } finally {
      await srv.stop();
      await core.close();
    }
  });

  it('core.fetch without ip reports "unknown"', async () => {
    const seen = [];
    const core = await createCore({ plugins: [ipProbe(seen)] });
    try {
      await core.fetch(new Request('http://x/health'));
      expect(seen).toEqual(['unknown']);
    } finally {
      await core.close();
    }
  });
});
