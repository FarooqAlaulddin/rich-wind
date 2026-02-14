# Plugin System Expansion

## Context

The plugin system is observer-only — hooks fire, return values are ignored. Plugins can't read state, register routes, modify compilation, intercept requests, or manage cache. This redesign turns the plugin contract into a full platform where plugins can build any feature on top of Rich Wind.

## Design Principles

- **Plugins get a context object** with query functions, mutation functions, and route registration. This context is available both in `setup()` and in every hook call.
- **Enrichment hooks** use a sequential pipeline — each plugin can modify the value, next plugin gets the modified version. Fail-open: errors/timeouts skip that plugin.
- **Resolve hooks** use first-wins — first plugin to return non-null short-circuits.
- **All new hooks are never deferred** — they affect the response.
- **State access is copy-based** — query functions return frozen snapshots, never live references.
- **Plugins are trusted** — they run in-process and have full cache visibility. Untrusted code should not be loaded as a plugin.
- **Execution order is array order** — pipeline and resolve hooks run in the order plugins appear in the `plugins` array. No priority/weight system.
- **Plugin compile chains are bounded** — plugin-invoked `compile()` calls carry chain metadata and are capped by `maxPluginCompileChainDepth` (default `2`) to prevent deferred self-trigger loops.

## Plugin Identity

### Name rules

Plugin names must match `[a-zA-Z0-9_-]+` and be at most 64 characters. During `createPluginRunner`, after assigning default names (`plugin-1`, etc.), the runner validates each name against this pattern and checks for duplicates. Duplicate checks are **case-insensitive** because route mounting is case-insensitive in Express by default (`Foo` and `foo` collide under `/plugins/*`). Each plugin also gets a canonical route segment `routeName = name.toLowerCase()`. Violations throw immediately:

- Invalid name charset/length → `Invalid plugin name "${name}": must match [a-zA-Z0-9_-]+ and be ≤64 chars`
- Duplicate name/route segment (case-insensitive) → `Plugin name "${name}" collides with existing plugin "${existingName}" (route segment "${routeName}")`

The check happens before `setup()` is called so misconfiguration fails fast.

### Route registration

`addRoute(method, path, handler)` — mounts an Express route under `/plugins/<plugin-route-name>/` where `<plugin-route-name>` is `name.toLowerCase()`. Available only during `setup()`.

**Validation:**
- `method` must be one of `get`, `post`, `put`, `delete`, `patch` (case-insensitive). Invalid → throws `Invalid HTTP method "${method}"`.
- `path` must start with `/` and match `[a-zA-Z0-9/_:.-]+` (no `..`, no query strings). Invalid → throws `Invalid route path "${path}"`.
- `handler` must be a function. Invalid → throws `Route handler must be a function`.
- Calling `addRoute` after `setup()` returns → throws `addRoute is only available during setup()`.

**Rate limiting:** Plugin routes are rate-limited by default (same global middleware). The rate limiter middleware runs via `app.use()` before plugin routes are mounted, so all routes — including `/plugins/*` — go through it. This is intentional: plugins are trusted, but their endpoints are HTTP-accessible and should be protected. If a plugin needs different rate limiting, it can implement its own middleware in its route handler.

## Plugin Context

Built inside `createCore()`, passed to `setup()` and included in every hook's context object.

### Query functions (read-only, pure peek — no TTL mutation, no computation)

| Function | Returns | Description |
| --- | --- | --- |
| `getProjectIds()` | `string[]` | All project IDs in cache |
| `getClassCounts(projectId)` | `{ class: count }` or `null` | Frozen class frequency map |
| `getPageIds(projectId)` | `string[]` or `null` | All page IDs for a project |
| `getPageClasses(projectId, pageId)` | sorted `string[]` or `null` | Class set for a page |
| `getPageMeta(projectId, pageId)` | `{ hash, updatedAt, expiresAt }` or `null` | Page cache metadata |
| `getCss(projectId, pageId, bundle?)` | `string` or `null` | Cached CSS for a page (peek only) |
| `getProjectCss(projectId, bundle?)` | `string` or `null` | Cached project-level aggregate CSS (peek only) |
| `getCacheStats()` | `{ totalPages, maxPages, projectCount }` | Current cache utilization |
| `getConfig()` | frozen config object | Current configuration (shallow freeze — config is flat today) |
| `validateClasses(classes)` | `string[]` | Filter input to valid Tailwind utility classes (async) |

All return copies via `Array.from`, `Object.fromEntries`, `Object.freeze`.

**`getCss`** is a pure peek — it reads from the page's in-memory cache entry directly (`page.css`, `page.utilitiesCss`, `page.themeCss`) without touching TTL, without triggering LRU reordering, and without generating missing bundle CSS. Returns the CSS string if that specific bundle is cached, `null` otherwise. This differs from `getCachedPageCss()` which refreshes TTL and may compute missing bundles. For `bundle=base`: returns the module-level cached base CSS (`cachedBaseCss`) if it has been generated by any prior request, `null` otherwise — does not trigger generation. Note: base CSS is **process-global** (shared across all `createCore()` instances in the same process). This is an existing design choice in the core — Tailwind's preflight reset is identical regardless of project, so sharing it is correct and efficient. Multi-core-per-process is not a common pattern, but if used, all instances share the same base CSS.

**`getProjectCss`** is a pure peek — it reads the project's aggregate CSS cache (`cssCache`, `utilitiesCssCache`, `themeCssCache`) directly. Returns `null` if not cached. Does not trigger compilation or TTL refresh. This differs from the internal `getProjectCss()` function which may compile. For `bundle=base`: same behavior as `getCss` — returns process-global cached base CSS or `null`.

**`getCacheStats`** returns `{ totalPages: state.pageLru.size, maxPages: config.cacheMaxPages, projectCount: state.projects.size }`.

**`validateClasses`** wraps the existing `filterValidClasses()` — takes a string or array of class names, returns only the ones that are valid Tailwind utilities.

### Mutation functions

| Function | Effect |
| --- | --- |
| `evictPage(projectId, pageId)` | Remove a page from cache, update class counts, remove from pageLru, clear project aggregate cache |
| `evictProject(projectId)` | Remove entire project: iterate all pages via `evictPageByKey` for each, then delete the project |
| `compile({ projectId, pageId, html?, classes?, bundle? })` | Compile and cache a page programmatically (with input validation) |
| `hydratePageArtifact({ projectId, pageId, bundle, css, classes?, hash?, updatedAt?, expiresAt? })` | Inject a pre-built artifact into cache without compilation |
| `hydrateProjectArtifact({ projectId, bundle, css, hash?, updatedAt?, expiresAt? })` | Inject a pre-built project aggregate into cache |

**`evictPage`** calls the existing `evictPageByKey(state, makePageKey(projectId, pageId))` internally — this already handles pageLru deletion, class count updates, page removal, aggregate cache clearing, and project cleanup if empty.

**`evictProject`** iterates `project.pages.keys()` and calls `evictPageByKey` for each page key. This ensures every pageLru entry for the project is cleaned up, class counts are zeroed, and the project is removed from `state.projects`.

**`compile`** wraps `compileAndCachePage()` with input validation:
- Validates `projectId` and `pageId` using the existing `isValidId()` function (charset + `maxIdLength`)
- Validates `html` against `maxHtmlChars` if provided
- Validates `classes` against `maxClassChars`/`maxClassCount` if provided
- Returns `{ error, status }` on validation failure (same shape as the internal function)
- Enforces `maxPluginCompileChainDepth` for plugin-sourced compile chains (default `2`, configurable via `createCore({ maxPluginCompileChainDepth })`). If exceeded, returns `{ error: "Plugin compile chain depth exceeded.", status: 429 }`.
- On success (non-guarded): full pipeline runs including `transformClasses`/`transformCss` hooks, result is cached normally. Also runs `hydrateMissingCompilePageFromStore` (pre-hydration from cacheStore) before compilation, same as HTTP.
- On success (guarded — called from inside a hook): direct compile, no hooks, no pre-hydration, but cacheStore write-through still happens.
- Does not go through rate limiting or HTTP body parsing (those are HTTP-level concerns)
- **Fires lifecycle hooks in the same order as HTTP compile** (unless reentrancy guard is active):
  1. `onCompileStart({ projectId, pageId, bundle, html, classes, source: "plugin", request: null })`
  2. Compilation runs (with `transformClasses` and `transformCss` pipeline)
  3. `onCacheHit({ projectId, pageId, bundle, source: "plugin" })` or `onCacheMiss({ ... })`
  4. `onCompileResult({ projectId, pageId, bundle, css, classes, hash, cached, source: "plugin", request: null })`
  5. cacheStore `upsertPageArtifact` fires asynchronously (same as HTTP)
  - `onRequestStart` and `onResponseSent` do **not** fire (no HTTP request exists)
  - Error paths: if compilation fails, `onError` fires with `stage: "compile"`, `source: "plugin"`, same as HTTP
- **HTTP compile hooks** are updated to include `source: "http"` and `request: { ip, method, path }` for parity. This is an additive field on existing hook payloads.
- Plugins can rely on stable payload shape: every `onCompileStart`/`onCompileResult`/`onCacheHit`/`onCacheMiss` always has `source` (`"http"` or `"plugin"`) and `request` (`{ ip, method, path }` or `null`).
- **Error payload parity for plugin-invoked compile:** `onError` fires with `{ error, stage: "compile", source: "plugin", context: { projectId, pageId, bundle } }`. HTTP compile errors fire with `{ error, stage: "compile", source: "http", context: { projectId, pageId, bundle }, request: { ip, method, path } }`. The `source` and `request` fields are the only differences.

**`hydratePageArtifact`** injects a pre-built CSS artifact into in-memory cache without running the Tailwind compiler. Wraps the existing `hydratePageFromArtifact()` (L341) with `sanitizePageArtifact()` (L291) validation:
- `css` must be a string, not exceed `maxCssChars`
- `classes` (if provided) must normalize and not exceed `maxClassCount`
- `expiresAt` must be in the future
- `projectId` and `pageId` are validated via `isValidId()`
- Returns `true` if hydrated, `false` if rejected
- The artifact is inserted into the LRU and class counts, identical to cacheStore hydration
- Does **not** run transform hooks (artifact is pre-built, not compiled)

**Classes requirement for new pages:** If the page does not already exist in cache, `classes` is **required**. Without classes, the core cannot maintain class counts or generate project-level aggregate CSS. Hydrating css-only on a new page returns `false`. This matches the existing `hydratePageFromArtifact()` behavior (L350-355: if no page exists and no classes provided, return false). If the page already exists in cache (from a prior compile or hydrate), css-only hydration is allowed — it updates the CSS for the specified bundle while keeping the existing class set.

**`hydrateProjectArtifact`** injects a pre-built project aggregate CSS into the project's `cssCache`/`utilitiesCssCache`/`themeCssCache`:
- `css` must be a string, not exceed `maxCssChars` — validated via `sanitizeProjectArtifact()`
- `projectId` is validated via `isValidId()`
- `expiresAt` defaults to `now + projectCacheTtlMs` if not provided
- Returns `true` if hydrated, `false` if rejected
- If the project does not exist in state, **returns `false`** — project-level aggregate CSS is only meaningful when pages exist. Hydrate pages first (via `hydratePageArtifact` or `compile`), then hydrate the project aggregate. This prevents orphan project cache entries with no backing page data.

Use cases for hydrate:
- **Fast restart from persistence** — a plugin reads artifacts from Redis/DB in `setup()` and hydrates without recompilation
- **Cross-instance sharing** — replicas share cached artifacts via a shared store plugin
- **Restore from backup** — an admin endpoint accepts artifacts and hydrates them

Use cases for compile:
- **Cache warming on startup** — compile from source HTML/classes when artifacts aren't available
- **Background recompilation** — trigger from a webhook or interval
- **Programmatic compilation** — a plugin route handler compiles on demand

### Reentrancy guard

`compile()` checks a per-request reentrancy flag before running transform hooks. If `compile()` is called from inside a `transformClasses`/`transformCss` hook, the inner `compile()` skips transform hooks to prevent infinite recursion.

**Scope:** The guard covers all hook types, not just transform hooks. Any hook (`onCompileStart`, `onCompileResult`, `onCacheHit`, `onCacheMiss`, `transformClasses`, `transformCss`, `resolvePageCss`, etc.) that calls `compile()` will get the guarded version. This prevents recursion from observer hooks that trigger recompilation.

**Implementation:** Uses `AsyncLocalStorage` from `node:async_hooks`. All three dispatch methods — `runHook`, `runPipeline`, and `runResolve` — wrap hook execution in `hookStore.run({ inHook: true, compileChainId, compileChainDepth }, ...)`. `compile()` checks `hookStore.getStore()?.inHook` — if true, skips all plugin hooks (transform, observer, resolve) for the inner compile. The same store also carries compile-chain metadata for loop bounding.

Deferred dispatch must explicitly clear hook context:

- Node 20+ propagates `AsyncLocalStorage` across `queueMicrotask` and Promise callbacks.
- Therefore, deferred hooks are wrapped with `hookStore.run({ inHook: false, deferred: true, compileChainId, compileChainDepth }, ...)` before invoking plugin code.
- Without this explicit context reset, deferred hooks would be incorrectly treated as in-hook and would always trigger guarded compiles.

```js
import { AsyncLocalStorage } from 'node:async_hooks';
const hookStore = new AsyncLocalStorage();
// In runHook, runPipeline, and runResolve:
return hookStore.run(
  { inHook: true, compileChainId, compileChainDepth },
  async () => { /* run hooks */ }
);
// In deferred dispatch:
queueMicrotask(() =>
  hookStore.run(
    { inHook: false, deferred: true, compileChainId, compileChainDepth },
    () => runSingle(...)
  )
);
// In compile:
const skipHooks = hookStore.getStore()?.inHook ?? false;
const compileChainDepth = hookStore.getStore()?.compileChainDepth ?? 0;
```

**Guarded compile behavior:** When `skipHooks` is true, the inner compile:
- Runs the full Tailwind compilation and caches the result normally
- **Does** trigger cacheStore write-through (`upsertPageArtifact`) — persistence should still happen
- **Does not** fire any plugin hooks — no `onCompileStart`, `onCompileResult`, `onCacheHit`/`Miss`, `transformClasses`, `transformCss`, or `onError`
- **Does not** run `hydrateMissingCompilePageFromStore` (the pre-hydration step) — the guarded compile is a direct compile, not a cache-lookup-then-compile flow
- Compilation failures are returned as `{ error, status }` — never thrown, never reported via `onError`

This means a plugin that calls `compile()` from `onCompileResult` will get a fully silent compile — the result is cached and persisted but no hooks fire and no errors are emitted. The caller handles errors via the return value.

**Chain-depth rejection in guarded mode:** Chain depth is checked *before* the guarded/non-guarded decision. If `compileChainDepth >= maxPluginCompileChainDepth`, the compile is rejected with `{ error, status: 429 }` regardless of `skipHooks`. However, `onError` only fires when `skipHooks` is false. In guarded mode (inside a hook), chain-depth rejection is silent — the caller gets the error return value and handles it. This is consistent: guarded compiles never fire any hooks, including `onError`.

**Deferred hooks and reentrancy:** Deferred hooks run via `queueMicrotask`, but this does **not** automatically exit `AsyncLocalStorage` context in Node 20+. The runner explicitly resets context for deferred dispatch (`inHook: false`), so deferred hooks can call full `compile()` flow.

To prevent unbounded deferred self-trigger loops, compile-chain metadata is propagated and bounded:

- Every plugin-sourced compile carries `{ compileChainId, compileChainDepth }` in hook context.
- Deferred dispatch preserves compile-chain metadata when scheduling microtasks.
- `pluginContext.compile()` increments `compileChainDepth`.
- If depth exceeds `maxPluginCompileChainDepth` (default `2`), compile is rejected with `{ error: "Plugin compile chain depth exceeded.", status: 429 }` and `onError` fires with `stage: "compile"` and `code: "PLUGIN_COMPILE_CHAIN_LIMIT"`.

This gives a hard upper bound even across deferred boundaries.

## Plugin Lifecycle

### `setup(context)` — async, called once

Called during `createCore()` after middleware is set up but before `registerRoutes()`. Receives the full context (queries, mutations, `addRoute`). Can be async (awaited with timeout). Errors are caught, reported via console.error, and do not prevent server startup — the plugin is marked as failed and its hooks are skipped.

**Timeout:** `setup()` is bounded by `setupTimeoutMs` (default: `Math.max(pluginTimeoutMs * 5, 1000)`, i.e. at least 1000ms even if `pluginTimeoutMs` is 0). If `setup()` exceeds this, the setup promise is rejected with `PLUGIN_SETUP_TIMEOUT`, the error is logged, and the plugin is marked as failed (hooks skipped). This prevents a hanging plugin from blocking server startup indefinitely.

`setupTimeoutMs` precedence chain (first non-undefined wins):
1. `plugin.setupTimeoutMs` — per-plugin override on the plugin object
2. `createCore({ setupTimeoutMs })` — global override
3. `Math.max((pluginTimeoutMs ?? 200) * 5, 1000)` — computed default (at least 1000ms)

A value of `0` at any level disables the timeout entirely (**unsafe — a hanging `setup()` blocks server startup indefinitely**). This is strongly discouraged. If a plugin needs extended setup time (e.g., warming hundreds of pages), set a large explicit timeout (e.g., `30000`) rather than disabling it.

### Setup activation order

Plugins are set up sequentially in array order. A plugin becomes **hook-active** (its hooks are registered and will fire) only after its own `setup()` completes successfully. This means:

- If plugin A calls `compile()` during `setup()`, only hooks from plugins that have already completed setup will run. Hooks from plugin A itself and later plugins are skipped.
- This is by design: it prevents dependency on uninitialized plugins and makes the activation order deterministic.
- If a plugin needs to warm cache with all hooks active, it should schedule warming after setup returns (e.g., via `setTimeout` or by exposing a `warmCache()` method called externally).

### `teardown()` — async, called on cleanup

`createCore()` returns `{ app, close }`. Calling `close()` invokes `teardown()` on all plugins (in reverse order, with the same `withTimeout` mechanism). `close()` is idempotent — calling it multiple times is safe (subsequent calls are no-ops).

**Shutdown contract:** `close()` only tears down plugins — it does not close the HTTP server. The caller is responsible for stopping the server before calling `close()`. This is because `createCore()` doesn't own the server (the caller calls `app.listen()`).

```js
// Correct shutdown sequence for embedded usage:
const { app, close } = await createCore({ ... });
const server = app.listen(3001);

// On shutdown:
await new Promise(resolve => server.close(resolve));  // 1. stop accepting, drain in-flight
await close();                                         // 2. teardown plugins
```

Calling `close()` while the server is still accepting requests is **explicitly unsupported**. `close()` tears down plugin state (closes DB connections, stops intervals, etc.) — requests arriving after teardown may hit uninitialized plugin state and produce undefined behavior. The shutdown contract is: stop the server first, then call `close()`. The documentation and examples will make this the only demonstrated pattern.

## Hook Changes

### Context in every hook

Every existing observer hook (`onCompileStart`, `onCompileResult`, etc.) now receives the query and mutation functions in its context object. So any hook can query state during a request.

### New enrichment hooks (pipeline — sequential, each modifies value)

| Hook | When | Input `value` | Expected return |
| --- | --- | --- | --- |
| `transformClasses` | After class resolution, before CSS generation | `string[]` (sorted classes) | `string[]` or `undefined` to skip |
| `transformCss` | After CSS generation, before caching | `string` (CSS) | `string` or `undefined` to skip |
| `transformSuggestions` | After suggestions are collected, before response | `string[]` (suggestions) | `string[]` or `undefined` to skip |

Context for all transform hooks includes `projectId`, `pageId` (where applicable), `bundle`, and the query/mutation functions.

#### Post-transform validation and error semantics

**`transformClasses` preserves existing error semantics:**
1. If result is not an array, skip (use previous value)
2. Deduplicate via `new Set()`
3. Filter out invalid classes using `filterValidClasses()` (same validation as compile)
4. If count exceeds `config.maxClassCount` → return 413 error (same as normal compile, not truncate)
5. Sort alphabetically
6. If result is empty after filtering → return 400 error `"No valid classes found."` (same as normal compile)

This means `transformClasses` cannot silently change error behavior. If a plugin empties the class list or inflates it beyond the limit, the same 400/413 errors fire as if the user had sent that input. Plugins that want to allow empty results should handle that in a different way (e.g., `resolvePageCss`).

**`transformCss`:**
1. If result is not a string, skip (use previous value)
2. Enforce `config.maxCssChars` — if CSS length exceeds limit, skip (use previous value) and fire `onError` with `stage: "transform"`, `hook: "transformCss"`

**`transformSuggestions`:**
1. If result is not an array, skip (use previous value)
2. Filter non-string entries
3. De-duplicate while preserving order
4. Enforce `effectiveLimit = Math.min(context.limit ?? config.suggestLimit, config.suggestLimit)` — truncate to `effectiveLimit`

### New resolve hooks (first-wins — first non-null return short-circuits)

| Hook | When | Expected return |
| --- | --- | --- |
| `resolvePageCss` | `GET /api/css` cache miss (after in-memory + cacheStore miss) | `{ css }` or `null` |
| `resolveProjectCss` | `GET /api/projects/:id/css` cache miss | `{ css, hash? }` or `null` |

These run after the normal cache lookup chain. If a plugin returns a result, it's served directly. If all return `null`, the existing 404 behavior applies.

#### Resolve payload validation

Before serving a resolve result:
1. `css` must be a string — otherwise skip (treat as `null`, try next plugin)
2. `css.length` must not exceed `config.maxCssChars` — otherwise skip, fire `onError` with `stage: "resolve"`, `hook: "resolvePageCss"/"resolveProjectCss"`

**Resolved CSS is one-shot** — it's served directly and not hydrated into in-memory cache or cacheStore. The resolve hook fires on every cache miss. If the plugin wants caching, it manages its own cache internally. If the plugin wants to populate the core cache, it should call `hydratePageArtifact()` or `compile()` separately. This keeps the core's cache invariants clean (every cached page has a validated class set and hash).

### Hook payload `source` and `request` fields

All hooks now include `source` and `request` in their context. These fields tell plugins where the action originated:

| Hook(s) | `source` values | `request` |
| --- | --- | --- |
| `onCompileStart`, `onCompileResult`, `onCacheHit`, `onCacheMiss` | `"http"` or `"plugin"` | `{ ip, method, path }` or `null` |
| `onRequestStart`, `onResponseSent` | `"http"` (always — these only fire for HTTP) | `{ ip, method, path }` |
| `onProjectCss` | `"http"` (always — only fires from project CSS route) | `{ ip, method, path }` |
| `onSuggest` | `"http"` (always — only fires from suggest route) | `{ ip, method, path }` |
| `onError` | `"http"`, `"plugin"`, or `"cache-store"` | `{ ip, method, path }` or `null` |
| `transformClasses`, `transformCss` | `"http"` or `"plugin"` | `{ ip, method, path }` or `null` |
| `transformSuggestions` | `"http"` (always — only fires from suggest route) | `{ ip, method, path }` |
| `resolvePageCss`, `resolveProjectCss` | `"http"` (always — only fires from CSS routes) | `{ ip, method, path }` |

Rules:
- Hooks that only fire from HTTP routes always have `source: "http"` and a real `request` object.
- Hooks that can fire from both HTTP and plugin `compile()` have `source` set by the caller and `request: null` for plugin calls.
- `onError` inherits `source` from the operation that failed. CacheStore errors use `source: "cache-store"`.
- This is **additive** — existing plugins that don't read `source`/`request` are unaffected.

### Latency budget

Pipeline hooks run sequentially per plugin, each bounded by the plugin's `timeoutMs`. Worst case for a single request with N plugins: `N × timeoutMs` additional latency. This is acceptable because:

1. `timeoutMs` defaults to 200ms — even with 5 plugins, max overhead is 1s
2. Transform hooks that do I/O should set a low `timeoutMs` on the plugin
3. Fail-open: timeout skips that plugin, doesn't fail the request
4. Resolve hooks short-circuit on first non-null — typically only one plugin runs

No global per-request budget is enforced. The per-plugin timeout is the mechanism. Plugin authors control their own latency contribution.

## Implementation in `services/index.js`

### New functions

**`buildPluginContext(state, config)`** — returns object with all query/mutation functions. Uses existing cache helpers internally (`evictPageByKey`, `makePageKey`, `hydratePageFromArtifact`, `sanitizePageArtifact`, `sanitizeProjectArtifact`, `isValidId`, etc.). The `compile()` and `hydratePageArtifact()` functions need `pluginRunner` for transform hooks, so they are added to the context after `pluginRunner` is created (context object is initially mutable, frozen after all wiring is done).

Query functions (`getCss`, `getProjectCss`) are implemented as pure peeks:
- `getCss`: reads `page.css`/`page.utilitiesCss`/`page.themeCss` directly, returns copy or `null`
- `getProjectCss`: reads `project.cssCache`/etc. directly, returns copy or `null`
- Neither touches TTL, LRU order, or triggers computation

**`mountPluginRoutes(app, pluginList, pluginContext, setupTimeoutMs)`** — iterates plugins sequentially:

```js
async function mountPluginRoutes(app, pluginList, pluginContext, setupTimeoutMs) {
    for (const plugin of pluginList) {
        const router = express.Router();
        let setupDone = false;

        const addRoute = (method, routePath, handler) => {
            if (setupDone) throw new Error('addRoute is only available during setup().');
            const m = String(method).toLowerCase();
            if (!['get','post','put','delete','patch'].includes(m)) throw new Error(`Invalid HTTP method "${method}".`);
            if (!routePath || !/^\/[a-zA-Z0-9/_:.\-]*$/.test(routePath) || routePath.includes('..'))
                throw new Error(`Invalid route path "${routePath}".`);
            if (typeof handler !== 'function') throw new Error('Route handler must be a function.');
            router[m](routePath, handler);
        };

        try {
            if (typeof plugin.instance.setup === 'function') {
                const perPluginTimeout = plugin.instance.setupTimeoutMs ?? setupTimeoutMs;
                await withTimeout(
                    Promise.resolve(plugin.instance.setup({ ...pluginContext, addRoute })),
                    perPluginTimeout
                );
            }
            plugin.active = true;
            app.use(`/plugins/${plugin.routeName}`, router);
        } catch (error) {
            console.error(`Plugin "${plugin.name}" setup failed:`, error.message);
            plugin.failed = true;
        }
        setupDone = true;  // lock addRoute for this plugin regardless of success/failure
    }
}
```

Key details:
1. One `express.Router()` per plugin — routes collected during `setup()`, mounted after success
2. `addRoute` pushes to the router immediately (express routers support dynamic route addition)
3. On failure: plugin's router is never mounted (no orphan routes), plugin is marked `failed`
4. `setupDone` lock is per-plugin (each plugin gets its own closure)
5. Per-plugin `setupTimeoutMs` override: `plugin.instance.setupTimeoutMs ?? setupTimeoutMs`

### Changes to `createPluginRunner`

- Validate plugin names (charset, length, uniqueness) — throw on violation
- Add `active` flag per plugin (starts `false`, set `true` after setup succeeds)
- Add `failed` flag per plugin (set `true` on setup failure — hooks permanently skipped)
- `runSingle` skips plugins where `active === false` or `failed === true`
- Add `runPipeline(hook, context, initialValue)` — sequential, fail-open. Each plugin's hook receives `{ ...context, value }` and returns a new value or `undefined`. If a plugin throws/times out, its step is skipped (previous value carries forward).
- Add `runResolve(hook, context, config)` — first non-null wins, fail-open, **validation centralized inside runner**. Each plugin's hook receives context and returns `{ css, ... }` or `null`. Each non-null return is validated inside `runResolve` (css must be string, must not exceed `config.maxCssChars`). Invalid payloads are treated as `null` (try next plugin, fire `onError` with `stage: "resolve"`). First valid return short-circuits. Routes call `runResolve` and serve the result directly — no route-level validation needed.
- Update `shouldDefer` — `transform*` and `resolve*` hooks are never deferred, regardless of `defer`/`deferHooks` settings
- Use `AsyncLocalStorage` for reentrancy detection and compile-chain tracking — `runHook`, `runPipeline`, and `runResolve` wrap hook execution in `hookStore.run({ inHook: true, compileChainId, compileChainDepth }, ...)`. Deferred dispatch resets `inHook` but preserves chain metadata. `compile()` checks `hookStore.getStore()?.inHook` to decide whether to skip all hooks and enforces `maxPluginCompileChainDepth`.
- Expose `list` in return value
- Include `pluginContext` in every `runHook`/`runPipeline`/`runResolve` call's context object

### Changes to `createCore()`

```js
export async function createCore({ plugins, pluginTimeoutMs, setupTimeoutMs, maxPluginCompileChainDepth, config: configOverrides, cacheStore, cacheStoreTimeoutMs } = {}) {
    // Validate and clamp maxPluginCompileChainDepth: must be integer >= 1, default 2.
    // 0 or negative is invalid (would reject ALL plugin compiles). Use 1 for strictest useful limit.
    const chainDepthLimit = Math.max(1, parseIntWithDefault(maxPluginCompileChainDepth, 2, 1));
    const config = buildConfig(configOverrides);
    const state = createCacheState();
    const app = express();
    // ... middleware setup (security headers, json parsing, rate limiting) ...

    const pluginContext = buildPluginContext(state, config);
    const pluginRunner = createPluginRunner(plugins, { timeoutMs: pluginTimeoutMs, pluginContext });

    // Create cacheStoreRunner BEFORE plugin setup, so compile() can write-through during setup()
    const cacheStoreRunner = createCacheStoreRunner(cacheStore, {
        timeoutMs: cacheStoreTimeoutMs,
        onError: (context) => pluginRunner.runHook('onError', context)
    });

    // Wire compile/hydrate after pluginRunner and cacheStoreRunner exist
    pluginContext.compile = async (input) => {
        const { projectId, pageId, html, classes, bundle } = input || {};
        // 1. Validate inputs using isValidId + config limits
        if (!projectId || !isValidId(projectId, config)) return { error: 'Invalid projectId.', status: 400 };
        if (!pageId || !isValidId(pageId, config)) return { error: 'Invalid pageId.', status: 400 };
        if (html && typeof html === 'string' && html.length > config.maxHtmlChars) return { error: 'html too large.', status: 413 };
        if (classes && typeof classes === 'string' && classes.length > config.maxClassChars) return { error: 'classes too large.', status: 413 };

        // 2. Read ALS for reentrancy + chain depth
        const store = hookStore.getStore();
        const skipHooks = store?.inHook ?? false;
        const currentDepth = store?.compileChainDepth ?? 0;

        // 3. Chain depth enforcement (before guarded/non-guarded decision)
        if (currentDepth >= chainDepthLimit) {
            const err = { error: 'Plugin compile chain depth exceeded.', status: 429 };
            if (!skipHooks) {
                await pluginRunner.runHook('onError', {
                    error: new Error(err.error), stage: 'compile', source: 'plugin',
                    code: 'PLUGIN_COMPILE_CHAIN_LIMIT', context: { projectId, pageId, bundle }
                });
            }
            return err;
        }

        // 4. Compile (hooks, cacheStore write-through, and pre-hydration handled inside)
        return compileAndCachePage({
            state, config, projectId, pageId, html, classes, bundle,
            pluginRunner, cacheStoreRunner,
            skipHooks,
            source: 'plugin',
            request: null
        });
    };
    pluginContext.hydratePageArtifact = (input) => { /* ... */ };
    pluginContext.hydrateProjectArtifact = (input) => { /* ... */ };
    Object.freeze(pluginContext);

    const defaultSetupTimeout = Math.max((pluginTimeoutMs ?? 200) * 5, 1000);
    await mountPluginRoutes(app, pluginRunner.list, pluginContext, setupTimeoutMs ?? defaultSetupTimeout);

    registerRoutes(app, pluginRunner, config, state, cacheStoreRunner);

    let closePromise = null;
    const close = () => {
        if (closePromise) return closePromise;
        closePromise = (async () => {
            for (const plugin of [...pluginRunner.list].reverse()) {
                if (typeof plugin.instance.teardown === 'function') {
                    try {
                        await withTimeout(Promise.resolve(plugin.instance.teardown()), plugin.timeoutMs);
                    } catch { /* teardown errors are silent */ }
                }
            }
        })();
        return closePromise;
    };

    return { app, close };
}
```

### API change (breaking)

`createCore()` is now async and returns `{ app, close }`. There is no legacy compatibility layer.

Required caller changes:

1. Replace `const app = createCore(...)` with `const { app, close } = await createCore(...)`.
2. Use shutdown order `server.close()` first, then `await close()`.
3. Update all tests/docs/examples to the async factory pattern.

### CLI entry change

```js
if (isDirectRun) {
    createCore().then(({ app, close }) => {
        const server = app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
        const shutdown = async () => {
            await new Promise((resolve) => server.close(resolve));  // drain in-flight requests
            await close();   // then teardown plugins
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    });
}
```

### Changes to `compileAndCachePage()`

**New signature:**

```js
async function compileAndCachePage({
    state, config, projectId, pageId, html, classes, bundle,
    pluginRunner,       // required — the plugin runner instance
    cacheStoreRunner,   // required — the cache store runner instance
    skipHooks,          // boolean — true when called from inside a hook (reentrancy guard)
    source,             // "http" | "plugin" — origin of this compile
    request             // { ip, method, path } | null — HTTP request context (null for plugin calls)
})
```

Both the HTTP route handler and `pluginContext.compile()` call this same function. The route handler passes `{ source: "http", request: { ip, method, path }, skipHooks: false }`. The plugin wrapper passes `{ source: "plugin", request: null, skipHooks: hookStore.getStore()?.inHook ?? false }`.

**CacheStore write-through moves inside `compileAndCachePage`.** The route handler no longer does its own `queueStoreWrite` — the function handles it internally. This eliminates the duplication between the HTTP path and the plugin path:

```js
// Inside compileAndCachePage, after successful compile + cache:
if (cacheStoreRunner?.enabled && normalizedBundle !== 'base') {
    const now = Date.now();
    queueMicrotask(() => {
        cacheStoreRunner.upsertPageArtifact({
            projectId, pageId, bundle: normalizedBundle,
            css, hash: classHash, classes: resolvedClasses,
            cached: false, updatedAt: now, expiresAt: now + config.cacheTtlMs
        }).catch(() => {});
    });
}
```

**Observer hooks fire inside the function** (gated by `skipHooks`), using the `source` and `request` parameters:

```js
// Before compilation:
if (!skipHooks) {
    await pluginRunner.runHook('onCompileStart', {
        projectId, pageId, bundle, html, classes, source, request
    });
}

// After compilation:
if (!skipHooks) {
    if (result.cached) {
        await pluginRunner.runHook('onCacheHit', { projectId, pageId, bundle: normalizedBundle, source, request });
    } else {
        await pluginRunner.runHook('onCacheMiss', { projectId, pageId, bundle: normalizedBundle, source, request });
    }
    await pluginRunner.runHook('onCompileResult', {
        projectId, pageId, bundle: normalizedBundle, css, classes: resolvedClasses,
        hash: classHash, cached: result.cached, source, request
    });
}

// Error paths:
if (!skipHooks) {
    await pluginRunner.runHook('onError', {
        error, stage: 'compile', source, request,
        context: { projectId, pageId, bundle }
    });
}
```

**Pre-hydration is also gated by `skipHooks`** (guarded compiles skip it):

```js
if (!skipHooks) {
    await hydrateMissingCompilePageFromStore(state, config, cacheStoreRunner, projectId, pageId, bundle);
}
```

**Transform hooks:**

- After `resolveClassesFromInput()`:
  ```js
  if (!skipHooks) {
      classes = await pluginRunner.runPipeline('transformClasses', { projectId, pageId, bundle, source, request }, classes)
      // Post-validation: dedupe, filterValidClasses, maxClassCount (413), empty check (400), sort
  }
  ```
- After CSS generation:
  ```js
  if (!skipHooks) {
      css = await pluginRunner.runPipeline('transformCss', { projectId, pageId, bundle, source, request }, css)
      // Post-validation: string check, maxCssChars guard
  }
  ```

**Route handler simplification.** The HTTP compile route reduces to:

```js
app.post('/api/compile', async (req, res) => {
    // ... input validation (projectId, pageId, html, classes, bundle) ...
    withRequestHooks(req, res, hookContext);

    const result = await compileAndCachePage({
        state, config, projectId, pageId, html, classes, bundle,
        pluginRunner, cacheStoreRunner,
        skipHooks: false,
        source: 'http',
        request: { ip: getClientIp(req), method: req.method, path: req.path }
    });

    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ success: true, projectId, pageId, bundle: result.bundle, hash: result.hash, classes: result.classes, cached: result.cached, css: result.css });
});
```

The route no longer calls `pluginRunner.runHook('onCompileStart', ...)`, `pluginRunner.runHook('onCompileResult', ...)`, `pluginRunner.runHook('onCacheHit', ...)`, `pluginRunner.runHook('onCacheMiss', ...)`, `pluginRunner.runHook('onError', ...)`, or `cacheStoreRunner.upsertPageArtifact(...)` directly — all of this is handled inside `compileAndCachePage`.

### Changes to suggest route

The suggest route is refactored from incremental push-then-early-return to collect-all-then-transform-then-cap. This is necessary because `transformSuggestions` plugins need to see the full suggestion set, not a pre-truncated subset.

```js
app.post('/api/suggest', async (req, res) => {
    // ... input validation (projectId, prefix, limit, includeInput) ...
    withRequestHooks(req, res, hookContext);

    // Phase 1: Collect ALL candidates (no limit enforcement yet)
    const seen = new Set();
    const allSuggestions = [];
    const push = (list) => {
        for (const item of list) {
            if (!item || (prefix && !item.startsWith(prefix))) continue;
            if (!seen.has(item)) { seen.add(item); allSuggestions.push(item); }
        }
    };
    if (includeInput.length) push(includeInput);
    if (projectId) push(getProjectSuggestionList(state, projectId));
    if (config.suggestFallback && prefix) {
        const staticList = await getStaticClassSuggestions(prefix);
        push(staticList.length ? staticList : getFallbackSuggestions(prefix));
    }

    // Phase 2: Run transform pipeline
    let suggestions = allSuggestions;
    suggestions = await pluginRunner.runPipeline('transformSuggestions',
        { projectId, prefix, limit, source: 'http', request: { ip: getClientIp(req), method: req.method, path: req.path } },
        suggestions
    );

    // Phase 3: Post-validation
    if (!Array.isArray(suggestions)) suggestions = allSuggestions;  // fallback
    suggestions = suggestions.filter(s => typeof s === 'string');
    suggestions = [...new Map(suggestions.map(s => [s, true])).keys()];  // dedupe preserving order
    const effectiveLimit = Math.min(limit, config.suggestLimit);
    suggestions = suggestions.slice(0, effectiveLimit);

    // Phase 4: Respond
    await pluginRunner.runHook('onSuggest', { projectId, prefix, suggestions });
    res.json({ success: true, projectId, prefix, count: suggestions.length, suggestions });
});
```

**Behavioral change:** Previously, suggestions were capped to `limit` during collection (early return on reaching limit). Now all candidates are collected first, then plugins can reorder/filter/add, then the limit is enforced. This means plugins see more data and have more control. The final `effectiveLimit` still respects both the per-request `limit` and the global `config.suggestLimit`.

### Changes to `GET /api/css` route

- After in-memory miss + cacheStore miss, before returning 404:
  ```
  const resolved = await pluginRunner.runResolve('resolvePageCss', ctx, config)
  ```
- If `resolved` is non-null (already validated by `runResolve`), serve `resolved.css` directly (one-shot, not cached)

### Changes to `GET /api/projects/:id/css` route

- After in-memory miss + cacheStore miss, before returning 404:
  ```
  const resolved = await pluginRunner.runResolve('resolveProjectCss', ctx, config)
  ```
- If `resolved` is non-null (already validated by `runResolve`), serve `resolved.css` directly (one-shot, not cached)

## What plugins can build

| Plugin type | Uses |
| --- | --- |
| Analytics dashboard | `setup` + `addRoute` + `getClassCounts` + `getCacheStats` + `getPageIds` |
| Theme enforcer | `transformClasses` + `validateClasses` (filter disallowed, validate additions) |
| CSS post-processor | `transformCss` (minify, autoprefix, add headers) |
| Bundle optimizer | `addRoute` + `getClassCounts` + `getPageIds` (frequency analysis endpoint) |
| Custom suggestion logic | `transformSuggestions` + `validateClasses` (reorder, filter, add custom validated classes) |
| External cache layer | `resolvePageCss` + `resolveProjectCss` (serve from Redis/CDN on miss) |
| Cache management | `addRoute` + `evictPage` + `evictProject` + `getCacheStats` (admin endpoints) |
| Usage monitoring | `onCompileResult` + `getClassCounts` (observe + query in same hook) |
| Cache warmer (compile) | `setup` + `compile` (compile from source HTML/classes on startup) |
| Cache warmer (hydrate) | `setup` + `hydratePageArtifact` (restore pre-built artifacts from Redis/DB on startup) |
| Webhook recompiler | `addRoute` + `compile` (recompile pages on external trigger) |
| Custom CSS endpoint | `addRoute` + `getCss` + `getProjectCss` (serve with custom auth/headers/format) |
| Class auditor | `addRoute` + `getPageClasses` + `validateClasses` (find invalid/unused classes across pages) |
| Persistence bridge | `setup` + `hydratePageArtifact` + `onCompileResult` (hydrate on start, persist on compile) |

## Files

**Modify:**
- `services/index.js` — buildPluginContext, mountPluginRoutes, runPipeline, runResolve, shouldDefer, name validation (case-insensitive route collision handling), active/failed plugin tracking, reentrancy guard (with deferred-context reset), compile-chain depth tracking/enforcement, compile input validation, compileAndCachePage wiring, suggest wiring (per-request effective limit), css route wiring, async `createCore` return shape (`{ app, close }`), CLI shutdown order, close idempotency
- `docs/plugin-system.md` — document new capabilities

**Update existing tests:**
- Update all `createCore()` call sites to `await createCore()` and destructure `{ app }` or `{ app, close }`.
- Add/update lifecycle tests for `close()` behavior.

**Add:**
- `tests/plugin-capabilities.test.js`

## Verification

1. `npm test` — all existing tests pass after converting to async `createCore()` usage.
2. New tests cover:
   - Query functions return frozen snapshots
   - `getCss()` is a pure peek (no TTL refresh, no computation on miss)
   - `getProjectCss()` is a pure peek (no compilation triggered)
   - `getCacheStats()` reflects current LRU state
   - `validateClasses()` returns only valid Tailwind utilities
   - Mutation functions (evictPage, evictProject) work correctly
   - `evictProject` clears all pageLru entries for the project
   - `compile()` validates projectId/pageId/html/classes inputs
   - `compile()` rejects invalid IDs with `{ error, status }` (not throw)
   - `compile()` from plugin context populates cache correctly (page in LRU, class counts updated)
   - `compile()` during `setup()` warms cache before server handles requests
   - `compile()` runs transform hooks from other plugins
   - `compile()` inside a transform hook skips transform hooks (reentrancy guard, per-request not global)
   - Concurrent requests with transform hooks don't interfere (AsyncLocalStorage isolation)
   - `hydratePageArtifact` injects artifact into cache (page in LRU, class counts updated)
   - `hydratePageArtifact` rejects invalid artifacts (bad css, oversized, expired)
   - `hydratePageArtifact` does not run transform hooks
   - `hydrateProjectArtifact` injects aggregate CSS into project cache
   - Plugin routes mount at `/plugins/<plugin-route-name>/` and respond
   - Plugin routes are rate-limited (same global middleware)
   - `transformClasses` filters classes from compile output
   - `transformClasses` output is re-validated (dedupe, sort, filterValid)
   - `transformClasses` resulting in empty classes returns 400 (preserves error semantics)
   - `transformClasses` resulting in too many classes returns 413 (preserves error semantics)
   - `transformCss` modifies CSS in response
   - `transformCss` output exceeding maxCssChars is rejected (previous value used)
   - `transformSuggestions` modifies suggestion results
   - `resolvePageCss` short-circuits cache miss with plugin-provided CSS
   - `resolveProjectCss` short-circuits project cache miss
   - `resolve*` with invalid payload (missing css, oversized css) is rejected fail-open
   - Resolved CSS is one-shot (subsequent miss still misses without resolve plugin)
   - Throwing/timing-out transform/resolve hooks fall through
   - `setup()` errors are caught and don't prevent server startup
   - `setup()` timeout causes plugin to be marked failed (hooks skipped permanently)
   - Plugin A's `compile()` during setup skips hooks from not-yet-setup plugin B
   - `teardown()` is called on close in reverse order
   - `close()` is idempotent (second call is no-op)
   - Shutdown order: server stops first, then teardown
   - Hook context includes query/mutation functions
   - Duplicate plugin names throw during `createCore()`
   - Case-only name collisions (`Foo` vs `foo`) throw during plugin registration
   - Invalid plugin names (bad charset, too long) throw during `createCore()`
   - Invalid route methods/paths rejected during `setup()`
   - `addRoute` after `setup()` returns throws
   - Auto-assigned names (`plugin-1`, `plugin-2`) don't collide with explicit names
   - `compile()` fires onCompileStart/onCompileResult/onCacheHit|Miss (same as HTTP)
   - `compile()` triggers cacheStore write-through (upsertPageArtifact)
   - `hydrateProjectArtifact` returns false when project doesn't exist
   - `hydrateProjectArtifact` succeeds after pages are hydrated
   - `setupTimeoutMs` defaults to at least 1000ms even when pluginTimeoutMs=0
   - `setupTimeoutMs=0` means no timeout (setup runs indefinitely)
   - Shutdown drains in-flight requests before teardown
   - `getCss` with bundle=base returns cached base CSS or null (no generation)
   - `getProjectCss` with bundle=base returns cached base CSS or null
   - `compile()` from observer hook (onCompileResult) triggers reentrancy guard (all hooks skipped)
   - `compile()` from resolve hook (resolvePageCss) triggers reentrancy guard
   - Guarded compile still does cacheStore write-through
   - Guarded compile does not run hydrateMissingCompilePageFromStore
   - HTTP compile hooks include `source: "http"` and `request` object
   - Plugin compile hooks include `source: "plugin"` and `request: null`
   - Plugin compile error fires `onError` with `stage: "compile"`, `source: "plugin"`
   - `hydratePageArtifact` without classes on new page returns false
   - `hydratePageArtifact` without classes on existing page updates CSS only (keeps existing classes)
   - Deferred hook calling `compile()` is not guarded (runs full hooks) because deferred dispatch clears ALS hook context
   - ALS propagation through `queueMicrotask` does not cause false-positive guarded compiles (explicit reset works)
   - Deferred/self-trigger compile loops are bounded by `maxPluginCompileChainDepth` across deferred boundaries
   - `transformSuggestions` never exceeds request `limit` (and also never exceeds global `suggestLimit`)
   - `close()` called concurrently by two callers — both await same shutdown
   - `runResolve` validates payload internally (invalid css skips to next plugin)
   - `runResolve` with oversized CSS fires `onError` with `stage: "resolve"`
   - `getConfig()` returns shallow-frozen object (all values are primitives today)
   - `createCore()` is async, returns `{ app, close }`, and all CLI/docs/examples use `await createCore()`
   - Chain-depth rejection in guarded mode is silent (no `onError`, caller gets `{ error, status: 429 }`)
   - Chain-depth rejection in non-guarded mode fires `onError` with `code: "PLUGIN_COMPILE_CHAIN_LIMIT"`
   - `maxPluginCompileChainDepth` is clamped to >= 1 (0 or negative treated as 1)
   - `maxPluginCompileChainDepth=0` is treated as 1 (not disable — disabling chain limits is not supported)
   - `transformSuggestions` sees full un-capped suggestion list (collect-all-then-transform-then-cap)
   - Suggest route `transformSuggestions` post-validation filters non-strings, dedupes, then enforces effectiveLimit
   - `onProjectCss` hook includes `source: "http"` and `request` object
   - `onSuggest` hook includes `source: "http"` and `request` object
   - Plugins without `setup()` are marked active immediately (setup is optional)
   - Per-plugin `setupTimeoutMs` overrides global `setupTimeoutMs`
   - Failed plugin's routes are never mounted (no orphan routes)

## Implementation Order

Six phases, each ending with `npm test` passing. No phase depends on a later phase. Each phase can be a separate commit.

### Phase 1: Make `createCore()` async + return `{ app, close }` (no new features)

**Goal:** Land the breaking API change with zero new functionality. Every existing test must pass after this.

1. Change `createCore()` to `async function createCore()` and return `{ app, close }` where `close` is a no-op async function (placeholder for teardown).
2. Update CLI entry to `createCore().then(({ app, close }) => { ... })` with SIGTERM/SIGINT shutdown.
3. Update **every test file** that calls `createCore()`:
   - `tests/api.test.js` — `const { app } = await createCore()` in `beforeAll`
   - `tests/cache.test.js` — same
   - `tests/cache-eviction.test.js` — same
   - `tests/cache-store.test.js` — same
   - `tests/config.test.js` — same
   - `tests/limits.test.js` — same
   - `tests/plugins.test.js` — same
   - `tests/rate-limit.test.js` — same
   - `tests/library-import.test.js` — check if it calls `createCore`
   - `tests/docs-catalog.test.js` — check if it calls `createCore`
   - `tests/docs-examples.test.js` — check if it calls `createCore`
4. Run `npm test`. All tests must pass. This is the checkpoint.

**Why first:** Every subsequent phase builds on the async factory. Getting this right in isolation avoids conflating API changes with feature work.

### Phase 2: Plugin identity + `createPluginRunner` changes (no hooks yet)

**Goal:** Name validation, `active`/`failed` flags, `list` exposure, `routeName` computation. No new hook types yet.

1. Add name validation to `createPluginRunner`: regex check, length check, case-insensitive collision check.
2. Add `routeName = name.toLowerCase()` to each plugin entry.
3. Add `active` (starts `false`) and `failed` (starts `false`) flags to each plugin entry.
4. Update `runSingle` to skip plugins where `!active || failed`.
5. Expose `list` in the return value: `return { runHook, list }`.
6. Add `AsyncLocalStorage` import and `hookStore` creation. Wrap `runHook` dispatch in `hookStore.run(...)`. Update deferred dispatch to reset `inHook`.
7. Add tests:
   - Duplicate names throw
   - Case collisions throw
   - Invalid names throw
   - Auto-assigned names work
8. Run `npm test`. All tests pass. Existing plugin tests still pass because all plugins are `active = false` by default, but they don't use `setup()` so this needs a tweak — for backward compat in this phase, set `active = true` immediately for plugins that don't have a `setup()` function. (Phase 3 changes this to require `mountPluginRoutes`.)

### Phase 3: Plugin lifecycle (`setup`, `teardown`, `close`, `mountPluginRoutes`)

**Goal:** Plugins can set up, register routes, and tear down. No new hook types or context functions yet.

1. Implement `mountPluginRoutes(app, pluginList, pluginContext, setupTimeoutMs)` with the Router-per-plugin pattern.
2. Implement `buildPluginContext(state, config)` with **query functions only** (no mutations yet). Wire `getProjectIds`, `getClassCounts`, `getPageIds`, `getPageClasses`, `getPageMeta`, `getCss`, `getProjectCss`, `getCacheStats`, `getConfig`, `validateClasses`.
3. Update `createCore()`:
   - Create `pluginContext` via `buildPluginContext`
   - Pass `pluginContext` to `createPluginRunner`
   - Call `await mountPluginRoutes(...)` between `createPluginRunner` and `registerRoutes`
   - Implement real `close()` with reverse-order teardown and idempotent promise caching
   - Set `active = true` only after successful setup (remove the Phase 2 backward-compat tweak — now `mountPluginRoutes` controls activation)
4. For plugins without `setup()`: `mountPluginRoutes` still marks them `active = true` (setup is optional).
5. Add tests:
   - `setup()` is called, `teardown()` is called on `close()`
   - `setup()` error marks plugin as failed
   - `setup()` timeout marks plugin as failed
   - `close()` is idempotent
   - Reverse teardown order
   - `addRoute` works during setup, throws after
   - Plugin routes mount and respond
   - Plugin routes are rate-limited
   - Query functions return frozen snapshots
   - `getCss`/`getProjectCss` are pure peeks
   - Hook context includes query functions
6. Run `npm test`. All tests pass.

### Phase 4: Mutation functions + `compileAndCachePage` refactoring

**Goal:** Plugins can mutate cache. `compileAndCachePage` gains the new signature with `source`/`request`/`skipHooks`.

1. Refactor `compileAndCachePage` to the new signature (`{ ..., pluginRunner, cacheStoreRunner, skipHooks, source, request }`). Move observer hooks and cacheStore write-through inside the function.
2. Update the HTTP compile route to pass the new parameters and remove its own hook/store calls.
3. Add mutation functions to `pluginContext`: `evictPage`, `evictProject`, `hydratePageArtifact`, `hydrateProjectArtifact`.
4. Wire `pluginContext.compile()` — validates input, reads ALS for `skipHooks`/`compileChainDepth`, calls `compileAndCachePage`, enforces `maxPluginCompileChainDepth`.
5. Freeze `pluginContext` after all wiring.
6. Add `source: "http"` and `request` fields to all hook call sites in routes (not just compile — also CSS routes, project CSS route, suggest route).
7. Add tests:
   - `compile()` from plugin context works
   - `compile()` validates inputs
   - `compile()` fires hooks with `source: "plugin"`, `request: null`
   - HTTP compile fires hooks with `source: "http"`, `request` object
   - `evictPage`/`evictProject` work
   - `hydratePageArtifact`/`hydrateProjectArtifact` work
   - `compile()` during `setup()` warms cache
   - Reentrancy guard (compile inside hook skips hooks)
   - Chain depth enforcement
   - Guarded compile still writes to cacheStore
   - Chain-depth rejection in guarded mode is silent
8. Run `npm test`. All tests pass.

### Phase 5: Pipeline + resolve hooks

**Goal:** `transformClasses`, `transformCss`, `transformSuggestions`, `resolvePageCss`, `resolveProjectCss`.

1. Add `runPipeline(hook, context, initialValue)` to `createPluginRunner`.
2. Add `runResolve(hook, context, config)` to `createPluginRunner` with centralized validation.
3. Update `shouldDefer` — `transform*` and `resolve*` hooks are never deferred.
4. Wire `transformClasses` and `transformCss` into `compileAndCachePage` (gated by `skipHooks`). Add post-validation for each.
5. Wire `transformSuggestions` into the suggest route (collect-all-then-transform-then-cap refactoring).
6. Wire `resolvePageCss` into `GET /api/css` route (after cache miss, before 404).
7. Wire `resolveProjectCss` into `GET /api/projects/:id/css` route (after cache miss, before 404).
8. Add tests:
   - All transform hook tests (filters, re-validation, empty/oversize rejection)
   - All resolve hook tests (short-circuit, invalid payload, one-shot)
   - Throwing/timing-out hooks fall through
   - `transformSuggestions` sees full list, output is capped
9. Run `npm test`. All tests pass.

### Phase 6: Documentation + final verification

**Goal:** Update docs, add any remaining edge-case tests.

1. Rewrite `docs/plugin-system.md` to cover all new capabilities (context functions, lifecycle, new hooks, route registration, error semantics).
2. Add remaining edge-case tests:
   - Concurrent requests with AsyncLocalStorage isolation
   - Deferred hooks calling `compile()` not guarded
   - ALS propagation through `queueMicrotask` explicitly reset
   - Plugin A's `compile()` during setup skips Plugin B's hooks
3. Run full `npm test` one final time.
4. Manual smoke test: start server, compile a page, verify plugin hooks fire.
