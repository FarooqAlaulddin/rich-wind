/**
 * Plugin Loader
 *
 * Auto-discovers plugins by scanning plugins/*\/index.js.
 * Each plugin must default-export a factory function: (options?) => pluginObject
 * The loader calls each factory with no args and returns an array of plugin instances.
 * A module whose factory returns something without a name is not a plugin
 * (cache-store-fs is a `cacheStore`) and is skipped.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadPlugins() {
  const plugins = [];
  const entries = readdirSync(__dirname);

  for (const entry of entries) {
    const entryPath = join(__dirname, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const indexPath = join(entryPath, 'index.js');
    if (!existsSync(indexPath)) continue;

    const mod = await import(indexPath);
    if (typeof mod.default !== 'function') {
      console.warn(`Plugin "${entry}" has no default export factory — skipping`);
      continue;
    }

    const plugin = mod.default();
    if (!plugin || typeof plugin !== 'object' || typeof plugin.name !== 'string') {
      console.warn(`"${entry}" is not a plugin (its factory returns no named plugin) — skipping`);
      continue;
    }
    plugins.push(plugin);
    console.log(`Loaded plugin: ${plugin.name || entry}`);
  }

  return plugins;
}
