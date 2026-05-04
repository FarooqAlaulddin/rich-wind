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

const SYNTHETIC_PAGE = '__auto_promote__';
const STORAGE_KEY = 'state_v1';
const PERSIST_DEBOUNCE_MS = 250;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mapOfSetToObject(input) {
  const out = {};
  for (const [outerKey, innerMap] of input) {
    const inner = {};
    for (const [innerKey, set] of innerMap) {
      inner[innerKey] = Array.from(set);
    }
    out[outerKey] = inner;
  }
  return out;
}

function objectToMapOfSet(input) {
  const outer = new Map();
  if (!isObject(input)) return outer;
  for (const [outerKey, innerObj] of Object.entries(input)) {
    if (!isObject(innerObj)) continue;
    const innerMap = new Map();
    for (const [innerKey, list] of Object.entries(innerObj)) {
      if (!Array.isArray(list)) continue;
      innerMap.set(innerKey, new Set(list.filter((item) => typeof item === 'string')));
    }
    outer.set(outerKey, innerMap);
  }
  return outer;
}

function mapToObject(input) {
  const out = {};
  for (const [key, value] of input) out[key] = value;
  return out;
}

export function createAutoPromotePlugin(options = {}) {
  const threshold = Number.isFinite(options.threshold) && options.threshold >= 1
    ? options.threshold
    : 5;

  // classPageMap: Map<projectId, Map<className, Set<pageId>>>
  const classPageMap = new Map();
  // pageClassMap: Map<projectId, Map<pageId, Set<className>>> — inverse index for demotion
  const pageClassMap = new Map();
  // promoted: Map<projectId, Set<className>>
  const promoted = new Map();
  // promotedCssCache: Map<projectId, string>
  const promotedCssCache = new Map();

  let ctx = null;
  let storage = null;
  let persistTimer = null;

  function getProjectMap(projectId) {
    let map = classPageMap.get(projectId);
    if (!map) {
      map = new Map();
      classPageMap.set(projectId, map);
    }
    return map;
  }

  function getPageMap(projectId) {
    let map = pageClassMap.get(projectId);
    if (!map) {
      map = new Map();
      pageClassMap.set(projectId, map);
    }
    return map;
  }

  function trackClasses(projectId, pageId, classes) {
    const classToPages = getProjectMap(projectId);
    const pageToClasses = getPageMap(projectId);
    const newSet = new Set(classes);
    const oldSet = pageToClasses.get(pageId);

    // Remove stale associations: classes this page no longer uses
    if (oldSet) {
      for (const cls of oldSet) {
        if (!newSet.has(cls)) {
          const pages = classToPages.get(cls);
          if (pages) {
            pages.delete(pageId);
            if (pages.size === 0) classToPages.delete(cls);
          }
        }
      }
    }

    // Add current associations
    for (const cls of classes) {
      let pages = classToPages.get(cls);
      if (!pages) {
        pages = new Set();
        classToPages.set(cls, pages);
      }
      pages.add(pageId);
    }

    // Update inverse index
    pageToClasses.set(pageId, newSet);
  }

  function recalcPromoted(projectId) {
    const map = classPageMap.get(projectId);
    if (!map) {
      promoted.delete(projectId);
      return new Set();
    }
    const set = new Set();
    for (const [cls, pages] of map) {
      if (pages.size >= threshold) {
        set.add(cls);
      }
    }
    promoted.set(projectId, set);
    return set;
  }

  function seedFromCacheState() {
    for (const projectId of ctx.getProjectIds()) {
      const pageIds = ctx.getPageIds(projectId);
      if (!pageIds) continue;
      for (const pageId of pageIds) {
        if (pageId === SYNTHETIC_PAGE) continue;
        const classes = ctx.getPageClasses(projectId, pageId);
        if (classes) {
          trackClasses(projectId, pageId, classes);
        }
      }
      recalcPromoted(projectId);
    }
  }

  function serializeState() {
    return {
      version: 1,
      threshold,
      classPageMap: mapOfSetToObject(classPageMap),
      pageClassMap: mapOfSetToObject(pageClassMap),
      promotedCssCache: mapToObject(promotedCssCache)
    };
  }

  function clearState() {
    classPageMap.clear();
    pageClassMap.clear();
    promoted.clear();
    promotedCssCache.clear();
  }

  function restoreState(snapshot) {
    if (!isObject(snapshot) || snapshot.version !== 1) return false;

    clearState();

    const restoredClassPageMap = objectToMapOfSet(snapshot.classPageMap);
    const restoredPageClassMap = objectToMapOfSet(snapshot.pageClassMap);

    for (const [projectId, classMap] of restoredClassPageMap) {
      classPageMap.set(projectId, classMap);
    }
    for (const [projectId, pageMap] of restoredPageClassMap) {
      pageClassMap.set(projectId, pageMap);
    }

    for (const projectId of classPageMap.keys()) {
      recalcPromoted(projectId);
    }

    const thresholdMatches = snapshot.threshold === threshold;
    if (thresholdMatches && isObject(snapshot.promotedCssCache)) {
      for (const [projectId, css] of Object.entries(snapshot.promotedCssCache)) {
        if (typeof css !== 'string') continue;
        const promotedSet = promoted.get(projectId);
        if (!promotedSet || promotedSet.size === 0) continue;
        promotedCssCache.set(projectId, css);
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

    async setup(context) {
      ctx = context;
      storage = context.storage;

      const hasCachePages = ctx.getProjectIds().some((projectId) => {
        const pageIds = ctx.getPageIds(projectId) || [];
        return pageIds.some((pageId) => pageId !== SYNTHETIC_PAGE);
      });

      let restored = false;
      if (!hasCachePages) {
        const snapshot = await storage.get(STORAGE_KEY);
        restored = restoreState(snapshot);
      }

      if (!restored) {
        seedFromCacheState();
      }

      // Custom routes
      context.addRoute('get', '/css/:projectId', (req, res) => {
        const { projectId } = req.params;
        const css = promotedCssCache.get(projectId);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        if (!css) {
          return res.type('text/css').send('');
        }
        res.type('text/css').send(css);
      });

      context.addRoute('get', '/stats', (_req, res) => {
        const stats = {};
        for (const [projectId, map] of classPageMap) {
          const promotedSet = promoted.get(projectId) || new Set();
          stats[projectId] = {
            trackedClasses: map.size,
            promotedClasses: promotedSet.size,
            promoted: Array.from(promotedSet).sort(),
            threshold
          };
        }
        res.json(stats);
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
      // Always track the original classes (before stripping)
      if (pageId !== SYNTHETIC_PAGE) {
        trackClasses(projectId, pageId, value);
        schedulePersist();
      }

      // Don't strip classes from the synthetic promoted page
      if (pageId === SYNTHETIC_PAGE) {
        return undefined;
      }

      const promotedSet = promoted.get(projectId);
      if (!promotedSet || promotedSet.size === 0) {
        return undefined;
      }

      const filtered = value.filter(cls => !promotedSet.has(cls));

      // For utilities bundle, returning [] is valid and keeps per-page output empty.
      // For other bundles, preserve legacy behavior to avoid breaking callers.
      if (filtered.length === 0) {
        if (bundle === 'utilities') return [];
        return undefined;
      }

      return filtered;
    },

    async onCompileResult({ projectId, pageId }) {
      if (pageId === SYNTHETIC_PAGE) return;
      if (!ctx) return;

      const oldPromoted = promoted.get(projectId);
      const newPromoted = recalcPromoted(projectId);
      let shouldPersist = false;

      // Check if promoted set changed
      const changed = !oldPromoted ||
        oldPromoted.size !== newPromoted.size ||
        ![...newPromoted].every(c => oldPromoted.has(c));

      if (changed && newPromoted.size > 0) {
        // Pre-generate promoted CSS via ctx.compile on synthetic page
        const classes = Array.from(newPromoted).sort().join(' ');
        const result = await ctx.compile({
          projectId,
          pageId: SYNTHETIC_PAGE,
          classes,
          bundle: 'utilities'
        });
        if (result && !result.error && result.css) {
          promotedCssCache.set(projectId, result.css);
          shouldPersist = true;
        }
      } else if (newPromoted.size === 0) {
        promotedCssCache.delete(projectId);
        shouldPersist = true;
      } else if (changed) {
        shouldPersist = true;
      }

      if (changed && !shouldPersist) {
        // Promotion state changed but CSS generation failed; persist trackers anyway.
        shouldPersist = true;
      }
      if (shouldPersist) schedulePersist();
    }
  };
}

export default createAutoPromotePlugin;
