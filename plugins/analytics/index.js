/**
 * Analytics Plugin
 *
 * Pure observer that tracks every measurable metric about the compilation
 * service — requests, responses, compiles, CSS output, class usage, cache
 * performance, per-project breakdowns, errors, and uptime.
 *
 * All hooks are deferred so the plugin has zero impact on response latency.
 * Exposes one route:
 *   GET /data  — full JSON metrics dump (tracked + live state)
 *
 * The dashboard UI lives in the React Router app at /plugins/analytics.
 */

// Ring buffer: fixed-capacity array that overwrites oldest entries
function createRingBuffer(capacity) {
  const buf = [];
  let total = 0;
  return {
    push(item) {
      if (buf.length >= capacity) buf.shift();
      buf.push(item);
      total++;
    },
    toArray() { return buf.slice(); },
    get length() { return buf.length; },
    get totalPushed() { return total; }
  };
}

export function createAnalyticsPlugin() {
  const metrics = {
    startedAt: 0,
    requests: { total: 0, byAction: {} },
    responses: { byStatus: {}, latencies: createRingBuffer(1000) },
    compiles: { total: 0, fresh: 0, cached: 0, byBundle: {}, byProject: {}, bySource: {} },
    css: { totalBytes: 0, sizes: createRingBuffer(1000) },
    classes: { totalSeen: 0, frequency: new Map() },
    cache: { hits: 0, misses: 0 },
    errors: createRingBuffer(200)
  };

  let ctx = null;

  return {
    name: 'analytics',
    defer: true,
    timeoutMs: 5000,

    async setup(context) {
      ctx = context;
      metrics.startedAt = Date.now();

      // Seed class frequency from existing cache state
      for (const projectId of ctx.getProjectIds()) {
        const counts = ctx.getClassCounts(projectId);
        if (!counts) continue;
        for (const [cls, count] of Object.entries(counts)) {
          metrics.classes.frequency.set(
            cls,
            (metrics.classes.frequency.get(cls) || 0) + count
          );
          metrics.classes.totalSeen++;
        }
      }

      // --- Routes ---

      context.addRoute('get', '/data', (_req, res) => {
        const now = Date.now();
        const latArr = metrics.responses.latencies.toArray();
        const sizeArr = metrics.css.sizes.toArray();

        // Compute latency stats
        const latStats = computeStats(latArr);

        // Compute CSS size stats
        const cssStats = computeStats(sizeArr);

        // Top 20 classes by frequency
        const topClasses = [...metrics.classes.frequency.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, count]) => ({ name, count }));

        // Live cache + project state from context
        const cacheStats = ctx.getCacheStats();
        const projectIds = ctx.getProjectIds();
        const projects = {};
        for (const pid of projectIds) {
          const pageIds = ctx.getPageIds(pid) || [];
          const classCounts = ctx.getClassCounts(pid) || {};
          projects[pid] = {
            pages: pageIds.length,
            classes: Object.keys(classCounts).length,
            compiles: metrics.compiles.byProject[pid] || 0
          };
        }

        const config = ctx.getConfig();

        res.json({
          uptime: {
            startedAt: metrics.startedAt,
            uptimeMs: now - metrics.startedAt
          },
          requests: {
            total: metrics.requests.total,
            byAction: { ...metrics.requests.byAction }
          },
          responses: {
            byStatus: { ...metrics.responses.byStatus },
            latency: latStats,
            recentLatencies: latArr.slice(-100)
          },
          compiles: {
            total: metrics.compiles.total,
            fresh: metrics.compiles.fresh,
            cached: metrics.compiles.cached,
            hitRate: metrics.compiles.total > 0
              ? +(metrics.compiles.cached / metrics.compiles.total * 100).toFixed(1)
              : 0,
            byBundle: { ...metrics.compiles.byBundle },
            byProject: { ...metrics.compiles.byProject },
            bySource: { ...metrics.compiles.bySource }
          },
          css: {
            totalBytes: metrics.css.totalBytes,
            perCompile: cssStats
          },
          classes: {
            uniqueTracked: metrics.classes.frequency.size,
            top20: topClasses
          },
          cache: {
            hits: metrics.cache.hits,
            misses: metrics.cache.misses,
            hitRate: (metrics.cache.hits + metrics.cache.misses) > 0
              ? +(metrics.cache.hits / (metrics.cache.hits + metrics.cache.misses) * 100).toFixed(1)
              : 0,
            ...cacheStats
          },
          projects,
          errors: {
            total: metrics.errors.totalPushed,
            recent: metrics.errors.toArray()
          },
          config: {
            cacheMaxPages: config.cacheMaxPages,
            cacheTtlMs: config.cacheTtlMs,
            maxClassCount: config.maxClassCount
          }
        });
      });

    },

    onRequestStart({ action, request }) {
      metrics.requests.total++;
      if (action) {
        metrics.requests.byAction[action] = (metrics.requests.byAction[action] || 0) + 1;
      }
    },

    onResponseSent({ status, durationMs }) {
      const code = String(status || 0);
      metrics.responses.byStatus[code] = (metrics.responses.byStatus[code] || 0) + 1;
      if (typeof durationMs === 'number') {
        metrics.responses.latencies.push(durationMs);
      }
    },

    onCompileResult({ projectId, bundle, classes, css, cached, source }) {
      metrics.compiles.total++;
      if (cached) {
        metrics.compiles.cached++;
      } else {
        metrics.compiles.fresh++;
      }

      const b = bundle || 'full';
      metrics.compiles.byBundle[b] = (metrics.compiles.byBundle[b] || 0) + 1;

      if (projectId) {
        metrics.compiles.byProject[projectId] = (metrics.compiles.byProject[projectId] || 0) + 1;
      }

      const src = source || 'unknown';
      metrics.compiles.bySource[src] = (metrics.compiles.bySource[src] || 0) + 1;

      // CSS size tracking
      if (typeof css === 'string') {
        const bytes = css.length;
        metrics.css.totalBytes += bytes;
        metrics.css.sizes.push(bytes);
      }

      // Class frequency tracking
      if (Array.isArray(classes)) {
        for (const cls of classes) {
          const prev = metrics.classes.frequency.get(cls) || 0;
          if (prev === 0) metrics.classes.totalSeen++;
          metrics.classes.frequency.set(cls, prev + 1);
        }
      }
    },

    onCacheHit() {
      metrics.cache.hits++;
    },

    onCacheMiss() {
      metrics.cache.misses++;
    },

    onError({ error, stage, hook, plugin, timedOut, context: errCtx }) {
      metrics.errors.push({
        time: Date.now(),
        message: error?.message || String(error),
        stage: stage || null,
        hook: hook || null,
        plugin: plugin || null,
        timedOut: Boolean(timedOut),
        projectId: errCtx?.projectId || null
      });
    }
  };
}

function computeStats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0, count: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = arr.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: +(sum / sorted.length).toFixed(1),
    count: sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]
  };
}

export default createAnalyticsPlugin;
