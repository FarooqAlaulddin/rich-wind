# Plugin System

A plugin is an object with an optional `setup()`, optional `teardown()` and any of the hook methods below. Pass one or an array to `createCore({ plugins })`. Hooks you do not implement are skipped. Exact types for everything on this page: `services/index.d.ts` (`RichWindPlugin`, `PluginContext`, `PluginSetupContext` and one context type per hook).

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore({
  plugins: [{
    name: "logger",
    onCompileResult({ projectId, pageId, classes, cached }) {
      console.log(`[${projectId}/${pageId}] ${classes.length} classes, cached: ${cached}`);
    }
  }]
});

http.createServer(core.handler).listen(3001);
```

## Plugin Shape

| Member | Meaning |
| --- | --- |
| `name` | Letters, digits, `_` and `-`, at most 64 characters. Defaults to `plugin-1`, `plugin-2`, ... Two names that lowercase to the same string collide, and an invalid or colliding name throws from `createCore()`. |
| `setup(ctx)` | Runs once during `createCore()`, in plugin order. May be async. |
| `teardown()` | Runs from `core.close()`. May be async. |
| `defer`, `deferHooks` | Run observer hooks as fire-and-forget (see below). |
| `timeoutMs` | Per-hook time limit; defaults to the `pluginTimeoutMs` option of `createCore()`. |
| `setupTimeoutMs` | Time limit for `setup()`; defaults to the `setupTimeoutMs` option of `createCore()`. |

Timeouts stop core from waiting; they do not cancel the hook, which keeps running. A timeout of `0` disables the limit. Defaults: [Configuration](api-reference.html#configuration).

### Setup and teardown

`setup(ctx)` receives the plugin context (query and mutation functions, `compile`, `storage`) plus `addRoute`. If it throws or times out, the plugin is marked failed: `console.error` logs it, `onError` is not fired, its hooks never run and its routes are not mounted. Other plugins and the server are unaffected.

`teardown()` runs from `close()` after pending `cacheStore` writes drain, in reverse plugin order, bounded by the plugin's `timeoutMs` (not `setupTimeoutMs`). It runs even for plugins whose setup failed, and its errors are swallowed so every plugin gets to clean up. `close()` is idempotent; close your HTTP server first, then call `core.close()` ([Functions](api-reference.html#functions)).

```js
function counterPlugin() {
  let storage;
  let count = 0;
  return {
    name: "counter",
    async setup(ctx) {
      storage = ctx.storage;
      count = (await storage.get("count_v1"))?.count ?? 0;
    },
    onCompileResult() {
      count += 1;
    },
    async teardown() {
      await storage.set("count_v1", { count });
    }
  };
}
```

### The plugin context

The context holds read helpers (`getCss`, `getPageClasses`, `getCacheStats`, `getConfig`, `validateClasses`, ...), mutation helpers (`evictPage`, `purgePage`, `compile`, `hydratePageArtifact`, ...) and, in `setup` only, `storage` and `addRoute`. Hooks receive the same helpers but not `storage` or `addRoute`, so keep a reference from `setup`. Signatures: `PluginContext` in `services/index.d.ts`.

Three facts the types do not show:

- Reads never refresh a TTL and never build CSS.
- `evict*` is memory-only. `purge*` also deletes from the `cacheStore` (implement the delete methods listed under [cacheStore](runtime-spec.html#cachestore)).
- On a `reader` node, mutation helpers do nothing useful: [Replica Roles](runtime-spec.html#replica-roles).

`compile()` is `core.compile()`: same input as `POST /api/compile` (`pageId` defaults to `"default"`), same result body, and it throws a `RichWindError` whose `status` and `code` match the HTTP error for the same input. Called outside a parent compile it can throw `503 SERVER_BUSY` when every compile slot is in use; on a reader it throws `409 READ_ONLY_REPLICA`.

A `compile()` called from a non-deferred hook skips all hooks. From `setup`, plugin routes and deferred hooks it runs hooks with `source: "plugin"` and `request: null`, bounded by `maxPluginCompileChainDepth`. Past the bound it throws `500 INTERNAL` and `onError` receives `code: "PLUGIN_COMPILE_CHAIN_LIMIT"`.

## Hooks

Hooks run in plugin order. A hook that throws or times out never fails the request: the error goes to `onError` (`error`, `hook`, `plugin`, `timedOut`) and processing continues. `onError` itself is never deferred and its own errors are dropped.

Order for `POST /api/compile`:

```
onRequestStart
  onCompileStart
  transformClasses
  cache miss: transformCss, onCacheMiss
  cache hit:  onCacheHit            (transformCss does not run)
  onCompileResult
onResponseSent
```

The `base` bundle runs no transform hooks. `GET /api/css` runs `onCacheHit` or `onCacheMiss` (and `resolvePageCss` on a miss) between the request hooks. `POST /api/suggest` runs `transformSuggestions`, then `onSuggest`.

### Observers

Return values are ignored. Fields on each context: the matching `On*Context` type in `services/index.d.ts`.

| Hook | Fires | Notes |
| --- | --- | --- |
| `onRequestStart` / `onResponseSent` | Around a built-in route handler | Carry `action` and `request`; `onResponseSent` adds `status`, `durationMs`. Not fired for plugin routes. |
| `onCompileStart` / `onCompileResult` | Around a compile | `onCompileResult` carries `css`, `hash`, `cached`. |
| `onCacheHit` / `onCacheMiss` | Cache lookup during a compile or `GET /api/css` | During a compile `source` is the caller; on `GET /api/css` it is `"page"` or `"page-store"`, the cache layer that answered. |
| `onProjectCss` | Project CSS compiled or served | |
| `onSuggest` | Suggestions returned | |
| `onError` | Anything fails | Fields vary by `stage` (table below). |

`source` is `"http"`, `"core"` (a direct core call) or `"plugin"` (`ctx.compile`) where the hook has a caller, and `request` is `{ ip, method, path }` for HTTP and `null` otherwise. Do not assume either is present on every hook.

### Pipelines

`transformClasses`, `transformCss` and `transformSuggestions` run in sequence. Each receives the previous output as `value` and returns a replacement. Only `undefined` means "no change": `null` is passed on as the value. A throw or timeout skips that plugin.

| Hook | `value` | Core then |
| --- | --- | --- |
| `transformClasses` | sorted `string[]` | De-duplicates, re-validates and re-sorts. An empty result is a 400 for the `full` bundle only (`utilities` and `theme` accept it); over `maxClassCount` is 413. Invalid output is silently ignored. |
| `transformCss` | CSS string | Output over `maxCssChars` is rejected, the previous CSS is kept, and `onError` fires with `stage: "transform"`. |
| `transformSuggestions` | `string[]` | Filtered to strings, de-duplicated, capped to the request limit. |

### Resolvers

`resolvePageCss` and `resolveProjectCss` run on a `GET` cache miss. The first plugin returning `{ css }` wins; return `null` to pass. The CSS is served as is and not cached in memory, so call `hydratePageArtifact()` yourself if you want it cached. CSS over `maxCssChars` is skipped and reported with `stage: "resolve"`.

### Guard

`guard` runs on every HTTP request before route lookup, so it covers plugin routes, `/health` and unknown paths. It does not run for `OPTIONS` preflight (when `corsOrigin` is set), for paths outside `basePath`, or for requests rejected with 415, and it never sees direct core calls or `ctx.compile()`. It receives the context plus `{ ip, method, path }` (no body). Return `null`/`undefined` to allow, or `{ blocked: true, status, error, retryAfter }` to stop. `status` defaults to `429`; `401`, `403` and `429` map to `UNAUTHORIZED`, `FORBIDDEN` and `RATE_LIMITED`, anything else to `REQUEST_BLOCKED`. The first blocking plugin wins. A guard that throws or times out fails open: the error goes to `onError` and the request proceeds.

### Deferred hooks

`defer: true` runs all observer hooks fire-and-forget via a microtask; `deferHooks: ["onCompileResult"]` defers only those. Use it for I/O (databases, webhooks). `guard`, `onError`, the transform hooks and the resolvers are never deferred because they affect the response.

### onError stages

| `stage` | Raised by |
| --- | --- |
| `compile` | A compile failure: unexpected errors, validation outcomes (no valid classes, too many classes) and the plugin chain limit |
| `cache` | `GET /api/css` failed unexpectedly |
| `project-css` | `GET /api/projects/:projectId/css` failed unexpectedly |
| `suggest` | `POST /api/suggest` failed unexpectedly |
| `invalidate` | `POST /api/invalidate` failed unexpectedly |
| `transform` | `transformCss` output exceeded `maxCssChars` |
| `resolve` | A resolver returned CSS over `maxCssChars` |
| `body` | Any request-body read error: invalid JSON, length mismatch, 413 |
| `http` | The HTTP layer failed unexpectedly |
| `plugin-route` | A plugin route handler threw something other than a `RichWindError` |
| `replica-role` | A write was blocked on a reader node (`READ_ONLY_REPLICA`) |
| `cache-store` | A `cacheStore` call failed or timed out. Has `op`, `timedOut` and `context`, and no `source`. |

A hook that throws or times out produces an `onError` with `hook`, `plugin` and `timedOut`, and no `stage`, `source` or `request`.

## Plugin Routes

`addRoute(method, path, handler)` is available during `setup()` only; calling it later throws.

```js
setup({ addRoute, getCacheStats }) {
  addRoute("get", "/stats", () => ({ body: getCacheStats() }));      // GET /plugins/my-plugin/stats
  addRoute("post", "/echo", async (req) => ({ status: 201, body: await req.json() }));
}
```

- Routes live under `/plugins/<lowercased-name>/`; `"/"` is served at `/plugins/<lowercased-name>`. Routing is case-sensitive, which is why names that lowercase to the same segment collide.
- `method` is `get`, `post`, `put`, `delete` or `patch`. `path` starts with `/` and may use `:param` segments.
- The same handler runs under `core.handler` and `core.fetch`.
- The handler gets a neutral request (`method`, `path`, `params`, `query`, `headers.get()`, `ip`, `json()`, `text()`), not Express `req`/`res`. `json()` and `text()` are capped at `maxBodyBytes` and throw a `RichWindError` (400 or 413). See `PluginRouteRequest`.
- It returns `{ status, headers, body }`. `status` defaults to `200`; an object or array body is JSON; a string body is `text/plain` unless `Content-Type` is set; returning nothing answers `204`; an `{ error }` body at status 400 or above gets the default code for that status.
- A thrown `RichWindError` keeps its status and code. Any other throw answers `500 INTERNAL` and reaches `onError` with `stage: "plugin-route"`.
- Guards apply to plugin routes.

## Plugin Storage

`setup()` receives `storage`: `get(key)`, `set(key, value)`, `delete(key)`, `list(prefix?)`, backed by the `cacheStore` plugin-data methods ([cacheStore](runtime-spec.html#cachestore)).

- Keys match `[a-zA-Z0-9._:-]{1,128}`; `list` prefixes match the same set and may be empty. An invalid key or prefix throws.
- Data is namespaced by the lowercased plugin name.
- Without a `cacheStore`, or when it fails or times out, calls fail open: `get` returns `null`, `set` and `delete` return `false`, `list` returns `[]`.
- On a `reader` node `set` and `delete` return `false` and fire `onError` with `stage: "replica-role"`.
- Values are passed to the adapter as is; use JSON objects (the filesystem store reads back only objects).

## Auto-Promote

`createAutoPromotePlugin` is exported as `rich-wind/plugins/auto-promote`. It is a reference plugin and may change before 1.0. It moves classes used on many pages into one shared bundle.

- Each page votes for its classes. A class is promoted once `threshold` pages (default `5`) use it; votes follow the live cache, so evicted or invalidated pages stop counting.
- The promoted bundle is served from the plugin's own route, from plugin memory.
- `transformClasses` strips a class from a page only when it is both promoted and already served in the bundle. For bundles other than `utilities`, if stripping would remove every class it returns `undefined` and the page keeps its list.
- When the set of classes the bundle must serve changes, a deferred `onCompileResult` recompiles the bundle through `ctx.compile()`.
- State is saved in `ctx.storage` under `state_v2` and restored at `setup()` when the core cache holds no pages.
- It sets `timeoutMs: 5000` and `deferHooks: ["onCompileResult"]`.

```js
import { createCore } from "rich-wind";
import { createAutoPromotePlugin } from "rich-wind/plugins/auto-promote";

const core = await createCore({
  plugins: [createAutoPromotePlugin({ threshold: 5 })]
});
// GET /plugins/auto-promote/css/:projectId  promoted bundle
// GET /plugins/auto-promote/stats           tracked and promoted classes
```

Source: [plugins/auto-promote/index.js](https://github.com/FarooqAlaulddin/rich-wind/blob/main/plugins/auto-promote/index.js).
