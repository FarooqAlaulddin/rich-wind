# API Reference

Rich Wind exposes four endpoints and a health check. All JSON endpoints accept `Content-Type: application/json`. IDs (`projectId`, `pageId`) must match `[a-zA-Z0-9._-]+` and be at most `maxIdLength` characters (default 64).

Machine-readable contract: [`/docs/openapi.json`](/docs/openapi.json)

## createCore()

Everything starts here. `createCore()` is async and returns `{ app, close }` — a standard Express app and a shutdown function.

```js
import { createCore } from "rich-wind";

const { app, close } = await createCore({
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

app.listen(3001);
```

The `config` object controls cache sizes, timeouts, and rate limits. `plugins`, `cacheStore`, and their timeout options are top-level. See [Configuration](#configuration) for the full table.

---

## POST /api/compile

The primary endpoint. Accepts HTML and/or a class list, compiles them into CSS, and caches the result.

**Request body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `projectId` | string | yes | Scopes the cache. Also accepts `project_id`. |
| `pageId` | string | no | Defaults to `"default"`. Also accepts `page_id`. |
| `html` | string | no | HTML to scan for Tailwind class candidates. |
| `classes` | string or string[] | no | Explicit list of classes. Strings are split on whitespace. |
| `bundle` | string | no | Which CSS layers to include. Defaults to `"full"`. |

You must provide at least one of `html` or `classes`, unless you're requesting the `base` bundle (which is just the preflight reset and doesn't need classes).

If you provide both `html` and `classes`, they're merged. Duplicates are removed, invalid classes are filtered out, and the final list is sorted before compilation.

**Bundle aliases:** the `bundle` field is flexible. `"preflight"` maps to `base`, `"tokens"` or `"design"` map to `theme`, `"utils"`, `"util"`, or `"utility"` map to `utilities`. Unrecognized values fall back to `full`. A `mode` field is also accepted as an alias for `bundle`.

**Response (200):**

```json
{
  "success": true,
  "projectId": "my-app",
  "pageId": "hero",
  "bundle": "full",
  "hash": "a1b2c3...",
  "classes": ["p-4", "text-red-500"],
  "cached": false,
  "css": "/* compiled output */"
}
```

- `hash` — SHA-256 of the sorted class list. Same classes always produce the same hash.
- `cached` — `true` if this result came from cache without recompilation.
- `classes` — the validated, sorted list of classes that were actually compiled.

**Errors:**

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
| `projectId` | yes | Also accepts `project_id` |
| `pageId` | no | Defaults to `"default"`. Also accepts `page_id` |
| `bundle` | no | Same normalization as compile |

This endpoint only reads from cache — it doesn't compile anything. If the page hasn't been compiled yet (or its cache has expired), you'll get a `404` with a message to call `/api/compile` first.

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

The project-level CSS has its own cache with its own TTL (`projectCacheTtlMs`). It's invalidated automatically when pages are added, removed, or their classes change.

```bash
curl "http://localhost:3001/api/projects/my-app/css"
curl "http://localhost:3001/api/projects/my-app/css?bundle=utilities"
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
| `maxCssChars` | `RW_MAX_CSS_CHARS` | `2000000` | Max CSS length accepted from cacheStore artifacts |
| `cacheMaxPages` | `RW_CACHE_MAX_PAGES` | `200` | Max total pages held in memory across all projects |
| `cacheTtlMs` | `RW_CACHE_TTL_MS` | `600000` | Page cache TTL in ms (sliding — resets on access) |
| `projectCacheTtlMs` | `RW_PROJECT_CACHE_TTL_MS` | `600000` | Project aggregate cache TTL in ms |
| `suggestLimit` | `RW_SUGGEST_LIMIT` | `100` | Max number of suggestions returned |
| `suggestFallback` | `RW_SUGGEST_FALLBACK` | `true` | Whether to include Tailwind's static class list in suggestions |
| `rateLimitWindowMs` | `RW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `rateLimitMax` | `RW_RATE_LIMIT_MAX` | `60` | Max requests per IP per window |
| `rateLimitDisabled` | `RW_RATE_LIMIT_DISABLED` | `false` | Disable rate limiting entirely |
| `trustProxy` | `RW_TRUST_PROXY` | `false` | Trust `X-Forwarded-For` for IP detection |
| `nodeRole` | `RW_NODE_ROLE` | `hybrid` | Replica role: `hybrid`, `writer`, or `reader` |
| `corsOrigin` | `RW_CORS_ORIGIN` | unset | CORS allowlist (`*` or comma-separated origins) |

These options live outside `config` — they're top-level arguments to `createCore()`:

| Option | Env var | Default | Description |
| --- | --- | --- | --- |
| `plugins` | — | `[]` | Plugin or array of plugins |
| `pluginTimeoutMs` | `RW_PLUGIN_TIMEOUT_MS` | `200` | Default timeout for plugin hooks |
| `setupTimeoutMs` | — | computed | Plugin setup timeout (min 1000ms) |
| `maxPluginCompileChainDepth` | — | `2` | Max depth for plugin-initiated compile chains |
| `cacheStore` | — | `null` | Persistence adapter (see [Runtime Spec](/docs/runtime-spec#cachestore), including optional `deletePageArtifact`/`deleteProjectArtifact`/`deleteProjectPageArtifacts` for purge mutations) |
| `cacheStoreTimeoutMs` | `RW_CACHE_STORE_TIMEOUT_MS` | `150` | Timeout per cacheStore operation |

`PORT` (default `3001`) is only used when running `node services/index.js` directly. When you embed the library, you call `app.listen()` yourself.

For single-writer deployments, use this split:
- `writer` nodes: accept compile and other writes
- `reader` nodes: serve CSS/suggestions only
- both point to the same `cacheStore`
