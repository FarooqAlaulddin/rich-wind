# Plugin System

Plugins extend Rich Wind with custom behavior — log requests, transform CSS, enforce class allowlists, serve CSS from Redis, register admin endpoints. A plugin is an object with hook methods and an optional `setup()` lifecycle function. You pass plugins to `createCore()` and they're called automatically at the right moments.

```js
import { createCore } from "rich-wind";

const { app, close } = await createCore({
  plugins: [{
    name: "logger",
    onCompileResult({ projectId, pageId, classes, cached }) {
      console.log(`[${projectId}/${pageId}] ${classes.length} classes, cached: ${cached}`);
    }
  }]
});

app.listen(3001);
```

You only implement the hooks you care about. If a plugin doesn't have a method for a particular hook, it's skipped.

## Plugin Lifecycle

Plugins have an optional `setup()` and `teardown()` lifecycle.

### setup(context)

Called once during `createCore()`, before routes are registered. Receives the full [plugin context](#plugin-context) including query functions, mutation functions, plugin storage, and `addRoute()` for registering custom HTTP routes. Can be async.

```js
const dashboard = {
  name: "dashboard",
  async setup({ addRoute, getCacheStats, compile }) {
    // Register a custom endpoint
    addRoute("get", "/stats", (req, res) => {
      res.json(getCacheStats());
    });

    // Warm the cache on startup
    await compile({ projectId: "main", pageId: "home", classes: "text-red-500 p-4" });
  },
  teardown() {
    console.log("Dashboard plugin shutting down");
  }
};
```

If `setup()` throws or exceeds its timeout, the plugin is marked as failed — its hooks are permanently skipped and its routes are not mounted. Other plugins and the server itself are unaffected.

### teardown()

Called when `close()` is invoked. Plugins are torn down in reverse order (last registered, first torn down). Teardown errors are silently suppressed so all plugins get a chance to clean up.

### Shutdown

`createCore()` returns `{ app, close }`. The correct shutdown sequence:

```js
const { app, close } = await createCore({ plugins: [myPlugin] });
const server = app.listen(3001);

// On shutdown:
await new Promise(resolve => server.close(resolve));  // 1. stop accepting requests
await close();                                         // 2. teardown plugins
```

`close()` is idempotent — calling it multiple times is safe.

## Plugin Context

Every plugin's `setup()` receives a context object with query functions, mutation functions, plugin storage, and `addRoute()`. The same query and mutation functions are also available in hook contexts. Storage is setup-scoped (not injected into hook context objects), so plugins should keep a local reference if hooks or teardown need it.

### Query Functions (read-only)

All query functions return copies or frozen snapshots — never live references. They read directly from in-memory cache without refreshing TTLs or triggering computation.

| Function | Returns | Description |
| --- | --- | --- |
| `getProjectIds()` | `string[]` | All project IDs in cache |
| `getClassCounts(projectId)` | `{ class: count }` or `null` | Frozen class frequency map |
| `getPageIds(projectId)` | `string[]` or `null` | All page IDs for a project |
| `getPageClasses(projectId, pageId)` | sorted `string[]` or `null` | Class set for a page |
| `getPageMeta(projectId, pageId)` | `{ hash, updatedAt, expiresAt }` or `null` | Page cache metadata |
| `getCss(projectId, pageId, bundle?)` | `string` or `null` | Cached CSS for a page (pure peek) |
| `getProjectCss(projectId, bundle?)` | `string` or `null` | Cached project aggregate CSS (pure peek) |
| `getCacheStats()` | `{ totalPages, maxPages, projectCount }` | Current cache utilization |
| `getConfig()` | frozen config object | Current configuration |
| `validateClasses(classes)` | `string[]` | Filter input to valid Tailwind utilities (async) |

### Mutation Functions

| Function | Effect |
| --- | --- |
| `evictPage(projectId, pageId)` | Remove a page from cache (updates class counts, LRU, project aggregates) |
| `evictProject(projectId)` | Remove an entire project and all its pages |
| `compile({ projectId, pageId, html?, classes?, bundle? })` | Compile and cache a page programmatically |
| `hydratePageArtifact({ projectId, pageId, bundle, css, classes?, ... })` | Inject a pre-built artifact into cache without compilation |
| `hydrateProjectArtifact({ projectId, bundle, css, hash?, ... })` | Inject a pre-built project aggregate into cache |

**`compile()`** validates inputs, runs the full compilation pipeline (including transform hooks from other plugins), and caches the result. It returns the same shape as the HTTP compile response. When called from inside a hook, it automatically skips hooks to prevent infinite recursion (reentrancy guard).

**`hydratePageArtifact()`** is useful for fast restart from persistence — a plugin reads artifacts from Redis/DB in `setup()` and populates the cache without recompilation. Returns `true` if hydrated, `false` if rejected. New pages require `classes`; existing pages can update CSS only.

**`hydrateProjectArtifact()`** injects project-level aggregate CSS. The project must already exist (hydrate pages first). Returns `true` if hydrated, `false` if rejected.

### Plugin Storage

`setup()` also receives `storage`, a plugin-scoped key/value API backed by `cacheStore` when available.

| Function | Returns | Effect |
| --- | --- | --- |
| `storage.get(key)` | `value` or `null` | Read a plugin-owned key |
| `storage.set(key, value)` | `true` or `false` | Write a plugin-owned key |
| `storage.delete(key)` | `true` or `false` | Delete a plugin-owned key |
| `storage.list(prefix?)` | `string[]` | List plugin-owned keys (optionally filtered by prefix) |

- Keys must match `[a-zA-Z0-9._:-]{1,128}`
- `list(prefix)` prefixes must match `[a-zA-Z0-9._:-]{0,128}`
- Namespacing is automatic per plugin route name (lowercased plugin name)
- Storage methods are always available (even without `cacheStore`) and fail open: `get` returns `null`, `set/delete` return `false`, `list` returns `[]`
- Adapters are responsible for value serialization; JSON-serializable values are recommended for portability

```js
function createAnalyticsPlugin() {
  let storage;
  let metrics = { compileCount: 0 };

  return {
    name: "analytics",
    async setup(ctx) {
      storage = ctx.storage;
      const saved = await storage.get("metrics_v1");
      if (saved && typeof saved === "object") metrics = saved;
    },
    onCompileResult() {
      metrics.compileCount += 1;
      storage.set("metrics_v1", metrics); // fail-open fire-and-forget is fine
    },
    async teardown() {
      await storage.set("metrics_v1", metrics);
    }
  };
}
```

### Route Registration

`addRoute(method, path, handler)` registers an Express route under `/plugins/<plugin-name>/`. Only available during `setup()`.

```js
setup({ addRoute }) {
  addRoute("get", "/stats", (req, res) => res.json({ ok: true }));
  // Accessible at: GET /plugins/my-plugin/stats
}
```

- `method` must be `get`, `post`, `put`, `delete`, or `patch`
- `path` must start with `/`
- Calling `addRoute` after `setup()` returns throws an error
- Plugin routes go through the same rate limiter as core routes

## Request Lifecycle

Here's the order hooks fire during a typical compile request:

```
Request arrives
  → onRequestStart

  POST /api/compile:
    → onCompileStart
    → transformClasses (pipeline — each plugin can modify the class list)
    → (compilation happens)
    → transformCss (pipeline — each plugin can modify the CSS output)
    → onCacheHit or onCacheMiss
    → onCompileResult

  Response sent
    → onResponseSent
```

For `GET /api/css`, the flow is: request hooks → cache lookup → `onCacheHit`/`onCacheMiss` → `resolvePageCss` (on miss) → response. For `GET /api/projects/:id/css`, similar but with `resolveProjectCss`. For `/api/suggest`: request hooks → collect suggestions → `transformSuggestions` → `onSuggest` → response.

## Hook Reference

### Observer Hooks

These fire at specific moments. Return values are ignored.

| Hook | When it fires | Key context fields |
| --- | --- | --- |
| `onRequestStart` | Every incoming request | `action`, `source`, `request` |
| `onResponseSent` | After the response finishes | `action`, `source`, `request`, `status`, `durationMs` |
| `onCompileStart` | Before compilation begins | `projectId`, `pageId`, `bundle`, `html`, `classes`, `source`, `request` |
| `onCompileResult` | After compilation finishes | `projectId`, `pageId`, `bundle`, `css`, `classes`, `hash`, `cached`, `source`, `request` |
| `onCacheHit` | Cached CSS found | `projectId`, `pageId`, `bundle`, `source`, `request` |
| `onCacheMiss` | Cached CSS not found | `projectId`, `pageId`, `bundle`, `source`, `request` |
| `onProjectCss` | Project CSS compiled or served | `projectId`, `bundle`, `css`, `hash`, `cached`, `source`, `request` |
| `onSuggest` | Suggestions returned | `projectId`, `prefix`, `suggestions`, `source`, `request` |
| `onError` | When something fails | `error`, `hook`, `plugin`, `timedOut`, `stage`, `source` |

### Enrichment Hooks (Pipeline)

These run sequentially — each plugin receives the previous plugin's output as `value` and can return a modified version. Return `undefined` to skip (pass through unchanged). Errors/timeouts skip that plugin.

| Hook | When | Input `value` | Expected return |
| --- | --- | --- | --- |
| `transformClasses` | After class resolution, before CSS generation | `string[]` (sorted classes) | `string[]` or `undefined` |
| `transformCss` | After CSS generation, before caching | `string` (CSS) | `string` or `undefined` |
| `transformSuggestions` | After suggestions collected, before response | `string[]` (suggestions) | `string[]` or `undefined` |

**Post-validation:** `transformClasses` output is de-duplicated, re-validated against Tailwind, and re-sorted. If the result is empty → 400 error. If it exceeds `maxClassCount` → 413 error. `transformCss` output exceeding `maxCssChars` is rejected (previous value used). `transformSuggestions` output is filtered to strings, de-duped, and capped to the request limit.

```js
const themeEnforcer = {
  name: "theme-enforcer",
  transformClasses({ value }) {
    // Remove any bg-* classes not in the approved palette
    return value.filter(c => !c.startsWith("bg-") || approvedColors.has(c));
  }
};
```

### Resolve Hooks (First-Wins)

These run when the cache misses. The first plugin to return a non-null result short-circuits — the CSS is served directly. Return `null` to pass to the next plugin.

| Hook | When | Expected return |
| --- | --- | --- |
| `resolvePageCss` | `GET /api/css` cache miss | `{ css }` or `null` |
| `resolveProjectCss` | `GET /api/projects/:id/css` cache miss | `{ css }` or `null` |

Resolved CSS is served directly and not cached in memory. If the plugin wants caching, it can call `hydratePageArtifact()` separately.

```js
const redisResolver = {
  name: "redis-cache",
  async resolvePageCss({ projectId, pageId, bundle }) {
    const css = await redis.get(`css:${projectId}:${pageId}:${bundle}`);
    return css ? { css } : null;
  }
};
```

### Source and Request Fields

All hooks include `source` and `request` fields so plugins know where the action originated:

- **`source`**: `"http"` for HTTP requests, `"plugin"` for `compile()` calls from plugin code, `"cache-store"` for cacheStore errors
- **`request`**: `{ ip, method, path }` for HTTP requests, `null` for plugin-initiated actions

## Plugin Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `name` | string | `"plugin-1"`, `"plugin-2"`, etc. | Identifies the plugin in errors and route paths |
| `defer` | boolean | `false` | All observer hooks run async via microtask (fire-and-forget) |
| `deferHooks` | string[] | — | Defer only specific hooks (e.g. `["onCompileResult"]`) |
| `timeoutMs` | number | inherited from `pluginTimeoutMs` | Max time a hook can run before `onError` fires |
| `setupTimeoutMs` | number | inherited from global `setupTimeoutMs` | Max time `setup()` can run |

### Plugin Name Rules

Names must match `[a-zA-Z0-9_-]+` and be at most 64 characters. Names are checked for case-insensitive collisions (`Foo` and `foo` collide because routes are case-insensitive). Invalid or colliding names throw during `createCore()`.

### Deferred Hooks

Setting `defer: true` makes observer hooks fire-and-forget via `queueMicrotask`. This is the right choice for I/O-heavy plugins (database logging, webhooks). You can defer individual hooks with `deferHooks`.

`onError` is never deferred. Transform and resolve hooks (`transformClasses`, `transformCss`, `transformSuggestions`, `resolvePageCss`, `resolveProjectCss`) are also never deferred — they affect the response.

## Error Handling

Plugins are sandboxed. A hook that throws or times out will never crash the server or fail the HTTP request:

1. The error is caught
2. `onError` fires with the details (`error`, `hook`, `plugin`, `timedOut`)
3. Processing continues normally

`onError` itself is immune — if it throws, the error is silently dropped.

The `stage` field in `onError` tells you where the error originated:

| `stage` | Source |
| --- | --- |
| `"compile"` | Error during compilation |
| `"cache"` | Error during `GET /api/css` |
| `"project-css"` | Error during project CSS route |
| `"suggest"` | Error during suggestions |
| `"transform"` | A transform hook returned invalid output |
| `"resolve"` | A resolve hook returned invalid output |
| `"cache-store"` | A cacheStore operation failed or timed out |
| `"body"` | Request body too large |

## Reentrancy Guard

When a plugin calls `compile()` from inside a hook (e.g., `onCompileResult` triggers a related page recompile), the inner compile skips all hooks to prevent infinite recursion. The inner compile still caches the result and writes to cacheStore — only hook execution is skipped.

Plugin compile chains are bounded by `maxPluginCompileChainDepth` (default `2`). If exceeded, `compile()` returns `{ error: "Plugin compile chain depth exceeded.", status: 429 }`.

## createCore Options

| Option | Default | Description |
| --- | --- | --- |
| `plugins` | `[]` | Array of plugin objects |
| `pluginTimeoutMs` | `200` | Default hook timeout |
| `setupTimeoutMs` | computed | Setup timeout (min 1000ms) |
| `maxPluginCompileChainDepth` | `2` | Max depth for plugin-initiated compile chains |

## Example: Persistence Bridge

```js
const persistenceBridge = {
  name: "persistence",
  deferHooks: ["onCompileResult", "onProjectCss"],

  async setup({ hydratePageArtifact }) {
    // Restore cached artifacts from database on startup
    const artifacts = await db.getAllPageArtifacts();
    for (const a of artifacts) {
      hydratePageArtifact(a);
    }
  },

  async onCompileResult({ projectId, pageId, bundle, css, classes, hash }) {
    await db.upsertPageArtifact({ projectId, pageId, bundle, css, classes, hash });
  },

  async onProjectCss({ projectId, bundle, css, hash }) {
    await db.upsertProjectArtifact({ projectId, bundle, css, hash });
  }
};
```

## Example: Theme Enforcer

```js
const themeEnforcer = {
  name: "theme-enforcer",
  transformClasses({ value }) {
    const allowed = new Set(["bg-brand", "bg-white", "bg-black", "bg-gray-100"]);
    return value.filter(c => !c.startsWith("bg-") || allowed.has(c));
  }
};
```

## Example: Metrics

```js
const metrics = {
  name: "metrics",
  defer: true,

  onCompileResult({ projectId, classes, cached, bundle }) {
    classCountHistogram.record(classes.length, { projectId, bundle, cached });
  },

  onResponseSent({ status, durationMs, action }) {
    requestLatency.record(durationMs, { status, action });
  },

  onError({ error, hook, plugin, timedOut }) {
    console.error(`[${plugin}] ${hook} failed (timeout: ${timedOut}):`, error.message);
  }
};
```

## Example: Auto-Promote (Real-World Demo)

The auto-promote plugin tracks which CSS classes appear across pages. When a class is used on enough pages (default: 5), it's "promoted" to a shared stylesheet — reducing per-page CSS duplication. This demo exercises nearly every plugin capability: `setup` seeding, `transformClasses` pipeline, deferred `onCompileResult`, custom routes, and `ctx.compile()`.

```js
import { createAutoPromotePlugin } from "rich-wind/plugins/auto-promote.js";

const { app, close } = await createCore({
  plugins: [createAutoPromotePlugin({ threshold: 5 })],
  maxPluginCompileChainDepth: 3
});

app.listen(3001);
// GET /plugins/auto-promote/css/:projectId  → promoted CSS bundle
// GET /plugins/auto-promote/stats            → usage statistics
```

**How it works:**

1. **`setup()`** seeds tracking state from any pages already in cache, and registers two custom routes (promoted CSS bundle, usage stats).
2. **`transformClasses`** runs on every compile. It records which classes appear on which pages (before stripping), then removes promoted classes from the output so per-page CSS only contains unique utilities. If *all* classes would be stripped, it returns `undefined` to keep the original list (avoiding a 400 error).
3. **`onCompileResult`** (deferred) recalculates the promoted set after each compile. When the set changes, it calls `ctx.compile()` to pre-generate CSS for a synthetic `__auto_promote__` page, caching the result for the custom route.

The plugin uses `deferHooks: ["onCompileResult"]` so the promoted-CSS regeneration happens asynchronously and doesn't slow down the HTTP response. The synthetic `__auto_promote__` page ID is excluded from stripping logic, so the promoted CSS compile always receives the full class list.

See `plugins/auto-promote.js` for the full implementation and `tests/auto-promote.test.js` for test coverage.
