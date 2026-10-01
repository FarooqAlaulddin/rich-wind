# API Reference

Rich Wind exposes JSON compile/cache/suggestion endpoints, optional browser helper scripts, and a health check. All JSON endpoints accept `Content-Type: application/json`. IDs (`projectId`, `pageId`) must match `[a-zA-Z0-9._-]+` and be at most `maxIdLength` characters (default 64).

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
    rateLimitMax: 120,
  },
  plugins: [myPlugin],
  pluginTimeoutMs: 200,
  cacheStore: myAdapter,
  cacheStoreTimeoutMs: 150,
});

http.createServer(core.handler).listen(3001);
```

The `config` object controls cache sizes, timeouts, and rate limits. `plugins`, `cacheStore`, and their timeout options are top-level. See [Configuration](#configuration) for the full table.

### core.handler(req, res)

A Node request listener. Use it standalone or mount it in a Node host.

```js
import http from "node:http";

const server = http.createServer(core.handler);
server.listen(3001);
```

```js
// Express host: Express rewrites req.url under the mount, and core routes relative to it
app.use("/rw", core.handler);
```

If the host already ran `express.json()`, core uses the parsed `req.body`. A Node-style host that does not rewrite `req.url` must strip its prefix from `req.url` before calling `core.handler`.

### core.fetch(request, { ip, basePath })

Takes a Web `Request` and returns a `Promise<Response>`. Use it from Next.js App Router, Hono, and other Fetch-style hosts. The same routes, validation, and error contract apply as with `core.handler`.

| Option | Description |
| --- | --- |
| `ip` | Client address. A `Request` carries none, so pass it yourself. Without it, plugin hooks see `request.ip` as `"unknown"`. `trustProxy` applies to this value as if it were the socket address. |
| `basePath` | Prefix stripped before routing. A path outside it answers `404 NOT_FOUND`. |

```js
// Next.js: app/rw/[...path]/route.js
import { core } from "@/lib/rich-wind";

export const GET = (req) => core.fetch(req, { basePath: "/rw" });
export const POST = GET;
export const HEAD = GET;
export const OPTIONS = GET;
```

Next.js does not provide a portable client IP. If you run behind a trusted proxy, derive the address from the header it sets and pass it as `ip`. Bun and Deno are not supported targets. Edge runtimes cannot load `@tailwindcss/oxide`, which is a native addon, so run these handlers on the Node.js runtime.

### Other functions

`core.compile`, `core.getCss`, `core.getProjectCss`, `core.invalidate`, and `core.suggest` call the core without HTTP. They take the same fields as the matching endpoints and bypass plugin guards, because the caller has already authorized the call. `core.close()` tears down plugins and is idempotent.

### HTTP surface

- Paths are exact and case-sensitive, with no trailing slash.
- `HEAD` is answered on every `GET` route.
- Every non-2xx response is `{ "error": "...", "code": "..." }`. Unknown paths and unknown methods answer `404 NOT_FOUND`.
- A bad percent-encoding in `:projectId` answers `400 INVALID_ID`.
- `/richwind-loader.js` and `/richwind-reload.js` carry an `ETag` and `Cache-Control: public, max-age=3600`, and answer `304` to a matching `If-None-Match`. JSON responses carry no `ETag`.
- The plugin guard runs before the body is read.
- `POST /api/*` must be `application/json` without a `Content-Encoding`, otherwise `415`.
- A `Content-Length` over `maxBodyBytes` is refused before reading. Chunked bodies are capped while reading. A `413` response sends `Connection: close`.
- A length mismatch, invalid UTF-8, malformed JSON, or a body that is not a JSON object answers `400 INVALID_BODY`.
- An unexpected handler error answers `500 INTERNAL`, reaches the `onError` hook, and never includes a stack trace.

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

You must provide at least one of `html` or `classes`, unless you're requesting the `base` bundle (which is just the preflight reset and doesn't need classes).

If you provide both `html` and `classes`, they're merged. Duplicates are removed, invalid classes are filtered out, and the final list is sorted before compilation.

**Bundle values:** `bundle` accepts `full`, `base`, `theme`, or `utilities`. Omit it for `full`; unrecognized values also fall back to `full`.

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

- `hash` — SHA-256 of the sorted class list. Same classes always produce the same hash.
- `cached` — `true` if this result came from cache without recompilation.
- `classes` — the validated, sorted list of classes that were actually compiled.
- `rejected` — normalized tokens supplied through `classes` that Tailwind rejected or
  that Rich Wind did not pass to the compiler because they are unsafe. HTML scanner
  candidates are intentionally not included.

**Errors:**

Every non-success response is JSON in the form `{ "error": string, "code": string }`.
`code` is one of `INVALID_ID`, `MISSING_INPUT`, `INVALID_BODY`,
`UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `READ_ONLY_REPLICA`,
`RATE_LIMITED`, `SERVER_BUSY`, `UNAUTHORIZED`, `FORBIDDEN`, `REQUEST_BLOCKED`,
`NOT_FOUND`, or `INTERNAL`.

| Status | Cause |
| --- | --- |
| `400` | Missing `projectId`, invalid ID format, or no valid classes found |
| `409` | Replica is configured as `nodeRole: "reader"` (`READ_ONLY_REPLICA`) |
| `413` | HTML too large, class string too large, class count exceeds limit, or JSON body too large |
| `429` | Rate limit exceeded (includes `Retry-After` header) |
| `500` | Unexpected internal error |

---

## GET /api/css

Fetch the cached CSS for a previously compiled page. Returns `text/css`.

| Param | Required | Notes |
| --- | --- | --- |
| `projectId` | yes | Project cache scope |
| `pageId` | no | Defaults to `"default"` |
| `bundle` | no | Same normalization as compile |

This endpoint only reads from cache — it doesn't compile anything. If the page hasn't
been compiled yet (or its cache has expired), it returns `404 NOT_FOUND` with the JSON
error envelope. A browser stylesheet link may log that 404; no stylesheet is applied.
When the page is cached but the requested `theme` or `utilities` bundle has not yet
been materialized, Rich Wind derives that bundle from the cached class set and stores it.

Responses include an `ETag` (derived from the page's class hash) and `Cache-Control: no-cache`. Send `If-None-Match` with the ETag to receive a `304 Not Modified` when the CSS hasn't changed.

```bash
curl "http://localhost:3001/api/css?projectId=my-app&pageId=hero"
```

---

## GET /api/projects/:projectId/css

Fetch a project-wide stylesheet. Returns `text/css`.

This compiles the **union** of every class from every currently-cached page in the project into a single stylesheet. It's useful for generating a combined CSS file that covers an entire site or tenant.

| Param | Required | Notes |
| --- | --- | --- |
| `bundle` | no | Query param, same normalization as compile |

The project-level CSS has its own cache with its own TTL (`projectCacheTtlMs`). It's
invalidated automatically when pages are added, removed, or their classes change. If no
classes are cached for the project, it returns `404 NOT_FOUND` with the JSON error envelope.

Responses include an `ETag` and `Cache-Control: no-cache`. Send `If-None-Match` to receive `304 Not Modified` when the CSS hasn't changed.

```bash
curl "http://localhost:3001/api/projects/my-app/css"
curl "http://localhost:3001/api/projects/my-app/css?bundle=utilities"
```

---

## POST /api/invalidate

Immediately purge a page or an entire project from the in-memory cache and the persistent cache store. Use this when content changes and you can't wait for TTL expiry.

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

After invalidation, the next `GET /api/css` for that page returns `404 NOT_FOUND` until it
is recompiled via `POST /api/compile`. Not allowed on reader nodes — returns `409` with
`code: "READ_ONLY_REPLICA"`.

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
| `prefix` | string | no | Filter results to classes starting with this, e.g. `"bg-"` |
| `classes` | string or string[] | no | Additional classes to include in results |
| `limit` | number | no | Max results. Also accepts `max` or `count`. Capped at `suggestLimit`. |

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

Returns a browser helper for plain HTML preview surfaces where calling the JSON API directly from host code is inconvenient. Most application integrations should call `POST /api/compile` directly instead.

Include it with a standard `<script src>` tag:

```html
<script
  defer
  src="https://your-rich-wind.example.com/richwind-loader.js"
  data-project-id="my-app"
  data-page-id="home"
></script>
```

The loader infers `coreUrl` from its own `src` URL, adds shared stylesheet links for `base` and project `theme`, then compiles the classes present in `document.body` as the page's `utilities` bundle. If the auto-promote plugin is mounted at its default route, the loader also attempts to link that promoted stylesheet.

Supported attributes:

| Attribute | Required | Notes |
| --- | --- | --- |
| `data-project-id` | yes | Cache namespace. Must follow the same ID rules as `projectId`. |
| `data-page-id` | no | Page cache key. Defaults to `"default"`. |
| `data-core-url` | no | Overrides the inferred core URL. |
| `data-bundle` | no | Compile bundle for body utilities. Defaults to `"utilities"`. |
| `data-compile` | no | Set to `"false"` to only attach shared stylesheet links. |

For cross-origin preview surfaces, enable CORS with `RW_CORS_ORIGIN=*` or a comma-separated origin allowlist. The loader uses browser `fetch()` for `POST /api/compile`, so the browser enforces CORS even though the script itself can be loaded as a normal subresource.

---

## Optional Helper: GET /richwind-reload.js

Returns an optional browser helper for local or static preview surfaces that need an in-page reload control. This is not part of the core compile/cache workflow.

Include it after the Rich Wind loader:

```html
<script defer src="https://your-rich-wind.example.com/richwind-reload.js"></script>
```

The script injects a fixed bottom-right reload button and the button's styles directly into the document. Clicking it reloads the page with a cache-busting `rwReload` query parameter.

Supported attributes:

| Attribute | Required | Notes |
| --- | --- | --- |
| `data-label` | no | Button text. Defaults to `"Reload"`. |
| `data-title` | no | Button title and accessible label. Defaults to `"Reload this page"`. |
| `data-cache-bust` | no | Set to `"false"` to use `window.location.reload()` without changing the URL. |
| `data-enabled` | no | Set to `"false"` to disable mounting the button. |

---

## GET /health

Returns `{ "status": "ok" }`. No rate limiting.

---

## Configuration

Every config option can be set in JavaScript (via `createCore({ config: { ... } })`) or as an environment variable. JS options take precedence. Invalid values fall back to defaults silently.

| Config key | Env var | Default | Description |
| --- | --- | --- | --- |
| `maxBodyBytes` | `RW_MAX_BODY_BYTES` | `100000` | Max request body size in bytes |
| `maxHtmlChars` | `RW_MAX_HTML_CHARS` | `50000` | Max length of the `html` field |
| `maxClassChars` | `RW_MAX_CLASS_CHARS` | `10000` | Max length of the `classes` field (when string) |
| `maxClassCount` | `RW_MAX_CLASS_COUNT` | `1500` | Max number of resolved classes per compile |
| `maxIdLength` | `RW_MAX_ID_LENGTH` | `64` | Max length of `projectId` and `pageId` |
| `maxCssChars` | `RW_MAX_CSS_CHARS` | `2000000` | Max CSS length accepted from cacheStore artifacts, transforms, and resolve hooks |
| `cacheMaxPages` | `RW_CACHE_MAX_PAGES` | `200` | Max total pages held in memory across all projects |
| `cacheTtlMs` | `RW_CACHE_TTL_MS` | `600000` | Page cache TTL in ms (sliding — resets on access) |
| `projectCacheTtlMs` | `RW_PROJECT_CACHE_TTL_MS` | `600000` | Project aggregate cache TTL in ms |
| `suggestLimit` | `RW_SUGGEST_LIMIT` | `100` | Max number of suggestions returned |
| `suggestFallback` | `RW_SUGGEST_FALLBACK` | `true` | Whether to include Tailwind's static class list in suggestions |
| `rateLimitWindowMs` | `RW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `rateLimitMax` | `RW_RATE_LIMIT_MAX` | `60` | Max requests per IP per window |
| `rateLimitDisabled` | `RW_RATE_LIMIT_DISABLED` | `false` | Disable rate limiting entirely |
| `trustProxy` | `RW_TRUST_PROXY` | unset | Express `trust proxy` semantics: `true`/`false`, a hop count (`1`, `2`, ...), or a comma-separated list of trusted addresses or subnets (`loopback`, `uniquelocal` also accepted). Unset uses the socket address and ignores `X-Forwarded-For`. `RW_TRUST_PROXY=1` is hop count 1, not "trust all". See [Runtime Spec](runtime-spec.html#threat-model-and-enforcement-boundary) |
| `nodeRole` | `RW_NODE_ROLE` | `hybrid` | Replica role: `hybrid`, `writer`, or `reader` |
| `corsOrigin` | `RW_CORS_ORIGIN` | unset | CORS allowlist (`*` or comma-separated origins) |

These options live outside `config` — they're top-level arguments to `createCore()`:

| Option | Env var | Default | Description |
| --- | --- | --- | --- |
| `plugins` | — | `[]` | Plugin or array of plugins |
| `pluginTimeoutMs` | `RW_PLUGIN_TIMEOUT_MS` | `200` | Default timeout for plugin hooks |
| `setupTimeoutMs` | — | computed | Plugin setup timeout (min 1000ms) |
| `maxPluginCompileChainDepth` | — | `2` | Max depth for plugin-initiated compile chains |
| `cacheStore` | — | `null` | Persistence adapter (see [Runtime Spec](runtime-spec.html#cachestore), including optional `deletePageArtifact`/`deleteProjectArtifact`/`deleteProjectPageArtifacts` for purge mutations) |
| `cacheStoreTimeoutMs` | `RW_CACHE_STORE_TIMEOUT_MS` | `150` | Timeout per cacheStore operation |

`PORT` (default `3001`) is only used when running `node services/index.js` directly. When you embed the library, you create the server yourself, for example `http.createServer(core.handler)`.

For single-writer deployments, use this split:
- `writer` nodes: accept compile and other writes
- `reader` nodes: serve CSS/suggestions only
- both point to the same `cacheStore`
