import { describe, it, expect, afterEach } from 'vitest';
import { createCore, RichWindError } from '../services/index.js';

// A plugin whose awaited onCompileResult blocks compiles of pageId "hold" until
// release() is called, so a test can keep a compile slot occupied.
function createGate() {
  let release;
  let entered;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const plugin = {
    name: 'gate',
    async onCompileResult(info) {
      if (info.pageId !== 'hold') return;
      entered();
      await releasePromise;
    }
  };
  return { plugin, release, entered: enteredPromise };
}

const postCompile = (core, body) => core.fetch(new Request('http://localhost/api/compile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
}));

describe('Compile concurrency cap', () => {
  let core;

  afterEach(async () => {
    await core?.close();
    core = null;
  });

  it('sheds a compile with 503 SERVER_BUSY when every slot is in use', async () => {
    const gate = createGate();
    core = await createCore({ plugins: [gate.plugin], config: { maxConcurrentCompiles: 1 } });

    const held = core.compile({ projectId: 'busy', pageId: 'hold', classes: 'p-4' });
    await gate.entered;

    await expect(core.compile({ projectId: 'busy', pageId: 'other', classes: 'm-2' }))
      .rejects.toMatchObject({ name: 'RichWindError', status: 503, code: 'SERVER_BUSY' });

    const res = await postCompile(core, { projectId: 'busy', pageId: 'other', classes: 'm-2' });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('1');
    expect(await res.json()).toEqual({ error: 'All compile slots are in use. Retry shortly.', code: 'SERVER_BUSY' });

    gate.release();
    expect((await held).success).toBe(true);

    // The slot is free again once the held compile finishes.
    const after = await core.compile({ projectId: 'busy', pageId: 'other', classes: 'm-2' });
    expect(after.success).toBe(true);
  });

  it('does not take a slot for invalid input', async () => {
    const gate = createGate();
    core = await createCore({ plugins: [gate.plugin], config: { maxConcurrentCompiles: 1 } });
    const held = core.compile({ projectId: 'busy', pageId: 'hold', classes: 'p-4' });
    await gate.entered;
    await expect(core.compile({ projectId: 'bad id!' }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_ID' });
    gate.release();
    await held;
  });

  it('releases the slot when a compile fails', async () => {
    core = await createCore({ config: { maxConcurrentCompiles: 1 } });
    await expect(core.compile({ projectId: 'fail', classes: 'not-a-real-class' }))
      .rejects.toBeInstanceOf(RichWindError);
    const ok = await core.compile({ projectId: 'fail', classes: 'p-4' });
    expect(ok.success).toBe(true);
  });

  it('lets ctx.compile from an awaited hook run inside the parent slot', async () => {
    let pluginCtx;
    let nested = null;
    const plugin = {
      name: 'nested',
      setup(ctx) { pluginCtx = ctx; },
      async onCompileResult(info) {
        if (info.pageId !== 'parent') return;
        nested = await pluginCtx.compile({ projectId: info.projectId, pageId: 'child', classes: 'm-1' });
      }
    };
    core = await createCore({ plugins: [plugin], config: { maxConcurrentCompiles: 1 } });

    const parent = await core.compile({ projectId: 'nest', pageId: 'parent', classes: 'p-4' });
    expect(parent.success).toBe(true);
    expect(nested).toMatchObject({ success: true, pageId: 'child' });
    expect(pluginCtx.getPageIds('nest')).toContain('child');
  });

  it('sheds ctx.compile from a deferred hook while the parent holds the only slot', async () => {
    const gate = createGate();
    let pluginCtx;
    let deferredError = null;
    const deferred = {
      name: 'deferred-compiler',
      deferHooks: ['onCompileResult'],
      setup(ctx) { pluginCtx = ctx; },
      async onCompileResult(info) {
        if (info.pageId !== 'hold') return;
        try {
          await pluginCtx.compile({ projectId: info.projectId, pageId: 'promoted', classes: 'm-1' });
        } catch (err) {
          deferredError = err;
        }
      }
    };
    core = await createCore({ plugins: [deferred, gate.plugin], config: { maxConcurrentCompiles: 1 } });

    const held = core.compile({ projectId: 'defer', pageId: 'hold', classes: 'p-4' });
    await gate.entered;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(deferredError).toBeInstanceOf(RichWindError);
    expect(deferredError).toMatchObject({ status: 503, code: 'SERVER_BUSY' });
    expect(pluginCtx.getPageIds('defer')).not.toContain('promoted');

    gate.release();
    await held;
  });

  it('sheds ctx.compile from a plugin route with 503 and Retry-After', async () => {
    const gate = createGate();
    const routePlugin = {
      name: 'route-compiler',
      setup(ctx) {
        ctx.addRoute('post', '/compile', async () => ({
          body: await ctx.compile({ projectId: 'route', pageId: 'r', classes: 'm-1' })
        }));
      }
    };
    core = await createCore({ plugins: [gate.plugin, routePlugin], config: { maxConcurrentCompiles: 1 } });

    const held = core.compile({ projectId: 'route', pageId: 'hold', classes: 'p-4' });
    await gate.entered;

    const res = await core.fetch(new Request('http://localhost/plugins/route-compiler/compile', { method: 'POST' }));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('1');
    expect((await res.json()).code).toBe('SERVER_BUSY');

    gate.release();
    await held;

    const ok = await core.fetch(new Request('http://localhost/plugins/route-compiler/compile', { method: 'POST' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).success).toBe(true);
  });

  it('defaults to 8 slots and reads RW_MAX_CONCURRENT_COMPILES', async () => {
    const gates = Array.from({ length: 9 }, () => createGate());
    const plugin = {
      name: 'multi-gate',
      async onCompileResult(info) {
        const index = Number(info.pageId.replace('hold-', ''));
        if (!Number.isInteger(index)) return;
        await gates[index].plugin.onCompileResult({ pageId: 'hold' });
      }
    };
    core = await createCore({ plugins: [plugin] });
    const held = [];
    for (let i = 0; i < 8; i++) {
      held.push(core.compile({ projectId: 'eight', pageId: `hold-${i}`, classes: 'p-4' }));
    }
    await Promise.all(gates.slice(0, 8).map((g) => g.entered));
    await expect(core.compile({ projectId: 'eight', pageId: 'ninth', classes: 'p-4' }))
      .rejects.toMatchObject({ code: 'SERVER_BUSY' });
    gates.forEach((g) => g.release());
    await Promise.all(held);
    await core.close();

    process.env.RW_MAX_CONCURRENT_COMPILES = '2';
    try {
      const gate = createGate();
      core = await createCore({ plugins: [gate.plugin] });
      const first = core.compile({ projectId: 'env', pageId: 'hold', classes: 'p-4' });
      await gate.entered;
      const second = await core.compile({ projectId: 'env', pageId: 'free', classes: 'p-4' });
      expect(second.success).toBe(true);
      gate.release();
      await first;
    } finally {
      delete process.env.RW_MAX_CONCURRENT_COMPILES;
    }
  });
});
