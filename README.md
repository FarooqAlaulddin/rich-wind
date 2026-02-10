# Rich Wind

Rich Wind is a stateless Tailwind CSS runtime. It compiles CSS from live HTML and/or class lists and caches results in memory (LRU + TTL). There is no database; restart clears the cache.

## Why

- Compile Tailwind on demand for rich text / dynamic editors
- Avoid shipping a huge precompiled stylesheet
- Keep caching in memory and keep the service stateless

## How It Works (short)

1. Extracts valid Tailwind classes from HTML and/or a class list.
2. Compiles CSS for those classes using Tailwind’s node runtime.
3. Caches per `projectId + pageId` and can aggregate per project.

## Quick Start (Core API)

```bash
npm install
npm run start
```

Server listens on `http://localhost:3001` by default.

## Quick Start (UI Demo)

```bash
cd ui
npm install
npm run dev
```

By default the UI calls `http://localhost:3001`. To point elsewhere:

```bash
RW_CORE_URL="https://your-core-host" npm run dev
```

## API

### Common Concepts

Inputs:
| Concept | Details |
| --- | --- |
| `projectId` / `pageId` | Required for most endpoints. Max length `RW_MAX_ID_LENGTH`. Allowed chars: `a-z`, `A-Z`, `0-9`, `.`, `_`, `-`. |
| `html` | Optional HTML string scanned for Tailwind classes. |
| `classes` | Optional class list. Accepts a space-separated string or `string[]`. |

Resolution:
| Behavior | Details |
| --- | --- |
| Class extraction | Classes are collected from `html` and `classes`, de-duplicated, validated via Tailwind’s runtime, then sorted. |
| Validity | Invalid Tailwind candidates are dropped. If none remain, the request fails with `400`. |
| Hash | `hash` is a SHA-256 of the sorted class list (`classes.join('|')`). |

Errors:
| Shape | Example |
| --- | --- |
| JSON | `{"error":"Message here."}` |

Rate limiting:
| Header | Meaning |
| --- | --- |
| `Retry-After` | Seconds to wait before retry when you hit a `429`. |

### `POST /api/compile`

Compile CSS for a single `projectId + pageId` pair. Accepts HTML, classes, or both.

Request body (JSON only):

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | string | yes | — | Max length `RW_MAX_ID_LENGTH`. Allowed chars: `a-z`, `A-Z`, `0-9`, `.`, `_`, `-`. |
| `pageId` | string | no | `default` | Same validation as `projectId`. |
| `html` | string | no | — | At least one of `html` or `classes` must be provided. |
| `classes` | string or string[] | no | — | Space-separated string or array. Invalid classes are filtered. |
| `project_id` | string | no | — | Snake_case alias for `projectId`. |
| `page_id` | string | no | — | Snake_case alias for `pageId`. |

Response (JSON):

| Field | Type | Description |
| --- | --- | --- |
| `success` | boolean | `true` when compile succeeds. |
| `projectId` | string | Echoed project id. |
| `pageId` | string | Echoed page id. |
| `hash` | string | SHA-256 hash of the class set. |
| `classes` | string[] | Valid Tailwind classes used for compilation. |
| `cached` | boolean | `true` if served from cache. |
| `css` | string | Compiled CSS. |

Errors (JSON):

| Status | Reason |
| --- | --- |
| 400 | Missing `projectId`, invalid `projectId/pageId`, or no valid classes. |
| 413 | Body too large, `html` too large, `classes` too large, or class count exceeds limit. |
| 429 | Rate limit exceeded. |
| 500 | Server error. |

Example:

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "demo-project",
    "pageId": "hero",
    "html": "<div class=\"text-red-500\">Hello</div>",
    "classes": ["bg-blue-500", "p-4"]
  }'
```

```json
{
  "success": true,
  "projectId": "demo-project",
  "pageId": "hero",
  "hash": "7f2d...",
  "classes": ["bg-blue-500", "p-4", "text-red-500"],
  "cached": false,
  "css": "/* compiled css */"
}
```

### `GET /api/css`

Fetch cached CSS for a single project page.

Query params:

| Param | Required | Default | Notes |
| --- | --- | --- | --- |
| `projectId` | yes | — | Same validation as above. |
| `pageId` | no | `default` | Same validation as above. |
| `project_id` | no | — | Snake_case alias. |
| `page_id` | no | — | Snake_case alias. |

Response: `text/css` (200)

Errors: `400` invalid/missing ids, `404` cache miss, `429` rate limit, `500` server error. Errors return JSON with `{ "error": "..." }`.

Example:

```bash
curl "http://localhost:3001/api/css?projectId=demo-project&pageId=hero"
```

### `GET /api/projects/:projectId/css`

Fetch aggregated CSS for a project (union of cached pages).

Path params:

| Param | Required | Notes |
| --- | --- | --- |
| `projectId` | yes | Same validation as above. |

Response: `text/css` (200)

Errors: `400` invalid id, `404` project not found, `429` rate limit, `500` server error. Errors return JSON with `{ "error": "..." }`.

Example:

```bash
curl "http://localhost:3001/api/projects/demo-project/css"
```

### `POST /api/suggest`

Suggest Tailwind classes for autocomplete. Suggestions are derived from cached project classes, optional input classes, and Tailwind's built-in static class list (no arbitrary values). This is a lightweight helper, not a full language server.

Request body (JSON):

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `projectId` | string | no | — | If provided, suggestions are pulled from cached classes in that project. |
| `prefix` | string | no | `""` | Filters suggestions to those that start with this prefix. |
| `classes` | string or string[] | no | — | Optional input classes to include in suggestions. |
| `limit` | number | no | `RW_SUGGEST_LIMIT` | Max suggestions to return (clamped to `RW_SUGGEST_LIMIT`). |
| `project_id` | string | no | — | Snake_case alias for `projectId`. |

Response (JSON):

| Field | Type | Description |
| --- | --- | --- |
| `success` | boolean | `true` when request succeeds. |
| `projectId` | string \| null | Echoed project id if provided. |
| `prefix` | string | Echoed prefix. |
| `count` | number | Number of suggestions returned. |
| `suggestions` | string[] | Suggested class names. |

Errors (JSON): `400` invalid `projectId`, `429` rate limit, `500` server error.

Example:

```bash
curl -X POST http://localhost:3001/api/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "demo-project",
    "prefix": "bg-",
    "limit": 8
  }'
```

### `GET /health`

Health check.

Response (JSON):

```json
{ "status": "ok" }
```

Example:

```bash
curl http://localhost:3001/health
```

## Caching Behavior

- `POST /api/compile` caches by `projectId + pageId` and returns `cached: true|false`.
- `GET /api/css` returns the cached CSS for a page.
- `GET /api/projects/:projectId/css` returns the union of classes across cached pages.

## Limits & Safety Defaults

These are on by default in core to protect CPU/memory:

- Request body size caps
- HTML/class length caps
- Max class count
- Rate limiting
- Strict `projectId` / `pageId` validation

All limits are configurable via env vars (see below).

## Environment Variables

Core API:
- `PORT` (default: `3001`)
- `RW_CACHE_MAX_PAGES` (default: `200`)
- `RW_CACHE_TTL_MS` (default: `600000`)
- `RW_PROJECT_CACHE_TTL_MS` (default: `600000`)
- `RW_MAX_BODY_BYTES` (default: `100000`)
- `RW_MAX_HTML_CHARS` (default: `50000`)
- `RW_MAX_CLASS_CHARS` (default: `10000`)
- `RW_MAX_CLASS_COUNT` (default: `1500`)
- `RW_MAX_ID_LENGTH` (default: `64`)
- `RW_SUGGEST_LIMIT` (default: `50`)
- `RW_SUGGEST_FALLBACK` (`true` to include Tailwind static class list)
- `RW_RATE_LIMIT_WINDOW_MS` (default: `60000`)
- `RW_RATE_LIMIT_MAX` (default: `60`)
- `RW_RATE_LIMIT_DISABLED` (`true` to disable)
- `RW_TRUST_PROXY` (`true`/`1` to trust proxy IPs via `X-Forwarded-For`)

UI:
- `RW_CORE_URL` (default: `http://localhost:3001`)

## Tests

```bash
npm test
```

## Repo Layout

```
services/   # core API
ui/         # demo UI
tests/      # integration tests
```

## Requirements

- Node.js 20+
