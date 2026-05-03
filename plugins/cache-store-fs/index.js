/**
 * File-System Cache Store
 *
 * Persists compiled CSS artifacts to disk so they survive server restarts.
 * Drop-in for the `cacheStore` option of `createCore`.
 *
 * Safety on public servers:
 *   - maxPageArtifacts caps how many page CSS files exist on disk.
 *     Once hit, new compiles still work in memory; they just don't persist.
 *   - maxAgeDays deletes files not touched since N days on startup,
 *     freeing space and pruning abandoned projects automatically.
 *
 * Artifacts are stored WITHOUT expiresAt — when the core reads them back it
 * falls back to now + cacheTtlMs, so disk-stored CSS is always treated as
 * fresh. The in-memory TTL controls how long pages stay in RAM.
 *
 * Directory layout:
 *   <dir>/pages/<projectId>/<pageId>_<bundle>.json   — compiled page CSS
 *   <dir>/projects/<projectId>/<bundle>.json          — compiled project CSS
 *   <dir>/plugins/<pluginName>/<key>.json             — plugin data
 *
 * Options:
 *   dir              — root directory (default: './rw-cache')
 *   maxPageArtifacts — max page artifact files on disk (default: 5000)
 *   maxAgeDays       — delete files older than this on startup (default: 30, 0 = off)
 */

import {
  readFile, writeFile, mkdir, rename, unlink, rm, readdir, stat,
} from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';

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
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

async function writeJsonAtomic(p, data) {
  const dir = p.slice(0, p.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, p);
}

async function deleteFile(p) {
  try { await unlink(p); } catch { /* ignore */ }
}

// Walk a 2-level directory tree and call fn(filepath, mtime) for every .json file
async function walkJsonFiles(root, fn) {
  let entries;
  try { entries = await readdir(root); } catch { return; }
  await Promise.all(entries.map(async (entry) => {
    const sub = join(root, entry);
    let subEntries;
    try { subEntries = await readdir(sub); } catch { return; }
    await Promise.all(subEntries.map(async (file) => {
      if (!file.endsWith('.json')) return;
      const fp = join(sub, file);
      try {
        const s = await stat(fp);
        await fn(fp, s.mtimeMs);
      } catch { /* ignore */ }
    }));
  }));
}

export function createFsCacheStore(options = {}) {
  const dir = options.dir || './rw-cache';
  const maxPageArtifacts = options.maxPageArtifacts ?? 5000;
  const maxAgeDays = options.maxAgeDays ?? 30;

  // In-memory count of page artifact files on disk (prevents disk exhaustion)
  let pageArtifactCount = 0;
  let countReady = false;

  const pagesRoot = join(dir, 'pages');

  // Initialize: count existing files and evict old ones. Runs async on creation.
  const initPromise = (async () => {
    let count = 0;
    const cutoff = maxAgeDays > 0 ? Date.now() - maxAgeDays * 86400 * 1000 : 0;
    await walkJsonFiles(pagesRoot, async (fp, mtime) => {
      if (cutoff && mtime < cutoff) {
        await deleteFile(fp);
      } else {
        count += 1;
      }
    });
    pageArtifactCount = count;
    countReady = true;
  })().catch(() => { countReady = true; });

  const pagePath = (projectId, pageId, bundle) =>
    join(pagesRoot, encodeSegment(projectId), `${encodeSegment(pageId)}_${encodeSegment(bundle)}.json`);

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
      return { css: data.css, hash: data.hash || null, classes: data.classes || null };
    },

    async upsertPageArtifact({ projectId, pageId, bundle, css, hash, classes }) {
      await initPromise;
      // Check whether this file already exists (update, not new entry)
      const p = pagePath(projectId, pageId, bundle);
      let isNew = true;
      try { await stat(p); isNew = false; } catch { /* doesn't exist → new */ }

      if (isNew && pageArtifactCount >= maxPageArtifacts) {
        // Cap reached — compile still served from in-memory cache, just not persisted
        return;
      }
      await writeJsonAtomic(p, { css, hash, classes });
      if (isNew) pageArtifactCount += 1;
    },

    async deletePageArtifact({ projectId, pageId, bundle }) {
      const p = pagePath(projectId, pageId, bundle);
      let existed = false;
      try { await stat(p); existed = true; } catch { /* already gone */ }
      await deleteFile(p);
      if (existed) pageArtifactCount = Math.max(0, pageArtifactCount - 1);
    },

    async deleteProjectPageArtifacts({ projectId }) {
      const projectPagesDir = join(pagesRoot, encodeSegment(projectId));
      let count = 0;
      try {
        const files = await readdir(projectPagesDir);
        count = files.filter(f => f.endsWith('.json')).length;
      } catch { /* ignore */ }
      try { await rm(projectPagesDir, { recursive: true, force: true }); } catch { /* ignore */ }
      pageArtifactCount = Math.max(0, pageArtifactCount - count);
    },

    // Project artifacts (shared bundles — not page-specific, not capped separately)
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

    // Plugin data (auto-promote state, etc.)
    async readPluginData({ pluginName, key }) {
      return readJson(pluginPath(pluginName, key));
    },

    async writePluginData({ pluginName, key, value }) {
      await writeJsonAtomic(pluginPath(pluginName, key), value);
    },

    async deletePluginData({ pluginName, key }) {
      await deleteFile(pluginPath(pluginName, key));
    },

    async listPluginData({ pluginName, prefix = '' }) {
      try {
        const files = await readdir(pluginDir(pluginName));
        return files
          .filter(f => f.endsWith('.json'))
          .map(f => decodeSafe(basename(f, '.json')))
          .filter(key => !prefix || key.startsWith(prefix));
      } catch { return []; }
    },
  };
}

export default createFsCacheStore;
