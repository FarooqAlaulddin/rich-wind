# Rich Wind

Rich Wind is a runtime Tailwind CSS core and API. It compiles CSS from HTML/class input, caches by `projectId` + `pageId`, and can share artifacts across replicas with a pluggable `cacheStore`.

Live links:
- Demo: https://rich-wind.thinkly.dev/
- Docs: https://rich-wind.thinkly.dev/docs/

## Why It Helps

- Supports dynamic content where classes are only known at runtime.
- Removes the need to run a Tailwind build pipeline in each host app.
- Gives you cache control per `projectId` and `pageId` for fast repeat requests.
- Works in single-node or multi-replica deployments with a shared `cacheStore`.

## When to Use It

- You run a CMS, visual builder, template/email editor, or preview system.
- You need CSS generation for user-created or tenant-created pages.
- You want a central CSS runtime service used by multiple products.

## When Not to Use It

- Your UI is static and build-time Tailwind already fits your workflow.
- You do not want runtime compute/network overhead for CSS generation.
- You need direct support for arbitrary user-uploaded Tailwind configs at request time.

## Background
Rich Wind focuses on the “compile at request time” workflow. By default cache state is in-process memory, and host apps can optionally plug in a `cacheStore` adapter for read-through/write-through persistence. It’s intentionally auth‑agnostic and expects callers to scope `projectId` within their own tenant model.

## Features
- Compile CSS from HTML, class strings, or both.
- In‑memory page cache plus aggregated project CSS.
- Optional pluggable cache store (`cacheStore`) for memory-first read-through and best-effort write-through persistence.
- Optional output bundles: full (preflight + theme + utilities), preflight‑only, theme‑only, or utilities‑only.
  - When using `bundle=utilities`, load the matching `bundle=theme` output first so the CSS variables exist.
- Class suggestions from cached data and Tailwind’s static design system.
- Simple JSON API with small surface area.

## Install

```bash
npm install
```

## Usage

### Programmatic usage (core + plugins)

```js
import { createCore } from "rich-wind";

const { app, close } = await createCore({
  cacheStore: {
    async readPageArtifact({ projectId, pageId, bundle, now }) {
      return null;
    },
    async upsertPageArtifact(input) {},
    async deletePageArtifact({ projectId, pageId, bundle }) {},
    async deleteProjectPageArtifacts({ projectId }) {},
    async readProjectArtifact({ projectId, bundle, now }) {
      return null;
    },
    async upsertProjectArtifact(input) {},
    async deleteProjectArtifact({ projectId, bundle }) {},
    async readPluginData({ pluginName, key }) {
      return null;
    },
    async writePluginData({ pluginName, key, value }) {},
    async deletePluginData({ pluginName, key }) {},
    async listPluginData({ pluginName, prefix }) {
      return [];
    },
  },
  cacheStoreTimeoutMs: 150,
  plugins: [
    {
      name: "logger",
      async setup(ctx) {
        // Plugin-scoped durable storage (optional, if cacheStore implements it)
        await ctx.storage.set("booted", true);
      },
      onCompileStart: ({ projectId, pageId }) => {
        console.log("compile start", projectId, pageId);
      },
    },
  ],
});

app.listen(3001);
process.on("SIGTERM", close);
process.on("SIGINT", close);
```

Plugins are optional and isolated: hook errors are caught and forwarded to `onError`.

Available hooks:
- `onRequestStart`
- `onResponseSent`
- `onCompileStart`
- `onCompileResult`
- `onCacheHit`
- `onCacheMiss`
- `onProjectCss`
- `onSuggest`
- `onError`

Plugin options:
- `name` (string) — for error reporting.
- `defer` (boolean) — run all hooks asynchronously (non‑blocking).
- `deferHooks` (string[]) — defer only specific hooks.
- `timeoutMs` (number) — per‑hook timeout before `onError` is called.

Plugin setup context includes `storage`:
- `ctx.storage.get(key)` -> value | `null`
- `ctx.storage.set(key, value)` -> `true` | `false`
- `ctx.storage.delete(key)` -> `true` | `false`
- `ctx.storage.list(prefix?)` -> `string[]`

Plugin setup context also includes cache mutation helpers:
- `ctx.evictPage(projectId, pageId)` / `ctx.evictProject(projectId)` (memory-only)
- `ctx.purgePage(projectId, pageId)` / `ctx.purgeProject(projectId)` (memory + best-effort cacheStore delete-through)

Storage keys must match `[a-zA-Z0-9._:-]{1,128}` and are automatically namespaced per plugin.
Storage prefixes for `list(prefix)` must match `[a-zA-Z0-9._:-]{0,128}`.
Storage methods are always available, even when no `cacheStore` is configured.
Durability requires `cacheStore` to implement `readPluginData` / `writePluginData` / `deletePluginData` / `listPluginData`.
Delete-through purging additionally requires `cacheStore.deletePageArtifact` / `cacheStore.deleteProjectArtifact`.
For `ctx.purgeProject(projectId)` to remove remote page artifacts from cold replicas (no local page list), implement `cacheStore.deleteProjectPageArtifacts`.
Missing methods, no adapter, failures, and timeouts are fail-open and reported through `onError`.
Adapters are responsible for value serialization; plugin values should be JSON-serializable for portable behavior.

Global plugin timeout can also be set via `createCore({ pluginTimeoutMs })` or `RW_PLUGIN_TIMEOUT_MS`.
Cache store timeout can be set via `createCore({ cacheStoreTimeoutMs })` or `RW_CACHE_STORE_TIMEOUT_MS`.

### Replica Roles (Simple)

Use this when running multiple replicas:

| Role | Use it for | Write behavior |
| --- | --- | --- |
| `writer` | compile requests and plugin writes | allowed |
| `reader` | serving CSS and suggestions | blocked |
| `hybrid` (default) | single-node or simple deployments | allowed |

On reader nodes:
- `POST /api/compile` returns `409` with code `READ_ONLY_REPLICA`
- write helpers do not run:
  - `ctx.compile()` returns `{ status: 409, code: "READ_ONLY_REPLICA" }`
  - `ctx.purge*()` / `ctx.hydrate*()` return `false`
  - `ctx.evict*()` does nothing
  - `ctx.storage.set/delete` return `false`

For production, keep writers and readers on the same shared `cacheStore`.

### Run the core API

```bash
npm run start
```

Default base URL: `http://localhost:3001`

### Run the UI demo (optional)

```bash
cd demo
npm install
VITE_RW_CORE_URL=http://localhost:3001 npm run dev
```

## API

### `POST /api/compile`
Compile CSS for a page.

Request body:

```json
{
  "projectId": "string (required)",
  "pageId": "string (optional, default: \"default\")",
  "html": "string (optional)",
  "classes": "string | string[] (optional)",
  "bundle": "\"full\" | \"base\" | \"theme\" | \"utilities\" (optional, default: \"full\")"
}
```

At least one of `html` or `classes` is required unless `bundle` is `base`.

If this node is configured as `nodeRole=reader`, this endpoint returns `409` with `code: "READ_ONLY_REPLICA"`.

Response:

```json
{
  "success": true,
  "projectId": "string",
  "pageId": "string",
  "bundle": "string",
  "hash": "string",
  "classes": ["string"],
  "cached": true,
  "css": "string"
}
```

Example:

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "demo",
    "pageId": "hero",
    "html": "<div class=\"text-red-500\">Hello</div>",
    "classes": ["bg-blue-500", "p-4"]
  }'
```

Utilities only (no preflight/theme):

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "demo", "pageId": "hero", "classes": "bg-red-500", "bundle": "utilities" }'
```

Theme only (design tokens only):

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "demo", "pageId": "hero", "classes": "bg-red-500 text-white", "bundle": "theme" }'
```

If you split theme + utilities, load `theme` before `utilities`.

Preflight only:

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "demo", "bundle": "base" }'
```

### `GET /api/css`
Fetch cached CSS for a page.

Query:

```text
projectId (required)
pageId (optional, default: "default")
bundle (optional: "full" | "base" | "theme" | "utilities")
```

Response: `text/css`

Example:

```bash
curl "http://localhost:3001/api/css?projectId=demo&pageId=hero"
```

Utilities only:

```bash
curl "http://localhost:3001/api/css?projectId=demo&pageId=hero&bundle=utilities"
```

Preflight only:

```bash
curl "http://localhost:3001/api/css?projectId=demo&pageId=hero&bundle=base"
```

Theme only:

```bash
curl "http://localhost:3001/api/css?projectId=demo&pageId=hero&bundle=theme"
```

### `GET /api/projects/:projectId/css`
Fetch aggregated CSS for a project (union of cached pages).

Response: `text/css`

Example:

```bash
curl "http://localhost:3001/api/projects/demo/css"
```

Utilities only:

```bash
curl "http://localhost:3001/api/projects/demo/css?bundle=utilities"
```

Preflight only:

```bash
curl "http://localhost:3001/api/projects/demo/css?bundle=base"
```

Theme only:

```bash
curl "http://localhost:3001/api/projects/demo/css?bundle=theme"
```

### `POST /api/suggest`
Class suggestions from cached data and Tailwind’s static list. Arbitrary values are not enumerated.

Request body:

```json
{
  "projectId": "string (optional)",
  "prefix": "string (optional)",
  "classes": "string | string[] (optional)",
  "limit": "number (optional)"
}
```

Response:

```json
{
  "success": true,
  "projectId": "string | null",
  "prefix": "string",
  "count": 10,
  "suggestions": ["string"]
}
```

Example:

```bash
curl -X POST http://localhost:3001/api/suggest \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "demo", "prefix": "bg-", "limit": 8 }'
```

### `GET /health`
Health check.

Response:

```json
{ "status": "ok" }
```

## Configuration

Programmatic configuration (core):

```js
import { createCore } from "rich-wind";

const app = createCore({
  config: {
    maxClassCount: 1200,
    cacheTtlMs: 5 * 60 * 1000,
    projectCacheTtlMs: 10 * 60 * 1000,
    suggestLimit: 75,
    rateLimitDisabled: true
  }
});
```

Supported config keys:

| Key | Purpose |
| --- | --- |
| `maxBodyBytes` | Request size limit |
| `maxHtmlChars` | Max HTML length |
| `maxClassChars` | Max class string length |
| `maxClassCount` | Max class count |
| `maxIdLength` | Max `projectId`/`pageId` length |
| `maxCssChars` | Max CSS payload length accepted from cacheStore artifacts |
| `cacheMaxPages` | Max cached pages |
| `cacheTtlMs` | Page cache TTL |
| `projectCacheTtlMs` | Project CSS TTL |
| `suggestLimit` | Max suggestions |
| `suggestFallback` | Include Tailwind static list |
| `rateLimitWindowMs` | Rate limit window |
| `rateLimitMax` | Requests per window |
| `rateLimitDisabled` | Disable rate limiting |
| `trustProxy` | Trust proxy IPs |
| `nodeRole` | Replica role: `hybrid` (default), `writer`, or `reader` |
| `corsOrigin` | CORS allowlist (`*` or comma-separated origins) |

Additional top-level options:

| Option | Purpose |
| --- | --- |
| `pluginTimeoutMs` | Default plugin hook timeout (ms) |
| `cacheStore` | Optional read-through/write-through persistence adapter |
| `cacheStoreTimeoutMs` | Per-operation cacheStore timeout (ms) |

Environment variables (core):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `RW_CACHE_MAX_PAGES` | `200` | Max cached pages |
| `RW_CACHE_TTL_MS` | `600000` | Page cache TTL |
| `RW_PROJECT_CACHE_TTL_MS` | `600000` | Project CSS TTL |
| `RW_MAX_BODY_BYTES` | `100000` | Request size limit |
| `RW_MAX_HTML_CHARS` | `50000` | Max HTML length |
| `RW_MAX_CLASS_CHARS` | `10000` | Max class string length |
| `RW_MAX_CLASS_COUNT` | `1500` | Max class count |
| `RW_MAX_ID_LENGTH` | `64` | Max `projectId`/`pageId` length |
| `RW_MAX_CSS_CHARS` | `2000000` | Max CSS length accepted from cacheStore artifacts |
| `RW_SUGGEST_LIMIT` | `100` | Max suggestions |
| `RW_SUGGEST_FALLBACK` | `true` | Include Tailwind static list |
| `RW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RW_RATE_LIMIT_MAX` | `60` | Requests per window |
| `RW_RATE_LIMIT_DISABLED` | `false` | Disable rate limiting |
| `RW_TRUST_PROXY` | `false` | Trust proxy IPs |
| `RW_NODE_ROLE` | `hybrid` | Replica role: `hybrid`, `writer`, `reader` |
| `RW_CORS_ORIGIN` | unset | CORS allowlist (`*` or comma-separated origins) |
| `RW_PLUGIN_TIMEOUT_MS` | `200` | Default plugin hook timeout (ms) |
| `RW_CACHE_STORE_TIMEOUT_MS` | `150` | Cache store operation timeout (ms) |

Notes:
- `PORT` only applies when running `node services/index.js`. In embedded mode, you call `app.listen(...)`.
- `RW_PLUGIN_TIMEOUT_MS` maps to the top-level `pluginTimeoutMs` option, not `config`.
- `RW_CACHE_STORE_TIMEOUT_MS` maps to the top-level `cacheStoreTimeoutMs` option, not `config`.
- Recommended single-writer deployment: run write replicas with `nodeRole=writer`, read replicas with `nodeRole=reader`, and point both at the same `cacheStore`.
- Precedence: JS options win over env vars. Invalid values fall back to defaults.

Environment variables (UI):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_RW_CORE_URL` | `http://localhost:3001` | Core API base URL |

## Development

```bash
npm test
npm run test:pack
```

Load test (single writer + many readers):

```bash
# local topology managed by the script
npm run test:load

# override shape
RW_LOAD_DURATION_MS=60000 RW_LOAD_CONCURRENCY=80 RW_LOAD_WRITE_RATIO=0.1 npm run test:load

# target existing deployment
RW_LOAD_WRITER_URL=https://writer.example.com \
RW_LOAD_READER_URLS=https://reader-a.example.com,https://reader-b.example.com \
npm run test:load
```

## Production

Core:

```bash
npm run prod
```

UI (demo workspace):

```bash
npm run build --workspace=demo
npm run preview --workspace=demo -- --host 0.0.0.0 --port 4173
```

## Docs

Docs live in `/docs` (Markdown) and are rendered inside the UI at `/docs`:

```bash
npm run dev --workspace=demo
```

## License

MIT. See `LICENSE`.
