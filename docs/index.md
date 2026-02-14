# Rich Wind

A stateless runtime Tailwind CSS compiler. Send HTML or class lists, get compiled CSS back on demand — no build step, no file system, no config files.

## Documentation Map

Core library docs:

- [API Reference](/docs/api-reference) — endpoint contract and config keys
- [Runtime Spec](/docs/runtime-spec) — deterministic behavior, cache semantics, limits, and hooks
- [Integration Cookbook](/docs/integration-cookbook) — production integration patterns and checklists

## Quick Start

### Install and run

```bash
npm install
npm run dev
```

The API starts on `http://localhost:3001`.

### Compile your first page

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-app",
    "pageId": "hero",
    "html": "<div class=\"text-red-500 p-4\">Hello</div>"
  }'
```

The response includes the compiled CSS, the extracted class list, and a content hash.

### Use it as a library

```js
import { createCore } from "rich-wind";

const app = createCore();
app.listen(3001);
```

## API Reference

### `POST /api/compile`

Compile CSS for a project page.

**Request body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | yes | Scopes the cache. Use your own tenant namespace. |
| `pageId` | string | no | Defaults to `"default"`. |
| `html` | string | no | HTML containing Tailwind classes. |
| `classes` | string \| string[] | no | Explicit class list. |
| `bundle` | string | no | `"full"` (default), `"base"`, `"theme"`, or `"utilities"`. |

> At least one of `html` or `classes` is required unless `bundle` is `"base"`.

**Response:**

```json
{
  "success": true,
  "projectId": "my-app",
  "pageId": "hero",
  "bundle": "full",
  "hash": "a1b2c3",
  "classes": ["text-red-500", "p-4"],
  "cached": false,
  "css": "..."
}
```

#### Split bundles

You can request individual layers instead of the full output. If you split `theme` + `utilities`, load `theme` first so the CSS variables exist.

```bash
# Preflight only (no classes needed)
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "my-app", "bundle": "base" }'

# Theme tokens (CSS variables for the classes in use)
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "my-app", "classes": "bg-red-500 text-white", "bundle": "theme" }'

# Utilities only (no preflight, no theme)
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "my-app", "classes": "bg-red-500", "bundle": "utilities" }'
```

---

### `GET /api/css`

Fetch cached CSS for a page.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | yes | — |
| `pageId` | string | no | Defaults to `"default"`. |
| `bundle` | string | no | `"full"`, `"base"`, `"theme"`, or `"utilities"`. |

Returns `text/css`.

```bash
curl "http://localhost:3001/api/css?projectId=my-app&pageId=hero"
```

---

### `GET /api/projects/:projectId/css`

Fetch aggregated CSS across all cached pages for a project.

Returns `text/css`.

```bash
curl "http://localhost:3001/api/projects/my-app/css"

# Utilities only
curl "http://localhost:3001/api/projects/my-app/css?bundle=utilities"
```

---

### `POST /api/suggest`

Class name suggestions from cached project data and Tailwind's static design system. Arbitrary values (e.g. `text-[18px]`) are not enumerated.

**Request body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `projectId` | string | no | Scope suggestions to a project's cached classes. |
| `prefix` | string | no | Filter by prefix (e.g. `"bg-"`). |
| `classes` | string \| string[] | no | Additional classes to include. |
| `limit` | number | no | Max results. |

```bash
curl -X POST http://localhost:3001/api/suggest \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "my-app", "prefix": "bg-", "limit": 8 }'
```

---

### `GET /health`

Returns `{ "status": "ok" }`.

## Configuration

### JavaScript config

Pass a `config` object to `createCore`:

```js
import { createCore } from "rich-wind";

const app = createCore({
  config: {
    maxClassCount: 1200,
    cacheTtlMs: 5 * 60 * 1000,
    projectCacheTtlMs: 10 * 60 * 1000,
    suggestLimit: 75,
    rateLimitDisabled: true,
  },
});
```

| Key | Description |
| --- | --- |
| `maxBodyBytes` | Request size limit |
| `maxHtmlChars` | Max HTML input length |
| `maxClassChars` | Max class string length |
| `maxClassCount` | Max class count per request |
| `maxIdLength` | Max `projectId` / `pageId` length |
| `maxCssChars` | Max CSS length accepted from cacheStore artifacts |
| `cacheMaxPages` | Max pages held in cache |
| `cacheTtlMs` | Page cache TTL |
| `projectCacheTtlMs` | Project CSS cache TTL |
| `suggestLimit` | Max suggestion results |
| `suggestFallback` | Include the static Tailwind class list |
| `rateLimitWindowMs` | Rate limit window |
| `rateLimitMax` | Max requests per window |
| `rateLimitDisabled` | Disable rate limiting |
| `trustProxy` | Trust `X-Forwarded-For` headers |

Additional top-level options (not part of `config`):

| Option | Description |
| --- | --- |
| `pluginTimeoutMs` | Default plugin hook timeout (ms) |
| `cacheStore` | Optional read-through/write-through persistence adapter |
| `cacheStoreTimeoutMs` | Per-operation cache store timeout (ms) |

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | HTTP listen port |
| `RW_CACHE_MAX_PAGES` | `200` | Max cached pages |
| `RW_CACHE_TTL_MS` | `600000` | Page cache TTL (ms) |
| `RW_PROJECT_CACHE_TTL_MS` | `600000` | Project CSS TTL (ms) |
| `RW_MAX_BODY_BYTES` | `100000` | Request size limit |
| `RW_MAX_HTML_CHARS` | `50000` | Max HTML length |
| `RW_MAX_CLASS_CHARS` | `10000` | Max class string length |
| `RW_MAX_CLASS_COUNT` | `1500` | Max class count |
| `RW_MAX_ID_LENGTH` | `64` | Max ID length |
| `RW_MAX_CSS_CHARS` | `2000000` | Max CSS length accepted from cacheStore artifacts |
| `RW_SUGGEST_LIMIT` | `100` | Max suggestions |
| `RW_SUGGEST_FALLBACK` | `true` | Include static Tailwind list |
| `RW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RW_RATE_LIMIT_MAX` | `60` | Requests per window |
| `RW_RATE_LIMIT_DISABLED` | `false` | Disable rate limiting |
| `RW_TRUST_PROXY` | `false` | Trust proxy IPs |
| `RW_PLUGIN_TIMEOUT_MS` | `200` | Default plugin hook timeout (ms) |
| `RW_CACHE_STORE_TIMEOUT_MS` | `150` | Cache store operation timeout (ms) |

**Notes**
- `PORT` only affects the CLI entry (`node services/index.js`). When you embed the core, you call `app.listen(...)` yourself.
- `RW_PLUGIN_TIMEOUT_MS` maps to the top-level `pluginTimeoutMs` option, not `config`.
- `RW_CACHE_STORE_TIMEOUT_MS` maps to the top-level `cacheStoreTimeoutMs` option, not `config`.
- Precedence: JS options win over env vars. Invalid values fall back to defaults.

### UI environment

| Variable | Default | Description |
| --- | --- | --- |
| `RW_CORE_URL` | `http://localhost:3001` | Core API base URL |

## Running the Demo UI

```bash
cd ui
npm install
RW_CORE_URL=http://localhost:3001 npm run dev
```

## Further Reading

- [API Reference](/docs/api-reference) — endpoint contract and config keys
- [Runtime Spec](/docs/runtime-spec) — deterministic behavior, cache semantics, limits, and hooks
- [Integration Cookbook](/docs/integration-cookbook) — production integration patterns and checklists
- [Plugin System](/docs/plugin-system) — extend the core with lifecycle hooks
- [CSS Strategies](/docs/css-strategies) — bundling patterns for CMS integration
- [Persistence Layer](/docs/persistence-layer) — design report for database-backed caching
