import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPlugins } from './loader.js';

const here = dirname(fileURLToPath(import.meta.url));
// Not plugins: cache-store-fs is passed to createCore as `cacheStore`.
const NOT_PLUGINS = new Set(['cache-store-fs']);

describe('loadPlugins', () => {
  it('loads every plugin directory with its factory called without arguments', async () => {
    const dirs = readdirSync(here, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(here, e.name, 'index.js')))
      .map((e) => e.name)
      .filter((name) => !NOT_PLUGINS.has(name))
      .sort();
    const plugins = await loadPlugins();
    expect(plugins.map((p) => p.name).sort()).toEqual(dirs);
  });

  it('skips a module that is not a plugin', async () => {
    const { createFsCacheStore } = await import('./cache-store-fs/index.js');
    expect(createFsCacheStore({ maxAgeDays: 0 }).name).toBeUndefined();
    expect((await loadPlugins()).every((p) => typeof p.name === 'string')).toBe(true);
  });
});
