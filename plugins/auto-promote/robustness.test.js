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

async function pageCss(core, projectId, pageId, bundle = 'full') {
  try {
    return (await core.getCss({ projectId, pageId, bundle })).css;
  } catch {
    return null; // evicted or invalidated
  }
}

// Every class a live page asked for must be in its page CSS or in the bundle.
async function expectCovered(core, projectId, pageId, classes, bundle = 'full') {
  const css = await pageCss(core, projectId, pageId, bundle);
  if (css === null) return;
  const shared = await bundleCss(core, projectId);
  const missing = classes.filter((cls) => !hasRule(css, cls) && !hasRule(shared, cls));
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

  it('promotes and demotes across page update and delete', async () => {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    core = await createCore({ plugins: [plugin] });
    const stats = async () => (await (await core.fetch(new Request('http://localhost/plugins/auto-promote/stats'))).json()).life;

    await core.compile({ projectId: 'life', pageId: 'a', classes: 'p-4 m-2' });
    await core.compile({ projectId: 'life', pageId: 'b', classes: 'p-4 m-2' });
    await settle(plugin);
    expect((await stats()).promoted).toEqual(['m-2', 'p-4']);

    // Update: b drops m-2.
    await core.compile({ projectId: 'life', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    expect((await stats()).promoted).toEqual(['p-4']);
    await expectCovered(core, 'life', 'a', ['p-4', 'm-2']);
    await expectCovered(core, 'life', 'b', ['p-4']);

    // Delete: b goes away, p-4 is demoted; a still covered, then sheds p-4 from the bundle.
    await core.invalidate({ projectId: 'life', pageId: 'b' });
    await core.compile({ projectId: 'life', pageId: 'a', classes: 'p-4 m-2' });
    await settle(plugin);
    expect((await stats()).promoted).toEqual([]);
    await expectCovered(core, 'life', 'a', ['p-4', 'm-2']);
    await core.compile({ projectId: 'life', pageId: 'a', classes: 'p-4 m-2' });
    await settle(plugin);
    expect(await bundleCss(core, 'life')).toBe('');
    await expectCovered(core, 'life', 'a', ['p-4', 'm-2']);
  });
});


// A cache store holding page artifacts and plugin data, shared across core restarts.
function createPageStore({ bulk = true } = {}) {
  const pages = new Map();
  const data = new Map();
  const key = ({ projectId, pageId, bundle }) => `${projectId}|${pageId}|${bundle || 'full'}`;
  const store = {
    pages,
    data,
    readPageArtifact: (input) => structuredClone(pages.get(key(input)) ?? null),
    upsertPageArtifact: (input) => { pages.set(key(input), structuredClone(input)); },
    deletePageArtifact: (input) => { pages.delete(key(input)); },
    readProjectArtifact: () => null,
    upsertProjectArtifact: () => {},
    deleteProjectArtifact: () => {},
    readPluginData: ({ pluginName, key: k }) => structuredClone(data.get(`${pluginName}|${k}`) ?? null),
    writePluginData: ({ pluginName, key: k, value }) => { data.set(`${pluginName}|${k}`, structuredClone(value)); },
    deletePluginData: ({ pluginName, key: k }) => { data.delete(`${pluginName}|${k}`); }
  };
  if (bulk) {
    store.deleteProjectPageArtifacts = ({ projectId }) => {
      for (const k of pages.keys()) if (k.startsWith(`${projectId}|`)) pages.delete(k);
    };
  }
  return store;
}

function ctxCapture() {
  let ctx = null;
  return { plugin: { name: 'ctx-capture', setup(context) { ctx = context; } }, ctx: () => ctx };
}

async function stats(core, projectId) {
  const all = await (await core.fetch(new Request('http://localhost/plugins/auto-promote/stats'))).json();
  return projectId ? all[projectId] : all;
}

describe('auto-promote with a page store', () => {
  let core;

  afterEach(async () => {
    await core?.close();
    core = null;
  });

  async function boot(store, extra = {}) {
    const plugin = createAutoPromotePlugin({ threshold: 2 });
    const capture = ctxCapture();
    core = await createCore({
      plugins: [...(extra.before || []), plugin, capture.plugin],
      cacheStore: store,
      config: extra.config
    });
    return { plugin, ctx: capture.ctx };
  }

  it('keeps restored votes through the first compile after a restart (#62)', async () => {
    const store = createPageStore();
    let { plugin } = await boot(store);
    await core.compile({ projectId: 'site', pageId: 'a', classes: 'text-red-500 p-4' });
    await core.compile({ projectId: 'site', pageId: 'b', classes: 'text-red-500 p-4' });
    await core.compile({ projectId: 'site', pageId: 'c', classes: 'text-red-500 m-2' });
    await settle(plugin);
    await core.compile({ projectId: 'site', pageId: 'a', classes: 'text-red-500 p-4' }); // stored stripped
    await settle(plugin);
    await core.close();

    ({ plugin } = await boot(store));
    await core.compile({ projectId: 'site', pageId: 'd', classes: 'underline' });
    await settle(plugin);

    expect((await stats(core, 'site')).promoted).toEqual(['p-4', 'text-red-500']);
    await expectCovered(core, 'site', 'a', ['text-red-500', 'p-4']);
    await expectCovered(core, 'site', 'c', ['text-red-500', 'm-2']);
    await core.close();
    core = null;
    const saved = store.data.get('auto-promote|state_v2').projects.site;
    expect(Object.keys(saved.pages).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(saved.served.sort()).toEqual(['p-4', 'text-red-500']);
  });

  it('an evicted page served from the store keeps a class the bundle carried for it', async () => {
    const store = createPageStore();
    const { plugin } = await boot(store, { config: { cacheMaxPages: 2 } });
    await core.compile({ projectId: 'ev', pageId: 'a', classes: 'p-4 m-2' });
    await core.compile({ projectId: 'ev', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    await core.compile({ projectId: 'ev', pageId: 'a', classes: 'p-4 m-2' }); // p-4 stripped from a
    await settle(plugin);
    expect(hasRule(await pageCss(core, 'ev', 'a'), 'p-4')).toBe(false);

    await core.compile({ projectId: 'ev', pageId: 'c', classes: 'flex' }); // evicts a
    await core.compile({ projectId: 'ev', pageId: 'b', classes: 'flex' }); // b drops p-4
    await settle(plugin);

    // a comes back from the store, still without p-4, so the bundle must keep it.
    await expectCovered(core, 'ev', 'a', ['p-4', 'm-2']);
    expect((await stats(core, 'ev')).promoted).toContain('flex');
  });

  it('eviction keeps votes: LRU, ctx.evictPage and ctx.evictProject', async () => {
    const store = createPageStore();
    const { plugin, ctx } = await boot(store, { config: { cacheMaxPages: 3 } });
    await core.compile({ projectId: 'e', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'e', pageId: 'b', classes: 'p-4' });
    await settle(plugin);

    ctx().evictPage('e', 'a');
    await core.compile({ projectId: 'e', pageId: 'c', classes: 'flex' });
    await settle(plugin);
    expect((await stats(core, 'e')).promoted).toEqual(['p-4']);

    ctx().evictProject('e');
    await core.compile({ projectId: 'e', pageId: 'd', classes: 'flex' });
    await settle(plugin);
    expect((await stats(core, 'e')).promoted).toEqual(['flex', 'p-4']);

    for (const id of ['x1', 'x2', 'x3', 'x4']) {
      await core.compile({ projectId: 'other', pageId: id, classes: 'underline' }); // LRU evicts project e
    }
    await core.compile({ projectId: 'e', pageId: 'f', classes: 'rounded' });
    await settle(plugin);
    expect((await stats(core, 'e')).promoted).toEqual(['flex', 'p-4']);
  });

  it('invalidating a page drops its votes; ctx.purgePage does too', async () => {
    const store = createPageStore();
    const { plugin, ctx } = await boot(store);
    for (const id of ['a', 'b', 'c']) await core.compile({ projectId: 'i', pageId: id, classes: 'p-4 m-2' });
    await settle(plugin);
    expect((await stats(core, 'i')).promoted).toEqual(['m-2', 'p-4']);

    await core.invalidate({ projectId: 'i', pageId: 'a' });
    await settle(plugin);
    expect((await stats(core, 'i')).promoted).toEqual(['m-2', 'p-4']);
    await ctx().purgePage('i', 'b');
    await settle(plugin);
    expect((await stats(core, 'i')).promoted).toEqual([]);
    await expectCovered(core, 'i', 'c', ['p-4', 'm-2']);
  });

  it('invalidating a project drops the project; without a bulk page delete its votes stay', async () => {
    const store = createPageStore();
    let { plugin } = await boot(store);
    await core.compile({ projectId: 'gone', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'gone', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    await core.invalidate({ projectId: 'gone' });
    await settle(plugin);
    expect(await stats(core, 'gone')).toBeUndefined();
    await core.close();

    const partial = createPageStore({ bulk: false });
    ({ plugin } = await boot(partial));
    await core.compile({ projectId: 'kept', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'kept', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    await core.invalidate({ projectId: 'kept' });
    await settle(plugin);
    expect((await stats(core, 'kept')).promoted).toEqual(['p-4']);
  });

  it('restores the snapshot when another plugin hydrated a page before setup', async () => {
    const store = createPageStore();
    let { plugin } = await boot(store);
    await core.compile({ projectId: 'w', pageId: 'a', classes: 'p-4' });
    await core.compile({ projectId: 'w', pageId: 'b', classes: 'p-4' });
    await settle(plugin);
    await core.close();

    const warmer = {
      name: 'warmer',
      setup(ctx) {
        ctx.hydratePageArtifact({ projectId: 'w', pageId: 'z', bundle: 'full', css: '.flex{display:flex}', classes: ['flex'], hash: 'h' });
      }
    };
    ({ plugin } = await boot(store, { before: [warmer] }));
    const s = await stats(core, 'w');
    expect(s.promoted).toEqual(['p-4']);
    expect(s.trackedClasses).toBe(2); // p-4 from the snapshot, flex from the hydrated page
  });

  it('randomized compiles, bundles, evictions, invalidations and restarts never lose a style', async () => {
    let seed = 777;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const store = createPageStore();
    const config = { cacheMaxPages: 4 };
    let { plugin } = await boot(store, { config });

    const projects = ['s1', 's2'];
    const pages = ['a', 'b', 'c', 'd', 'e'];
    const asked = new Map(); // "project/page" -> { classes, bundle } of its last compile

    for (let round = 0; round < 40; round++) {
      if (round > 0 && round % 10 === 0) {
        await core.close();
        ({ plugin } = await boot(store, { config }));
      }
      const projectId = pick(projects);
      const pageId = pick(pages);
      const roll = random();
      if (roll < 0.08) {
        await core.invalidate({ projectId, pageId });
        asked.delete(`${projectId}/${pageId}`);
      } else if (roll < 0.1) {
        await core.invalidate({ projectId });
        for (const k of Array.from(asked.keys())) if (k.startsWith(`${projectId}/`)) asked.delete(k);
      } else {
        const classes = POOL.filter(() => random() < 0.4);
        if (classes.length === 0) classes.push(pick(POOL));
        const bundle = random() < 0.3 ? 'utilities' : 'full';
        await core.compile({ projectId, pageId, classes: classes.join(' '), bundle });
        asked.set(`${projectId}/${pageId}`, { classes, bundle });
      }
      await settle(plugin);
      for (const [k, { classes, bundle }] of asked) {
        const [p, id] = k.split('/');
        await expectCovered(core, p, id, classes, bundle);
      }
    }
  });
});
