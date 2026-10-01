import { describe, it, expect, afterEach } from 'vitest';
import { createCore } from '../../services/index.js';

// AP_IMPL lets the same tests run against another build of the plugin.
const { createAutoPromotePlugin } = await import(process.env.AP_IMPL || './index.js');

const POOL = ['p-4', 'm-2', 'text-red-500', 'bg-blue-500', 'font-bold', 'flex', 'hidden', 'underline', 'rounded', 'border'];

function hasRule(css, cls) {
  return new RegExp(`\\.${cls.replace(/[-[\]/:.]/g, '\\$&')}\\s*\\{`).test(css);
}

async function settle(plugin) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (plugin.settled) await plugin.settled();
  else await new Promise((resolve) => setTimeout(resolve, 300));
}

async function bundleCss(core, projectId) {
  const res = await core.fetch(new Request(`http://localhost/plugins/auto-promote/css/${projectId}`));
  return res.text();
}

async function pageCss(core, projectId, pageId) {
  try {
    return (await core.getCss({ projectId, pageId })).css;
  } catch {
    return null; // evicted or invalidated
  }
}

// Every class a live page asked for must be in its page CSS or in the bundle.
async function expectCovered(core, projectId, pageId, classes) {
  const css = await pageCss(core, projectId, pageId);
  if (css === null) return;
  const bundle = await bundleCss(core, projectId);
  const missing = classes.filter((cls) => !hasRule(css, cls) && !hasRule(bundle, cls));
  expect(missing, `${projectId}/${pageId} lost styles`).toEqual([]);
}

// Holds the n-th compile of the synthetic page inside transformCss until released.
function createSyntheticGate(n) {
  let release;
  let entered;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  let seen = 0;
  const plugin = {
    name: 'synthetic-gate',
    async transformCss({ pageId }) {
      if (pageId !== '__auto_promote__') return undefined;
      seen += 1;
      if (seen !== n) return undefined;
      entered();
      await releasePromise;
      return undefined;
    }
  };
  return { plugin, release, entered: enteredPromise };
}

// Keeps a compile slot busy while page "hold" is in its awaited onCompileResult.
function createSlotGate() {
  let release;
  let entered;
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const plugin = {
    name: 'slot-gate',
    async onCompileResult({ pageId }) {
      if (pageId !== 'hold') return;
      entered();
      await releasePromise;
    }
  };
  return { plugin, release, entered: enteredPromise };
}

describe('auto-promote robustness', () => {
  let core;

  afterEach(async () => {
    await core?.close();
    core = null;
  });

  it('never strips a class whose bundle compile failed, and retries on the next compile', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    const gate = createSlotGate();
    core = await createCore({ plugins: [plugin, gate.plugin], config: { maxConcurrentCompiles: 1 } });

    await core.compile({ projectId: 'busy', pageId: 'a', classes: 'p-4 m-2' });
    // Page "hold" tips p-4 over the threshold while holding the only slot, so the
    // deferred bundle compile is shed with SERVER_BUSY.
    const held = core.compile({ projectId: 'busy', pageId: 'hold', classes: 'p-4' });
    await gate.entered;
    await settle(plugin);
    gate.release();
    await held;

    await core.compile({ projectId: 'busy', pageId: 'a', classes: 'p-4 m-2' });
    await expectCovered(core, 'busy', 'a', ['p-4', 'm-2']);

    await settle(plugin);
    await core.compile({ projectId: 'busy', pageId: 'b', classes: 'p-4 flex' });
    await settle(plugin);
    expect(hasRule(await bundleCss(core, 'busy'), 'p-4')).toBe(true);
    await expectCovered(core, 'busy', 'b', ['p-4', 'flex']);
  });

  it('keeps a demoted class in the bundle while a cached page still relies on it', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    core = await createCore({ plugins: [plugin] });

    await core.compile({ projectId: 'demote', pageId: 'a', classes: 'p-4 m-2' });
    await core.compile({ projectId: 'demote', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    // a recompiles with p-4 stripped, then b drops p-4 and demotes it.
    await core.compile({ projectId: 'demote', pageId: 'a', classes: 'p-4 m-2' });
    expect(hasRule(await pageCss(core, 'demote', 'a'), 'p-4')).toBe(false);
    await core.compile({ projectId: 'demote', pageId: 'b', classes: 'flex' });
    await settle(plugin);

    await expectCovered(core, 'demote', 'a', ['p-4', 'm-2']);

    // Once a recompiles, it carries p-4 itself and the bundle can drop it.
    await core.compile({ projectId: 'demote', pageId: 'a', classes: 'p-4 m-2' });
    await settle(plugin);
    await core.compile({ projectId: 'demote', pageId: 'a', classes: 'p-4 m-2' });
    await settle(plugin);
    await expectCovered(core, 'demote', 'a', ['p-4', 'm-2']);
    expect(hasRule(await bundleCss(core, 'demote'), 'p-4')).toBe(false);
  });

  it('a slow bundle compile cannot overwrite a newer one', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    const gate = createSyntheticGate(1);
    core = await createCore({ plugins: [plugin, gate.plugin] });

    await core.compile({ projectId: 'race', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'race', pageId: 'b', classes: 'p-4' });
    await gate.entered; // first bundle compile ({p-4}) is stuck

    await core.compile({ projectId: 'race', pageId: 'a', classes: 'p-4 m-2' });
    await core.compile({ projectId: 'race', pageId: 'b', classes: 'p-4 m-2' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    gate.release();
    await settle(plugin);

    await core.compile({ projectId: 'race', pageId: 'c', classes: 'p-4 m-2 flex' });
    await settle(plugin);
    await expectCovered(core, 'race', 'c', ['p-4', 'm-2', 'flex']);
    const bundle = await bundleCss(core, 'race');
    expect(hasRule(bundle, 'p-4') && hasRule(bundle, 'm-2')).toBe(true);
  });

  it('plugin memory follows the core cache: evicted projects are dropped', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    core = await createCore({ plugins: [plugin], config: { cacheMaxPages: 20 } });

    for (let i = 0; i < 300; i++) {
      await core.compile({ projectId: `proj-${i}`, pageId: 'p', classes: 'p-4 m-2' });
    }
    await settle(plugin);
    const stats = await (await core.fetch(new Request('http://localhost/plugins/auto-promote/stats'))).json();
    expect(Object.keys(stats).length).toBeLessThanOrEqual(21);
  });

  it('the bundle route makes clients revalidate', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    core = await createCore({ plugins: [plugin] });
    const res = await core.fetch(new Request('http://localhost/plugins/auto-promote/css/x'));
    expect(res.headers.get('cache-control')).toMatch(/no-cache/);
    expect(res.headers.get('cache-control')).not.toMatch(/max-age=[1-9]/);
  });

  it('randomized compiles, evictions and invalidations never lose a style', async () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    core = await createCore({ plugins: [plugin], config: { cacheMaxPages: 10 } });

    const projects = ['r1', 'r2', 'r3'];
    const pages = ['a', 'b', 'c', 'd', 'e', 'f'];
    const asked = new Map(); // "project/page" -> classes of its last successful compile

    for (let round = 0; round < 40; round++) {
      const burst = 1 + Math.floor(random() * 4);
      const ops = [];
      for (let i = 0; i < burst; i++) {
        const projectId = pick(projects);
        const pageId = pick(pages);
        if (random() < 0.1) {
          ops.push(core.invalidate({ projectId, pageId }).then(() => asked.delete(`${projectId}/${pageId}`)));
          continue;
        }
        const classes = POOL.filter(() => random() < 0.4);
        if (classes.length === 0) classes.push(pick(POOL));
        ops.push(core.compile({ projectId, pageId, classes: classes.join(' ') })
          .then(() => asked.set(`${projectId}/${pageId}`, classes)));
      }
      await Promise.all(ops);
      await settle(plugin);
      for (const [key, classes] of asked) {
        const [projectId, pageId] = key.split('/');
        await expectCovered(core, projectId, pageId, classes);
      }
    }
  });
});
