# Runtime Spec

This document explains how Rich Wind works under the hood — how it compiles CSS, how the cache behaves, what the cacheStore adapter interface looks like, and how bundle splitting works.

## Compilation Pipeline

When a request hits `/api/compile`, Rich Wind goes through these steps:

**Class extraction.** If the request includes `html`, it's scanned for class candidates using Tailwind's `Scanner` (from `@tailwindcss/oxide`). Each candidate is checked against the Tailwind design system to confirm it's a real utility class. Invalid candidates are discarded.

**Class normalization.** If the request includes a `classes` field, it's normalized into an array. Strings are split on whitespace. Arrays are flattened (nested strings are split too). Empty tokens are removed.

**Merging.** Classes from HTML extraction and the `classes` field are combined into a `Set` (removing duplicates), validated again, and sorted alphabetically. This sorted list is the canonical representation of the page's classes.

**Hashing.** The sorted class list is joined with `|` and hashed with SHA-256. This hash is the cache key — two requests with the same set of classes will always produce the same hash, regardless of the order they were sent in.

**Compilation.** The validated classes are compiled through `@tailwindcss/node` using `@source inline(...)` directives. The Tailwind design system is loaded once at startup and reused for all requests.

## Cache

All cache state lives in process memory. Restarting the process clears it.

### Page Cache

Each compiled page is stored by `projectId + pageId`. A page entry holds:

- The set of classes on that page
- The content hash
- Compiled CSS for each bundle type (`full`, `utilities`, `theme`) — only the ones that have been requested
- `updatedAt` and `expiresAt` timestamps

The cache uses a **sliding TTL**: every time a page is accessed (compiled, read via `/api/css`, etc.), its `expiresAt` is reset to `now + cacheTtlMs`. Pages that go untouched for longer than the TTL are considered expired and evicted on next access.

There's also a **global page cap** (`cacheMaxPages`, default 200) across all projects. When the cap is reached, the least-recently-used page is evicted. This is tracked with an LRU map — every access moves the page to the end of the queue.

When a page is evicted, its classes are decremented from the project's class count map. If a project has no pages left, the project is removed entirely.

### Project Cache

`GET /api/projects/:projectId/css` returns a stylesheet compiled from the union of all classes across all cached pages in a project. This aggregated CSS has its own cache entry with its own TTL (`projectCacheTtlMs`).

The project cache is automatically invalidated whenever a page in that project is added, removed, or changes its class set. So you don't need to worry about staleness — the next project CSS request after a page change will recompile.

### Base CSS

The `base` bundle (Tailwind's preflight reset) doesn't depend on any classes. It's compiled once at first request and cached for the entire process lifetime.

## cacheStore

By default, cache lives only in memory. If the process restarts, everything is gone. The `cacheStore` option lets you add a persistence layer so cached artifacts survive restarts and can be shared across instances.

A cacheStore is an object you pass to `createCore()`. It has four methods — two for page artifacts, two for project artifacts:

### readPageArtifact

Called when a page isn't found in memory and Rich Wind checks the store before recompiling.

**Receives:**

```js
{
  projectId: "my-app",   // which project
  pageId: "hero",        // which page
  bundle: "full",        // normalized bundle type
  now: 1707800000000     // current timestamp in ms
}
```

**Should return** an artifact object or `null`. An artifact looks like:

```js
{
  css: "/* compiled CSS */",
  classes: ["p-4", "text-red-500"],  // the class list (needed to rebuild project aggregates)
  hash: "a1b2c3...",                 // content hash
  updatedAt: 1707799000000,          // when this was last compiled
  expiresAt: 1707800600000,          // when this artifact expires
  source: "compile"                  // optional metadata
}
```

The `classes` array is important — without it, Rich Wind can't reconstruct the project's class count map, so it can't generate project-level CSS. If your store returns an artifact without `classes`, the page CSS will be served but the page won't contribute to project aggregation.

### upsertPageArtifact

Called after a successful compile to persist the result. Fires asynchronously after the response is sent, so it never adds latency.

**Receives:**

```js
{
  projectId: "my-app",
  pageId: "hero",
  bundle: "full",
  css: "/* compiled CSS */",
  hash: "a1b2c3...",
  classes: ["p-4", "text-red-500"],
  cached: false,
  updatedAt: 1707800000000,
  expiresAt: 1707800600000
}
```

Your implementation should write this to whatever storage you're using. The `expiresAt` field tells you when this artifact can be pruned.

### readProjectArtifact

Called when project-level CSS (`GET /api/projects/:id/css`) isn't found in memory.

**Receives:**

```js
{
  projectId: "my-app",
  bundle: "full",
  now: 1707800000000
}
```

**Should return** an artifact object or `null`:

```js
{
  css: "/* aggregated CSS */",
  hash: "d4e5f6...",
  updatedAt: 1707799000000,
  expiresAt: 1707800600000
}
```

### upsertProjectArtifact

Called after project-level CSS is compiled, to persist the aggregate. Also fires asynchronously.

**Receives:**

```js
{
  projectId: "my-app",
  bundle: "full",
  css: "/* aggregated CSS */",
  hash: "d4e5f6...",
  cached: false,
  updatedAt: 1707800000000,
  expiresAt: 1707800600000
}
```

### Failure behavior

The cacheStore is **fail-open**. If any method throws an error or exceeds `cacheStoreTimeoutMs` (default 150ms), the request continues normally using in-memory cache. The error is reported to plugins through the [`onError` hook](/docs/plugin-system#error-handling) with `stage: "cache-store"`, but it never fails the HTTP request.

This means your store implementation doesn't need to be bulletproof. If your database is slow or down, Rich Wind keeps working — it just falls back to in-memory only until the store recovers.

### Artifact validation

Rich Wind validates every artifact returned by the store before using it. An artifact is rejected (treated as a cache miss) if:

- `css` is missing or not a string
- `css` exceeds `maxCssChars`
- `expiresAt` is in the past
- `classes` is provided but can't be normalized (not a string or array, or exceeds `maxClassCount`)

This protects against stale or corrupt data in the store.

## Bundle Splitting

When you request `theme` or `utilities` bundles, Rich Wind compiles the full set of classes (minus preflight) and then splits the output:

- **Theme** — everything inside `:root, :host { ... }` blocks. These are the CSS custom properties that define colors, spacing, font sizes, etc.
- **Utilities** — everything else. The actual utility rules like `.bg-red-500 { ... }`.

Both are generated from a single Tailwind compile and split by pattern-matching the CSS output. This means requesting `theme` and `utilities` separately is not slower than requesting `full` — the compilation happens once and the result is cached per bundle.

The `base` bundle (preflight) is compiled separately since it doesn't depend on any classes.

## Rate Limiting

Rich Wind includes a per-IP rate limiter using a fixed-window algorithm. Each IP address gets `rateLimitMax` requests (default 60) per `rateLimitWindowMs` (default 60 seconds). When the limit is hit, the response is `429` with a `Retry-After` header indicating how many seconds until the window resets.

The rate limiter runs per-process. If you're running multiple replicas behind a load balancer, each replica tracks its own counters — so the effective limit per IP is `rateLimitMax * replicaCount`.

Set `rateLimitDisabled: true` if you handle rate limiting at the gateway level. If Rich Wind is behind a reverse proxy, set `trustProxy: true` so it reads the real client IP from `X-Forwarded-For` instead of seeing the proxy's IP.

## Security Headers

Every response includes these headers:

| Header | Value | Purpose |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `Referrer-Policy` | `no-referrer` | No referrer sent on navigation |
| `X-Frame-Options` | `DENY` | Prevents embedding in iframes |
| `Cross-Origin-Resource-Policy` | `same-origin` | Blocks cross-origin resource loading |

## What the Core Doesn't Do

Rich Wind is intentionally limited in scope. It doesn't include:

- **Authentication or tenant enforcement.** It trusts whatever `projectId` you send. In production, put it behind a gateway that maps authenticated users to safe project IDs.
- **Persistent storage.** Cache is in-memory by default. Use the `cacheStore` adapter if you need persistence.
- **Custom Tailwind configuration.** It uses the default Tailwind design system. There's no API to upload a custom `tailwind.config.js` at request time.
- **Streaming responses.** Compilation finishes before the response is sent.
