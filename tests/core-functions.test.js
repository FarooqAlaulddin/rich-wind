import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCore, RichWindError } from '../services/index.js';

async function startCore(options = {}) {
  const core = await createCore({ config: { rateLimitDisabled: true }, ...options });
  const server = core.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await core.close();
  };
  return { core, baseUrl, stop };
}

const postJson = (baseUrl, path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

async function expectSameFailure(directCall, response) {
  const envelope = await response.json();
  let thrown;
  try {
    await directCall();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(RichWindError);
  expect(thrown).toBeInstanceOf(Error);
  expect(thrown.name).toBe('RichWindError');
  expect({ status: thrown.status, code: thrown.code, error: thrown.message })
    .toEqual({ status: response.status, code: envelope.code, error: envelope.error });
}

describe('Core functions match their routes', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await startCore();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('compile returns the body of the 200 compile response', async () => {
    const input = { projectId: 'fn-compile', pageId: 'home', classes: 'p-4 text-red-500 not-a-class' };
    const direct = await ctx.core.compile(input);
    const res = await postJson(ctx.baseUrl, '/api/compile', input);
    expect(res.status).toBe(200);
    const body = await res.json();
    // The HTTP call is the second compile of the same class set, so it is a cache hit.
    expect(direct.cached).toBe(false);
    expect(body.cached).toBe(true);
    expect({ ...body, cached: false }).toEqual(direct);
    expect(direct).toMatchObject({
      success: true, projectId: 'fn-compile', pageId: 'home', bundle: 'full',
      rejected: ['not-a-class']
    });
  });

  it('getCss returns the CSS and the ETag the route sends', async () => {
    await ctx.core.compile({ projectId: 'fn-css', pageId: 'p1', classes: 'm-2' });
    const direct = await ctx.core.getCss({ projectId: 'fn-css', pageId: 'p1' });
    const res = await fetch(`${ctx.baseUrl}/api/css?projectId=fn-css&pageId=p1`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(direct.css);
    expect(res.headers.get('etag')).toBe(`"${direct.etag}"`);
    expect(direct.css).toContain('.m-2');
  });

  it('getProjectCss returns the CSS and the ETag the route sends', async () => {
    await ctx.core.compile({ projectId: 'fn-proj', pageId: 'a', classes: 'p-1' });
    await ctx.core.compile({ projectId: 'fn-proj', pageId: 'b', classes: 'p-2' });
    const direct = await ctx.core.getProjectCss({ projectId: 'fn-proj' });
    const res = await fetch(`${ctx.baseUrl}/api/projects/fn-proj/css`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(direct.css);
    expect(res.headers.get('etag')).toBe(`"${direct.etag}"`);
    expect(direct.css).toContain('.p-1');
    expect(direct.css).toContain('.p-2');
  });

  it('suggest returns the body of the 200 suggest response', async () => {
    await ctx.core.compile({ projectId: 'fn-suggest', classes: 'text-red-500 text-blue-500' });
    const input = { projectId: 'fn-suggest', prefix: 'text-', limit: 5 };
    const direct = await ctx.core.suggest(input);
    const res = await postJson(ctx.baseUrl, '/api/suggest', input);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(direct);
    expect(direct.suggestions).toEqual(expect.arrayContaining(['text-red-500', 'text-blue-500']));
  });

  it('invalidate returns the body of the 200 invalidate response', async () => {
    await ctx.core.compile({ projectId: 'fn-inv', pageId: 'p1', classes: 'p-4' });
    const direct = await ctx.core.invalidate({ projectId: 'fn-inv', pageId: 'p1' });
    expect(direct).toEqual({ invalidated: true, projectId: 'fn-inv', pageId: 'p1' });
    await expect(ctx.core.getCss({ projectId: 'fn-inv', pageId: 'p1' }))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    await ctx.core.compile({ projectId: 'fn-inv', pageId: 'p1', classes: 'p-4' });
    const res = await postJson(ctx.baseUrl, '/api/invalidate', { projectId: 'fn-inv' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invalidated: true, projectId: 'fn-inv' });
    expect(await ctx.core.invalidate({ projectId: 'fn-inv' }))
      .toEqual({ invalidated: true, projectId: 'fn-inv' });
  });

  it('compile failures carry the HTTP status, code and message', async () => {
    const cases = [
      {},
      { projectId: 'bad id!' },
      { projectId: 'ok', pageId: 'bad/page' },
      { projectId: 'ok' },
      { projectId: 'ok', html: 'x'.repeat(60000) },
      { projectId: 'ok', classes: 'not-a-real-class another-fake' }
    ];
    for (const input of cases) {
      await expectSameFailure(
        () => ctx.core.compile(input),
        await postJson(ctx.baseUrl, '/api/compile', input)
      );
    }
  });

  it('getCss and getProjectCss failures carry the HTTP status, code and message', async () => {
    await expectSameFailure(() => ctx.core.getCss({}), await fetch(`${ctx.baseUrl}/api/css`));
    await expectSameFailure(
      () => ctx.core.getCss({ projectId: 'bad id!' }),
      await fetch(`${ctx.baseUrl}/api/css?projectId=bad%20id!`)
    );
    await expectSameFailure(
      () => ctx.core.getCss({ projectId: 'never-compiled' }),
      await fetch(`${ctx.baseUrl}/api/css?projectId=never-compiled`)
    );
    await expectSameFailure(
      () => ctx.core.getProjectCss({ projectId: 'bad id!' }),
      await fetch(`${ctx.baseUrl}/api/projects/bad%20id!/css`)
    );
    await expectSameFailure(
      () => ctx.core.getProjectCss({ projectId: 'never-compiled' }),
      await fetch(`${ctx.baseUrl}/api/projects/never-compiled/css`)
    );
  });

  it('invalidate and suggest failures carry the HTTP status, code and message', async () => {
    for (const input of [{}, { projectId: 'bad id!' }, { projectId: 'ok', pageId: 'bad/page' }]) {
      await expectSameFailure(
        () => ctx.core.invalidate(input),
        await postJson(ctx.baseUrl, '/api/invalidate', input)
      );
    }
    await expectSameFailure(
      () => ctx.core.suggest({ projectId: 'bad id!' }),
      await postJson(ctx.baseUrl, '/api/suggest', { projectId: 'bad id!' })
    );
  });

  it('functions reject input that is not an object', async () => {
    for (const fn of ['compile', 'getCss', 'getProjectCss', 'invalidate', 'suggest']) {
      await expect(ctx.core[fn]('projectId=a')).rejects.toMatchObject({
        name: 'RichWindError', status: 400, code: 'INVALID_BODY'
      });
    }
  });
});

describe('Core functions on a reader replica', () => {
  it('compile and invalidate fail like the routes', async () => {
    const ctx = await startCore({ config: { nodeRole: 'reader', rateLimitDisabled: true } });
    try {
      const compileInput = { projectId: 'ro', classes: 'p-4' };
      await expectSameFailure(
        () => ctx.core.compile(compileInput),
        await postJson(ctx.baseUrl, '/api/compile', compileInput)
      );
      await expectSameFailure(
        () => ctx.core.invalidate({ projectId: 'ro' }),
        await postJson(ctx.baseUrl, '/api/invalidate', { projectId: 'ro' })
      );
    } finally {
      await ctx.stop();
    }
  });
});

describe('Guard applies to HTTP only', () => {
  it('a guard that blocks every HTTP request does not block direct calls', async () => {
    const guardCalls = [];
    const plugin = {
      name: 'block-all',
      guard(request) {
        guardCalls.push(request.path);
        return { blocked: true, status: 403, error: 'Blocked by test guard.' };
      }
    };
    const ctx = await startCore({ plugins: [plugin] });
    try {
      const res = await postJson(ctx.baseUrl, '/api/compile', { projectId: 'g', classes: 'p-4' });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Blocked by test guard.', code: 'FORBIDDEN' });
      expect(guardCalls).toEqual(['/api/compile']);

      const result = await ctx.core.compile({ projectId: 'g', classes: 'p-4' });
      expect(result.success).toBe(true);
      expect((await ctx.core.getCss({ projectId: 'g' })).css).toContain('.p-4');
      expect((await ctx.core.suggest({ projectId: 'g' })).suggestions).toContain('p-4');
      expect(guardCalls).toEqual(['/api/compile']);
    } finally {
      await ctx.stop();
    }
  });
});

describe('ctx.compile shares core.compile', () => {
  it('returns what core.compile returns', async () => {
    let pluginCtx;
    const core = await createCore({
      plugins: [{ name: 'probe', setup(ctx) { pluginCtx = ctx; } }]
    });
    try {
      const input = { projectId: 'shared', pageId: 'p1', classes: 'p-4 bogus-class' };
      const fromPlugin = await pluginCtx.compile(input);
      const fromHost = await core.compile(input);
      expect(fromPlugin.cached).toBe(false);
      expect(fromHost.cached).toBe(true);
      expect({ ...fromHost, cached: false }).toEqual(fromPlugin);

      // pageId defaults to "default" for both callers
      const defaulted = await pluginCtx.compile({ projectId: 'shared', classes: 'p-4' });
      expect(defaulted.pageId).toBe('default');

      for (const bad of [{}, { projectId: 'bad id!' }, { projectId: 'ok' }]) {
        let pluginErr;
        let hostErr;
        try { await pluginCtx.compile(bad); } catch (err) { pluginErr = err; }
        try { await core.compile(bad); } catch (err) { hostErr = err; }
        expect(pluginErr).toBeInstanceOf(RichWindError);
        expect({ status: pluginErr.status, code: pluginErr.code, message: pluginErr.message })
          .toEqual({ status: hostErr.status, code: hostErr.code, message: hostErr.message });
      }
    } finally {
      await core.close();
    }
  });

  it('exceeding the chain depth throws 500 INTERNAL and reports PLUGIN_COMPILE_CHAIN_LIMIT', async () => {
    let pluginCtx;
    let chainError = null;
    const errors = [];
    const plugin = {
      name: 'deep-chain',
      deferHooks: ['onCompileResult'],
      setup(ctx) { pluginCtx = ctx; },
      async onCompileResult(info) {
        if (info.pageId !== 'start') return;
        try {
          await pluginCtx.compile({ projectId: info.projectId, pageId: 'next', classes: 'm-1' });
        } catch (err) {
          chainError = err;
        }
      },
      onError(info) {
        errors.push(info);
      }
    };
    const core = await createCore({ plugins: [plugin], maxPluginCompileChainDepth: 1 });
    try {
      await pluginCtx.compile({ projectId: 'chain', pageId: 'start', classes: 'p-4' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(chainError).toBeInstanceOf(RichWindError);
      expect(chainError).toMatchObject({
        status: 500, code: 'INTERNAL', message: 'Plugin compile chain depth exceeded.'
      });
      expect(errors.some((e) => e.code === 'PLUGIN_COMPILE_CHAIN_LIMIT')).toBe(true);
      expect(pluginCtx.getPageIds('chain')).not.toContain('next');
    } finally {
      await core.close();
    }
  });
});
