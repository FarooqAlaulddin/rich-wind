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

  return {
    name: 'auto-promote',
    deferHooks: ['onCompileResult'],
    timeoutMs: 5000,

    async setup(context) {
      ctx = context;

      // Seed tracking from existing cache state
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

      // Custom routes
      context.addRoute('get', '/css/:projectId', (req, res) => {
        const { projectId } = req.params;
        const css = promotedCssCache.get(projectId);
        if (!css) {
          return res.status(404).json({ error: 'No promoted classes for this project.' });
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

    transformClasses({ projectId, pageId, value }) {
      // Always track the original classes (before stripping)
      if (pageId !== SYNTHETIC_PAGE) {
        trackClasses(projectId, pageId, value);
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

      // If all classes are promoted, return undefined to keep original
      // (avoids empty-class 400 error)
      if (filtered.length === 0) {
        return undefined;
      }

      return filtered;
    },

    async onCompileResult({ projectId, pageId }) {
      if (pageId === SYNTHETIC_PAGE) return;
      if (!ctx) return;

      const oldPromoted = promoted.get(projectId);
      const newPromoted = recalcPromoted(projectId);

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
          classes
        });
        if (result && !result.error && result.css) {
          promotedCssCache.set(projectId, result.css);
        }
      } else if (newPromoted.size === 0) {
        promotedCssCache.delete(projectId);
      }
    }
  };
}

export default createAutoPromotePlugin;
