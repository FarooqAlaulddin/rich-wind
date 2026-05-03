/**
 * File-System Cache Store
 *
 * Persists compiled CSS artifacts to disk so they survive server restarts.
 * Drop-in for the `cacheStore` option of `createCore`.
 *
 * Artifacts are stored WITHOUT expiresAt — when the core reads them it
 * falls back to `now + cacheTtlMs`, so disk-stored CSS is always treated
 * as fresh. The in-memory TTL still controls how long pages stay in RAM.
 *
 * Directory layout:
 *   <dir>/pages/<projectId>/<pageId>_<bundle>.json   — compiled page CSS
 *   <dir>/projects/<projectId>/<bundle>.json          — compiled project CSS
 *   <dir>/plugins/<pluginName>/<key>.json             — plugin-specific data
 *
 * Usage:
 *   import { createFsCacheStore } from 'rich-wind/plugins/cache-store-fs/index.js';
 *   createCore({ cacheStore: createFsCacheStore({ dir: './rw-cache' }) });
 */

import {
  readFile,
  writeFile,
  mkdir,
  rename,
  unlink,
  rm,
  readdir,
} from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

function encodeSegment(str) {
  return encodeURIComponent(String(str)).replace(/\*/g, '%2A');
}

function decodeSafe(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

async function readJson(p) {
  try {
    const raw = await readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch { return null; }
}

async function writeJsonAtomic(p, data) {
  const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
  await mkdir(p.slice(0, p.lastIndexOf('/')), { recursive: true });
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, p);
}

async function deleteFile(p) {
  try { await unlink(p); } catch { /* ignore — file may not exist */ }
}

export function createFsCacheStore(options = {}) {
  const dir = options.dir || './rw-cache';

  const pagePath = (projectId, pageId, bundle) =>
    join(dir, 'pages', encodeSegment(projectId), `${encodeSegment(pageId)}_${encodeSegment(bundle)}.json`);

  const projectPath = (projectId, bundle) =>
    join(dir, 'projects', encodeSegment(projectId), `${encodeSegment(bundle)}.json`);

  const pluginPath = (pluginName, key) =>
    join(dir, 'plugins', encodeSegment(pluginName), `${encodeSegment(key)}.json`);

  const pluginDir = (pluginName) =>
    join(dir, 'plugins', encodeSegment(pluginName));

  return {
    // Page artifacts
    async readPageArtifact({ projectId, pageId, bundle }) {
      const data = await readJson(pagePath(projectId, pageId, bundle));
      if (!data || typeof data.css !== 'string') return null;
      // Return without expiresAt so the core treats it as fresh
      return { css: data.css, hash: data.hash || null, classes: data.classes || null };
    },

    async upsertPageArtifact({ projectId, pageId, bundle, css, hash, classes }) {
      await writeJsonAtomic(pagePath(projectId, pageId, bundle), { css, hash, classes });
    },

    async deletePageArtifact({ projectId, pageId, bundle }) {
      await deleteFile(pagePath(projectId, pageId, bundle));
    },

    async deleteProjectPageArtifacts({ projectId }) {
      const pagesDir = join(dir, 'pages', encodeSegment(projectId));
      try {
        await rm(pagesDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    },

    // Project artifacts
    async readProjectArtifact({ projectId, bundle }) {
      const data = await readJson(projectPath(projectId, bundle));
      if (!data || typeof data.css !== 'string') return null;
      return { css: data.css, hash: data.hash || null };
    },

    async upsertProjectArtifact({ projectId, bundle, css, hash }) {
      await writeJsonAtomic(projectPath(projectId, bundle), { css, hash });
    },

    async deleteProjectArtifact({ projectId, bundle }) {
      await deleteFile(projectPath(projectId, bundle));
    },

    // Plugin data
    async readPluginData({ pluginName, key }) {
      const data = await readJson(pluginPath(pluginName, key));
      return data !== null ? data : null;
    },

    async writePluginData({ pluginName, key, value }) {
      await writeJsonAtomic(pluginPath(pluginName, key), value);
    },

    async deletePluginData({ pluginName, key }) {
      await deleteFile(pluginPath(pluginName, key));
    },

    async listPluginData({ pluginName, prefix = '' }) {
      const d = pluginDir(pluginName);
      try {
        const files = await readdir(d);
        return files
          .filter(f => f.endsWith('.json'))
          .map(f => decodeSafe(basename(f, '.json')))
          .filter(key => !prefix || key.startsWith(prefix));
      } catch { return []; }
    },
  };
}

export default createFsCacheStore;
