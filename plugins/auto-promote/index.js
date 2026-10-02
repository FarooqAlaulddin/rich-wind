/**
 * Auto-Promote Plugin
 *
 * Automatically promotes frequently-used utility classes to a shared base
 * stylesheet. When a class appears on `threshold` or more pages within a
 * project, it gets compiled into a separate "promoted" CSS bundle served
 * via a custom route, and stripped from per-page compiles to reduce
 * duplication.
 *
 * Exercises: setup seeding, transformClasses pipeline, deferred
 * onCompileResult observer, custom routes, and plugin context mutations.
 */

import crypto from 'node:crypto';

const SYNTHETIC_PAGE = '__auto_promote__';
const STORAGE_KEY = 'state_v2';
const PERSIST_DEBOUNCE_MS = 250;
// A page whose compile started but whose result has not arrived yet counts as live
// for this long, so a concurrent reconcile does not drop its votes. Compiles that
// fail before a result (and so never report back) expire after it.
const IN_FLIGHT_GRACE_MS = 30000;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function setMapToObject(map) {
  const out = {};
  for (const [key, set] of map) out[key] = Array.from(set);
  return out;
}

function objectToSetMap(input) {
  const map = new Map();
  if (!isObject(input)) return map;
  for (const [key, list] of Object.entries(input)) {
    if (Array.isArray(list)) map.set(key, new Set(list.filter((item) => typeof item === 'string')));
  }
  return map;
}

function stringSet(list) {
  return new Set(Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []);
}

export function createAutoPromotePlugin(options = {}) {
  const threshold = Number.isFinite(options.threshold) && options.threshold >= 1
    ? options.threshold
    : 5;

  // Per-project state:
  //   pageClasses:  pageId -> classes the page asked for (its votes)
  //   classPages:   className -> pageIds voting for it (inverse of pageClasses)
  //   pageStrips:   pageId -> (class list a compile produced -> classes stripped from it)
  //   promoted:     classes at or over the threshold
  //   served:       classes compiled into `css`, the bundle the CSS route returns
  //   inFlight:     pageId -> { count, at } for compiles between transform and result
  // A class is stripped from a page only when it is both promoted and served, and the
  // bundle keeps every class some live page has stripped, so page CSS plus the bundle
  // always covers what the page asked for. Strips are keyed by the class list the
  // compile produced, because concurrent compiles of one page can be stored in any
  // order; once a page is idle only the entry matching its stored classes is kept.
  const projects = new Map();
  // Serialized bundle refreshes, one chain per project.
  const refreshes = new Map();

  let ctx = null;
  let storage = null;
  let persistTimer = null;

  function getProject(projectId) {
    let project = projects.get(projectId);
    if (!project) {
      project = {
        pageClasses: new Map(),
        classPages: new Map(),
        pageStrips: new Map(),
        promoted: new Set(),
        served: new Set(),
        css: '',
        inFlight: new Map()
      };
      projects.set(projectId, project);
    }
    return project;
  }

  function untrackPage(project, pageId) {
    const classes = project.pageClasses.get(pageId);
    if (classes) {
      for (const cls of classes) {
        const pages = project.classPages.get(cls);
        if (!pages) continue;
        pages.delete(pageId);
        if (pages.size === 0) project.classPages.delete(cls);
      }
    }
    project.pageClasses.delete(pageId);
    project.pageStrips.delete(pageId);
  }

  function trackClasses(project, pageId, classes) {
    const oldSet = project.pageClasses.get(pageId);
    const newSet = new Set(classes);
    if (oldSet) {
      for (const cls of oldSet) {
        if (newSet.has(cls)) continue;
        const pages = project.classPages.get(cls);
        if (!pages) continue;
        pages.delete(pageId);
        if (pages.size === 0) project.classPages.delete(cls);
      }
    }
    for (const cls of newSet) {
      let pages = project.classPages.get(cls);
      if (!pages) {
        pages = new Set();
        project.classPages.set(cls, pages);
      }
      pages.add(pageId);
    }
    project.pageClasses.set(pageId, newSet);
  }

  function recalcPromoted(project) {
    const set = new Set();
    for (const [cls, pages] of project.classPages) {
      if (pages.size >= threshold) set.add(cls);
    }
    project.promoted = set;
  }

  // Classes the bundle must contain: the promoted set plus anything a page still relies on.
  function bundleTarget(project) {
    const target = new Set(project.promoted);
    for (const strips of project.pageStrips.values()) {
      for (const stripped of strips.values()) {
        for (const cls of stripped) target.add(cls);
      }
    }
    return target;
  }

  function expireInFlight(project, now) {
    for (const [pageId, entry] of project.inFlight) {
      if (now - entry.at > IN_FLIGHT_GRACE_MS) project.inFlight.delete(pageId);
    }
    return project.inFlight.size > 0;
  }

  // Drop votes from pages the core no longer holds (LRU eviction, invalidate, expiry),
  // and whole projects the core no longer holds, so plugin memory follows the core cache.
  function reconcile(projectId) {
    const now = Date.now();
    const liveProjects = new Set(ctx.getProjectIds());
    for (const [id, project] of projects) {
      if (liveProjects.has(id) || refreshes.has(id) || expireInFlight(project, now)) continue;
      projects.delete(id);
    }
    const project = projects.get(projectId);
    if (!project) return null;
    expireInFlight(project, now);
    const livePages = new Set([...(ctx.getPageIds(projectId) || []), ...project.inFlight.keys()]);
    for (const pageId of Array.from(project.pageClasses.keys())) {
      if (!livePages.has(pageId)) untrackPage(project, pageId);
    }
    for (const pageId of Array.from(project.pageStrips.keys())) {
      if (!livePages.has(pageId)) project.pageStrips.delete(pageId);
      else if (!project.inFlight.has(pageId)) pruneStrips(projectId, project, pageId);
    }
    return project;
  }

  // Keep only the strip entry that produced the classes the core stored for the page.
  function pruneStrips(projectId, project, pageId) {
    const strips = project.pageStrips.get(pageId);
    if (!strips) return;
    const stored = ctx.getPageClasses(projectId, pageId);
    const kept = stored ? strips.get(stored.join(' ')) : undefined;
    if (kept && kept.size > 0) project.pageStrips.set(pageId, new Map([[stored.join(' '), kept]]));
    else project.pageStrips.delete(pageId);
  }

  async function refresh(projectId) {
    const project = reconcile(projectId);
    if (!project) return;
    const before = project.promoted;
    recalcPromoted(project);
    const target = bundleTarget(project);
    if (sameSet(target, project.served)) {
      if (!sameSet(before, project.promoted)) schedulePersist();
      return;
    }
    if (target.size === 0) {
      project.served = target;
      project.css = '';
      schedulePersist();
      return;
    }
    try {
      // Let the compile that triggered this refresh finish and free its slot first.
      await new Promise((resolve) => setImmediate(resolve));
      const result = await ctx.compile({
        projectId,
        pageId: SYNTHETIC_PAGE,
        classes: Array.from(target).sort().join(' '),
        bundle: 'utilities'
      });
      project.served = target;
      project.css = result.css || '';
    } catch {
      // Busy or failed: keep serving the previous bundle. Stripping only uses classes
      // already in it, and the next compile in this project retries.
    }
    schedulePersist();
  }

  function scheduleRefresh(projectId) {
    const previous = refreshes.get(projectId) || Promise.resolve();
    const next = previous.then(() => refresh(projectId)).catch(() => {});
    refreshes.set(projectId, next);
    next.then(() => {
      if (refreshes.get(projectId) === next) refreshes.delete(projectId);
    });
    return next;
  }

  function seedFromCacheState() {
    for (const projectId of ctx.getProjectIds()) {
      const project = getProject(projectId);
      for (const pageId of ctx.getPageIds(projectId) || []) {
        if (pageId === SYNTHETIC_PAGE) continue;
        const classes = ctx.getPageClasses(projectId, pageId);
        if (classes) trackClasses(project, pageId, classes);
      }
      recalcPromoted(project);
    }
  }

  function serializeState() {
    const out = {};
    for (const [projectId, project] of projects) {
      out[projectId] = {
        pages: setMapToObject(project.pageClasses),
        stripped: setMapToObject(new Map(Array.from(project.pageStrips, ([pageId, strips]) => (
          [pageId, new Set(Array.from(strips.values()).flatMap((set) => Array.from(set)))]
        )))),
        served: Array.from(project.served),
        css: project.css
      };
    }
    return { version: 2, projects: out };
  }

  function restoreState(snapshot) {
    if (!isObject(snapshot) || snapshot.version !== 2 || !isObject(snapshot.projects)) return false;
    projects.clear();
    for (const [projectId, saved] of Object.entries(snapshot.projects)) {
      if (!isObject(saved)) continue;
      const project = getProject(projectId);
      for (const [pageId, classes] of objectToSetMap(saved.pages)) {
        trackClasses(project, pageId, classes);
      }
      for (const [pageId, stripped] of objectToSetMap(saved.stripped)) {
        project.pageStrips.set(pageId, new Map([['', stripped]]));
      }
      recalcPromoted(project);
      // The saved bundle is reused only if it is exactly what this threshold needs.
      const served = stringSet(saved.served);
      if (typeof saved.css === 'string' && sameSet(served, bundleTarget(project))) {
        project.served = served;
        project.css = saved.css;
      }
    }
    return true;
  }

  const persist = async () => {
    if (!storage) return false;
    return storage.set(STORAGE_KEY, serializeState());
  };

  const schedulePersist = () => {
    if (!storage || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist().catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
    if (typeof persistTimer.unref === 'function') persistTimer.unref();
  };

  return {
    name: 'auto-promote',
    deferHooks: ['onCompileResult'],
    timeoutMs: 5000,

    // Resolves once every scheduled bundle refresh has finished.
    async settled() {
      while (refreshes.size > 0) {
        await Promise.all(Array.from(refreshes.values()));
      }
    },

    async setup(context) {
      ctx = context;
      storage = context.storage;

      const hasCachePages = ctx.getProjectIds().some((projectId) => {
        const pageIds = ctx.getPageIds(projectId) || [];
        return pageIds.some((pageId) => pageId !== SYNTHETIC_PAGE);
      });

      let restored = false;
      if (!hasCachePages && storage) {
        restored = restoreState(await storage.get(STORAGE_KEY));
      }
      if (!restored) {
        seedFromCacheState();
      }

      // The bundle changes as classes are promoted, so clients must revalidate
      // (a cheap 304 via ETag) rather than reuse a stale copy.
      context.addRoute('get', '/css/:projectId', (req) => {
        const css = projects.get(req.params.projectId)?.css || '';
        const headers = {
          'Content-Type': 'text/css; charset=utf-8',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'public, no-cache'
        };
        if (!css) {
          return { status: 200, headers, body: '' };
        }
        const etag = `"${crypto.createHash('sha1').update(css).digest('hex').slice(0, 16)}"`;
        headers.ETag = etag;
        if (req.headers.get('if-none-match') === etag) {
          return { status: 304, headers, body: null };
        }
        return { status: 200, headers, body: css };
      });

      context.addRoute('get', '/stats', () => {
        const stats = {};
        for (const [projectId, project] of projects) {
          stats[projectId] = {
            trackedClasses: project.classPages.size,
            promotedClasses: project.promoted.size,
            promoted: Array.from(project.promoted).sort(),
            threshold
          };
        }
        return { status: 200, body: stats };
      });
    },

    async teardown() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await persist();
    },

    transformClasses({ projectId, pageId, bundle, value }) {
      if (pageId === SYNTHETIC_PAGE) return undefined;

      const project = getProject(projectId);
      trackClasses(project, pageId, value);
      const entry = project.inFlight.get(pageId);
      project.inFlight.set(pageId, { count: (entry?.count ?? 0) + 1, at: Date.now() });
      schedulePersist();

      const strip = value.filter((cls) => project.promoted.has(cls) && project.served.has(cls));
      // Removing every class is only valid for the utilities bundle; other bundles
      // would reject an empty class list, so they keep their classes.
      if (strip.length === 0 || (strip.length === value.length && bundle !== 'utilities')) {
        return undefined;
      }
      const stripSet = new Set(strip);
      const kept = value.filter((cls) => !stripSet.has(cls));
      const key = kept.slice().sort().join(' ');
      let strips = project.pageStrips.get(pageId);
      if (!strips) {
        strips = new Map();
        project.pageStrips.set(pageId, strips);
      }
      const recorded = strips.get(key);
      if (recorded) for (const cls of strip) recorded.add(cls);
      else strips.set(key, stripSet);
      return kept;
    },

    onCompileResult({ projectId, pageId }) {
      if (pageId === SYNTHETIC_PAGE || !ctx) return undefined;
      const project = projects.get(projectId);
      const entry = project?.inFlight.get(pageId);
      if (entry) {
        if (entry.count > 1) entry.count -= 1;
        else project.inFlight.delete(pageId);
      }
      return scheduleRefresh(projectId);
    }
  };
}

export default createAutoPromotePlugin;
