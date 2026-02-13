import { describe, it, expect } from 'vitest';
import { createCore } from '../services/index.js';

describe('Plugin hooks', () => {
  it('invokes compile, cache, and suggest hooks safely', async () => {
    const events = [];
    const plugin = {
      name: 'collector',
      onRequestStart: (ctx) => events.push({ type: 'request', action: ctx.action }),
      onResponseSent: (ctx) => events.push({ type: 'response', status: ctx.status }),
      onCompileStart: (ctx) => events.push({ type: 'start', bundle: ctx.bundle }),
      onCompileResult: (ctx) => events.push({ type: 'result', cached: ctx.cached }),
      onCacheMiss: (ctx) => events.push({ type: 'miss', source: ctx.source }),
      onCacheHit: (ctx) => events.push({ type: 'hit', source: ctx.source }),
      onSuggest: (ctx) => events.push({ type: 'suggest', prefix: ctx.prefix })
    };

    const app = createCore({ plugins: [plugin] });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'plug-proj',
        pageId: 'page1',
        classes: 'bg-red-500'
      })
    });

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'plug-proj',
        pageId: 'page1',
        classes: 'bg-red-500'
      })
    });

    await fetch(`${baseUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'plug-proj',
        prefix: 'bg-',
        limit: 5
      })
    });

    await new Promise((resolve) => server.close(resolve));

    const hasStart = events.some((e) => e.type === 'start');
    const hasResult = events.some((e) => e.type === 'result');
    const hasMiss = events.some((e) => e.type === 'miss');
    const hasHit = events.some((e) => e.type === 'hit');
    const hasSuggest = events.some((e) => e.type === 'suggest');
    const hasRequest = events.some((e) => e.type === 'request');
    const hasResponse = events.some((e) => e.type === 'response');

    expect(hasStart).toBe(true);
    expect(hasResult).toBe(true);
    expect(hasMiss).toBe(true);
    expect(hasHit).toBe(true);
    expect(hasSuggest).toBe(true);
    expect(hasRequest).toBe(true);
    expect(hasResponse).toBe(true);
  });

  it('does not crash when a plugin throws and calls onError', async () => {
    const errors = [];
    const plugin = {
      name: 'faulty',
      onCompileResult: () => {
        throw new Error('boom');
      },
      onError: (info) => errors.push(info)
    };

    const app = createCore({ plugins: [plugin] });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'faulty-proj',
        pageId: 'page1',
        classes: 'text-red-500'
      })
    });

    expect(response.status).toBe(200);
    await new Promise((resolve) => server.close(resolve));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].hook).toBe('onCompileResult');
  });

  it('timeouts slow plugins without blocking response', async () => {
    const errors = [];
    const plugin = {
      name: 'slow',
      timeoutMs: 20,
      onCompileStart: () => new Promise((resolve) => setTimeout(resolve, 80)),
      onError: (info) => errors.push(info),
    };

    const app = createCore({ plugins: [plugin] });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const start = Date.now();
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'timeout-proj',
        pageId: 'page1',
        classes: 'text-red-500',
      }),
    });

    const elapsed = Date.now() - start;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(200);

    await new Promise((resolve) => setTimeout(resolve, 30));
    await new Promise((resolve) => server.close(resolve));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].timedOut).toBe(true);
  });

  it('deferred hooks do not block responses', async () => {
    const events = [];
    const plugin = {
      name: 'deferred',
      defer: true,
      onCompileResult: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            events.push('done');
            resolve();
          }, 80)
        ),
    };

    const app = createCore({ plugins: [plugin] });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    const start = Date.now();
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'defer-proj',
        pageId: 'page1',
        classes: 'text-red-500',
      }),
    });

    const elapsed = Date.now() - start;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(200);

    await new Promise((resolve) => setTimeout(resolve, 120));
    await new Promise((resolve) => server.close(resolve));

    expect(events).toContain('done');
  });
});
