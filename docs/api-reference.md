# API Reference

Rich Wind exposes JSON compile/cache/suggestion endpoints, optional browser helper scripts, and a health check. `POST /api/*` endpoints require `Content-Type: application/json`. IDs (`projectId`, `pageId`) must match `[a-zA-Z0-9._-]+` and be at most `maxIdLength` characters (default 64).

Machine-readable contract: [`openapi.json`](openapi.json)

## createCore()

Everything starts here. `createCore()` is async and returns `{ handler, fetch, compile, getCss, getProjectCss, invalidate, suggest, close }`. Express is not a runtime dependency.

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore({
  config: {
    cacheTtlMs: 10 * 60 * 1000,
    cacheMaxPages: 500,
  },
  plugins: [myPlugin],
  pluginTimeoutMs: 200,
  cacheStore: myAdapter,
  cacheStoreTimeoutMs: 150,
});

http.createServer(core.handler).listen(3001);
```

The `config` object controls cache sizes, timeouts, and limits on request and output size. `plugins`, `cacheStore`, and their timeout options are top-level. See [Configuration](#configuration) for the full table.

### core.handler(req, res)

A Node request listener. Use it standalone or mount it in a Node host.

```js
http.createServer(core.handler).listen(3001);  // standalone
app.use("/rw", core.handler);                  // mounted: the host rewrites req.url
```

A host that does not rewrite `req.url` must strip its prefix before calling `core.handler`. If the host already ran `express.json()`, core uses the parsed `req.body` (then `maxBodyBytes` does not bound it). Framework recipes: [Integration Cookbook](integration-cookbook.html#embedding).

### core.fetch(request, { ip, basePath })

Takes a Web `Request` and returns a `Promise<Response>`. Use it from Next.js App Router, Hono, and other Fetch-style hosts. The same routes, validation, and error contract apply as with `core.handler`.

| Option | Description |
| --- | --- |
| `ip` | Client address. A `Request` carries none, so pass it yourself. Without it, plugin hooks see `request.ip` as `"unknown"`. `trustProxy` applies to this value as if it were the socket address. |
| `basePath` | Prefix stripped before routing. A path outside it answers `404 NOT_FOUND`. |

```js
export const GET = (req) => core.fetch(req, { basePath: "/rw" });
```

Node.js 22 or later only (`package.json` engines); `@tailwindcss/oxide` is a native addon, so edge runtimes cannot load it.

### Functions

Each function takes the same fields as its route and returns the route's 200 body. Failures throw `RichWindError` (`status`, `code`, `message`; see [Errors](#errors)). The plugin guard runs on HTTP requests only, not on direct calls.

| Function | Route | Returns |
| --- | --- | --- |
| `core.compile(input)` | `POST /api/compile` | the compile response body, including `rejected` |
| `core.getCss({ projectId, pageId?, bundle? })` | `GET /api/css` | `{ css, etag }` (`etag` unquoted, or `null`) |
| `core.getProjectCss({ projectId, bundle? })` | `GET /api/projects/:projectId/css` | `{ css, etag }` |
| `core.invalidate({ projectId, pageId? })` | `POST /api/invalidate` | `{ invalidated, projectId, pageId? }` |
| `core.suggest(input)` | `POST /api/suggest` | the suggest response body |
| `core.close()` | none | `Promise<void>`; tears down plugins, idempotent |

```js
import { RichWindError } from "rich-wind";

try {
  await core.compile({ projectId: "my-app" });
} catch (err) {
  if (err instanceof RichWindError) console.log(err.status, err.code); // 400 MISSING_INPUT
}
```

### Standalone export

Module-level functions with no cache, plugins or project state: the same input always gives byte-identical CSS, so a host can store source and rebuild CSS on demand.

```js
import { scanHtml, exportCss, exportSet } from "rich-wind";
```

| Function | Returns |
| --- | --- |
| `scanHtml(html)` | `{ classes, rejected }`: valid classes found in the HTML, and class-attribute tokens that compile to nothing |
| `exportCss({ html?, classes? })` | `{ css, classes, rejected }`: one complete sheet (preflight, theme variables, utilities) |
| `exportSet(pages, { minPages = 2 }?)` | `{ shared, pages, classes, rejected }` for `pages` = `[{ id, html?, classes? }]`; `pages`, `classes` and `rejected` are keyed by id |

`exportSet` puts preflight, every page's theme variables and the utilities used on at least `minPages` pages in `shared`. Load `shared` first, then the page's sheet. A page sheet may repeat a shared class to keep Tailwind's cascade order. It is `""` when the page needs nothing beyond `shared`.

### HTTP surface

- Every error produced by core is `{ "error": "...", "code": "..." }` (see [Errors](#errors)). A `304` has no body; plugin routes return their own bodies.
- Paths are exact and case-sensitive, with no trailing slash. `HEAD` is answered on every `GET` route. Unknown paths and methods answer `404 NOT_FOUND`.
- `POST /api/*` must be `application/json` without a `Content-Encoding`, otherwise `415`. This check runs before the plugin guard.
- A `413` for an oversized request body sends `Connection: close`.
- `/richwind-loader.js` and `/richwind-reload.js` carry an `ETag` and `Cache-Control: public, max-age=3600`, and answer `304` to a matching `If-None-Match`.
- CORS: with `corsOrigin` set, `OPTIONS` answers `204` and a disallowed `Origin` on `OPTIONS` answers `403 FORBIDDEN`; with it unset, `OPTIONS` answers `404`.
- CSS `ETag` handling: [GET /api/css](#get-apicss).

---

## POST /api/compile

The primary endpoint. Accepts HTML and/or a class list, compiles them into CSS, and caches the result.

**Request body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | yes | Scopes the cache. |
| `pageId` | string | no | Defaults to `"default"`. |
| `html` | string | no | HTML to scan for Tailwind class candidates. |
| `classes` | string or string[] | no | Explicit list of classes. Strings are split on whitespace. |
| `bundle` | string | no | Which CSS layers to include. Defaults to `"full"`. |

You must provide at least one of `html` or `classes`, unless you request the `base` bundle (the preflight reset, which needs no classes).

If you provide both `html` and `classes`, they are merged, de-duplicated and sorted. Tokens that cannot be compiled are returned in `rejected`: explicit `classes` entries, and unknown tokens in `class` / `className` attributes of `html` (words in prose or other attributes are never reported). A plugin `transformClasses` hook may change the final list (see `classes` below).

**Bundle values:** `full`, `base`, `theme`, `utilities`. The value is trimmed and case-insensitive; omitted or unrecognized values fall back to `full`.

**Response (200):**

```json
{
  "success": true,
  "projectId": "my-app",
  "pageId": "hero",
  "bundle": "full",
  "hash": "a1b2c3...",
  "classes": ["p-4", "text-red-500"],
  "rejected": [],
  "cached": false,
  "css": "/* compiled output */"
}
```

- `hash` — SHA-256 of the sorted class list; the same classes give the same hash. For `base` it is the literal `"base"`.
- `cached` — `true` if this result came from cache without recompilation. Always `true` for `base`.
- `classes` — the sorted list of classes that were compiled (after any plugin `transformClasses`).
- `rejected` — sorted, de-duplicated tokens from the explicit `classes` input and from `class` / `className` attributes in `html` that Tailwind could not compile or that Rich Wind withheld as unsafe. Other words the HTML scanner finds (prose, attribute values) are never listed. Always an array, `[]` when nothing was rejected. Explicit `classes` are validated even for the `base` bundle.

Errors: see [Errors](#errors).

---

## GET /api/css

Fetch the cached CSS for a previously compiled page. Returns `text/css`.

| Param | Required | Notes |
| --- | --- | --- |
| `projectId` | yes | Project cache scope |
| `pageId` | no | Defaults to `"default"` |
| `bundle` | no | Same normalization as compile (unrecognized values fall back to `full`) |

This endpoint serves cached CSS and never compiles new classes. If the page hasn't
been compiled yet (or its cache has expired and no `cacheStore` holds it), it returns `404 NOT_FOUND`. `bundle=base` is page-independent and always returns `200`.
When the page is cached but the requested `theme` or `utilities` bundle has not yet
been materialized, Rich Wind derives that bundle from the cached class set and stores it.

When an ETag exists (not for hook-resolved CSS), the response carries `ETag` (derived from the page's class hash, so `full`, `theme` and `utilities` of one page share it) and `Cache-Control: no-cache`. `If-None-Match` is an exact string match (no `W/`, lists or `*`); a match answers `304`.

```bash
curl "http://localhost:3001/api/css?projectId=my-app&pageId=hero"
```

---

## GET /api/projects/:projectId/css

Fetch a project-wide stylesheet. Returns `text/css`.

The union of every class from the pages currently held in memory for the project (expiry is lazy, so expired pages not yet evicted still count), as a single stylesheet.

| Param | Required | Notes |
| --- | --- | --- |
| `bundle` | no | Query param, same normalization as compile. `bundle=base` is page-independent and always `200` |

The project-level CSS has its own cache with its own TTL (`projectCacheTtlMs`). It is
invalidated when pages are added, removed, or their classes change. If the project has no cached classes (for example the theme before any page is compiled), it returns `404 NOT_FOUND`.

`ETag`, `Cache-Control` and `If-None-Match` behave as for `GET /api/css`.

```bash
curl "http://localhost:3001/api/projects/my-app/css"
curl "http://localhost:3001/api/projects/my-app/css?bundle=utilities"
```

---

## POST /api/invalidate

Purge a page or an entire project from the in-memory cache and the `cacheStore`. Purging the store needs the optional `delete*` adapter methods; without them the store keeps the data and the call still returns `invalidated: true`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | yes | Project to purge |
| `pageId` | string | no | When omitted, purges the entire project |

```json
// Purge a single page
{ "projectId": "my-app", "pageId": "home" }

// Purge an entire project
{ "projectId": "my-app" }
```

**Response**

```json
{ "invalidated": true, "projectId": "my-app", "pageId": "home" }
```

Not allowed on reader nodes: `409 READ_ONLY_REPLICA`.

```bash
curl -X POST http://localhost:3001/api/invalidate \
  -H "Content-Type: application/json" \
  -d '{"projectId":"my-app","pageId":"home"}'
```

---

## POST /api/suggest

Autocomplete for Tailwind class names. Returns suggestions drawn from three sources, checked in order:

1. **Provided classes** — if you include a `classes` field, matching entries appear first
2. **Project cache** — classes from previously compiled pages in this project, sorted by how often they appear across pages
3. **Tailwind static list** — the full built-in class list from Tailwind's design system (only used when `prefix` is provided and `suggestFallback` is enabled)

Arbitrary value classes like `text-[18px]` are not included in the static list — they can't be enumerated.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | no | Scope to a project's cached classes |
| `prefix` | string | no | Trimmed; filters all results, including provided `classes`, to those starting with it, e.g. `"bg-"` |
| `classes` | string or string[] | no | Additional classes to include in results |
| `limit` | number or numeric string | no | Max results, capped at `suggestLimit`. `0` or non-numeric falls back to `suggestLimit`. |

```json
{
  "success": true,
  "projectId": "my-app",
  "prefix": "bg-",
  "count": 10,
  "suggestions": ["bg-blue-500", "bg-red-500", "bg-white"]
}
```

---

## Optional Helper: GET /richwind-loader.js

Browser helper for plain HTML preview pages. Applications should call `POST /api/compile` directly.

```html
<script defer src="https://your-rich-wind.example.com/richwind-loader.js"
  data-project-id="my-app" data-page-id="home"></script>
```

It infers `coreUrl` from its own `src`, links the `base` and project `theme` stylesheets (the theme 404s until a page in the project is compiled), then compiles `document.body` as the page's `utilities` bundle. If the auto-promote plugin is mounted at its default route, it also links that stylesheet. Instead of data attributes it accepts `window.RichWind = { coreUrl, projectId, pageId }`.

| Attribute | Required | Notes |
| --- | --- | --- |
| `data-project-id` | yes | Cache namespace. Must follow the same ID rules as `projectId`. |
| `data-page-id` | no | Page cache key. Defaults to `"default"`. |
| `data-core-url` | no | Overrides the inferred core URL. |
| `data-bundle` | no | Compile bundle for body utilities. Defaults to `"utilities"`. |
| `data-compile` | no | Set to `"false"` to only attach shared stylesheet links. |

Cross-origin pages need `corsOrigin`, because the loader calls `POST /api/compile` with `fetch()`.

---

## Optional Helper: GET /richwind-reload.js

Injects a fixed bottom-right reload button. Include it after the loader.

| Attribute | Required | Notes |
| --- | --- | --- |
| `data-label` | no | Button text. Defaults to `"Reload"`. |
| `data-title` | no | Button title. Defaults to `"Reload this page"`. |
| `data-cache-bust` | no | `"false"` uses `window.location.reload()` instead of adding an `rwReload` query parameter. |
| `data-enabled` | no | `"false"` disables the button. |

---

## GET /health

Returns `{ "status": "ok" }`. Plugin guards run for this route too.

---

## Errors

Every error produced by core is `{ "error": string, "code": string }`; plugin routes return their own bodies. Direct calls throw `RichWindError` (extends `Error`) with the same `status`, `code` and `message`.

| Code | Status | When |
| --- | --- | --- |
| `INVALID_ID` | 400 | `projectId` or `pageId` does not match `[a-zA-Z0-9._-]+` or exceeds `maxIdLength`; bad percent-encoding in a path parameter |
| `MISSING_INPUT` | 400 | no `projectId`, or neither `html` nor `classes` (except for the `base` bundle) |
| `INVALID_BODY` | 400 | body is malformed JSON, invalid UTF-8, not a JSON object, or its length does not match; compile input yielded no valid classes |
| `UNAUTHORIZED` | 401 | a plugin guard blocked the request |
| `FORBIDDEN` | 403 | a plugin guard blocked the request |
| `NOT_FOUND` | 404 | unknown path or method; no cached CSS for the page or project; path outside `basePath` |
| `READ_ONLY_REPLICA` | 409 | compile or invalidate on a `nodeRole: "reader"` node |
| `PAYLOAD_TOO_LARGE` | 413 | body over `maxBodyBytes`; `html`, `classes` or class count over its limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `POST /api/*` without `application/json`, or with a `Content-Encoding` |
| `RATE_LIMITED` | 429 | a plugin guard blocked the request (core has no limiter), or a guard returned no status; the guard may set `Retry-After` |
| `REQUEST_BLOCKED` | guard status | a plugin guard blocked the request with a status other than 401, 403 or 429 |
| `INTERNAL` | 500 | unexpected error (no stack trace is sent), or plugin compile chain depth exceeded |
| `SERVER_BUSY` | 503 | every compile slot is in use; sent with `Retry-After: 1` |

What core enforces and what the host must enforce: [Runtime Spec](runtime-spec.html#security-boundary).

---

## Configuration

Every option can be set in `createCore({ config: { ... } })` or as an environment variable; JS options win. Invalid or below-minimum values fall back to the default silently. Minimums: `maxBodyBytes` 1024; `cacheTtlMs`, `projectCacheTtlMs`, `pluginTimeoutMs` 0; all others 1.

| Config key | Env var | Default | Description |
| --- | --- | --- | --- |
| `maxBodyBytes` | `RW_MAX_BODY_BYTES` | `100000` | Max request body size in bytes (a pre-parsed `req.body` is not bounded) |
| `maxHtmlChars` | `RW_MAX_HTML_CHARS` | `50000` | Max length of the `html` field |
| `maxClassChars` | `RW_MAX_CLASS_CHARS` | `10000` | Max length of the `classes` field (when string) |
| `maxClassCount` | `RW_MAX_CLASS_COUNT` | `1500` | Max number of resolved classes per compile |
| `maxConcurrentCompiles` | `RW_MAX_CONCURRENT_COMPILES` | `8` | Max compiles running at once (minimum `1`). Extra compiles are shed with `503 SERVER_BUSY`; there is no wait queue |
| `maxIdLength` | `RW_MAX_ID_LENGTH` | `64` | Max length of `projectId` and `pageId` |
| `maxCssChars` | `RW_MAX_CSS_CHARS` | `2000000` | Max CSS length accepted from cacheStore artifacts, transforms, and resolve hooks (does not cap Tailwind's own compile output) |
| `cacheMaxPages` | `RW_CACHE_MAX_PAGES` | `200` | Max total pages held in memory across all projects |
| `cacheTtlMs` | `RW_CACHE_TTL_MS` | `600000` | Page cache TTL in ms (sliding — resets on access) |
| `projectCacheTtlMs` | `RW_PROJECT_CACHE_TTL_MS` | resolved `cacheTtlMs` | Project aggregate cache TTL in ms |
| `suggestLimit` | `RW_SUGGEST_LIMIT` | `100` | Max number of suggestions returned |
| `suggestFallback` | `RW_SUGGEST_FALLBACK` | `true` | Whether to include Tailwind's static class list in suggestions |
| `trustProxy` | `RW_TRUST_PROXY` | unset | Express `trust proxy` semantics; `1` is hop count 1, not "trust all". See [Runtime Spec](runtime-spec.html#client-ip-and-trustproxy) |
| `nodeRole` | `RW_NODE_ROLE` | `hybrid` | `hybrid`, `writer` or `reader`; `write` and `read` are accepted aliases, case-insensitive; unknown values give `hybrid`. See [Runtime Spec](runtime-spec.html#replica-roles) |
| `corsOrigin` | `RW_CORS_ORIGIN` | unset | `*` or a comma-separated origin list; `0`, `false`, `off`, `none`, `disabled` disable CORS |

These options live outside `config` — they're top-level arguments to `createCore()`:

| Option | Env var | Default | Description |
| --- | --- | --- | --- |
| `plugins` | — | `[]` | Plugin or array of plugins |
| `pluginTimeoutMs` | `RW_PLUGIN_TIMEOUT_MS` | `200` | Default timeout for plugin hooks |
| `setupTimeoutMs` | — | `max((pluginTimeoutMs ?? 200) * 5, 1000)` | Plugin setup timeout in ms |
| `maxPluginCompileChainDepth` | — | `2` | Max depth for plugin-initiated compile chains |
| `cacheStore` | — | `null` | Persistence adapter (see [Runtime Spec](runtime-spec.html#cachestore), including optional `deletePageArtifact`/`deleteProjectArtifact`/`deleteProjectPageArtifacts` for purge mutations) |
| `cacheStoreTimeoutMs` | `RW_CACHE_STORE_TIMEOUT_MS` | `150` | Timeout per cacheStore operation (`0` falls back to `150`) |

`PORT` (default `3001`) is only used when running `node services/index.js` directly. When you embed the library, you create the server yourself, for example `http.createServer(core.handler)`.

---

## Compatibility Policy (1.x)

Intended commitments, taking effect at 1.0.0. The package is currently `0.0.1-alpha.0` and nothing here is guaranteed before then.

- HTTP responses: fields do not change type or meaning, success statuses stay stable, and responses may gain optional fields (ignore unknown fields).
- The error `code` enum and its meanings stay fixed; new failure cases map to an existing code.
- The members `createCore()` returns, the `{ error, code }` envelope, exact case-sensitive paths and `HEAD` on `GET` routes stay stable.
- Environment variable and option names stay stable; defaults change only in a minor release.
- Generated CSS and `rejected` follow the installed Tailwind 4.x release; a Tailwind update changing them is not a Rich Wind breaking change.
