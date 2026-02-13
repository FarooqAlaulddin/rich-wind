# Runtime Spec

This document describes Rich Wind runtime behavior in implementation terms.

## 1. Compilation model

Rich Wind compiles CSS on demand from request input:

- HTML scanned for class candidates
- explicit class lists
- merged, deduplicated, validated candidates

Compilation uses Tailwind runtime APIs (`@tailwindcss/node`, `@tailwindcss/oxide`) and builds CSS from `@source inline(...)` directives.

## 2. Input normalization

### Class normalization

- `classes` accepts:
  - string (`"bg-red-500 p-4"`)
  - array (`["bg-red-500", "p-4"]`)
- arrays are flattened/split on whitespace.
- empty/falsey tokens are removed.

### HTML extraction

- HTML is scanned with Tailwind oxide `Scanner`.
- candidate list is filtered by `designSystem.candidatesToCss(...)` to keep valid classes.

### Combined class list

- classes from HTML + `classes` input are merged via `Set`.
- final list is validated again and sorted lexicographically.

## 3. Determinism

- class order in request does not affect output hash.
- hash = SHA-256 of sorted class list joined by `|`.
- equivalent class sets produce stable hash and cache identity.

## 4. Bundles

Supported normalized bundles:

- `full`: preflight + theme + utilities
- `base`: preflight only
- `theme`: theme token variables only
- `utilities`: utility rules only

Bundle aliases are normalized (for example `preflight -> base`, `tokens -> theme`, `util -> utilities`).

### Theme/utilities split behavior

`theme` and `utilities` are generated together and split by extracting/removing `:root, :host` blocks.

Consumption rule: load `theme` before `utilities`.

## 5. Cache model

State is per process:

- `projects: Map<projectId, projectState>`
- `pageLru: Map<projectId::pageId, meta>`

Project state contains:

- `pages` map
- `classCounts` map
- cached aggregated CSS per bundle (`cssCache`, `themeCssCache`, `utilitiesCssCache`)

Page entry contains:

- per-bundle CSS (`css`, `themeCss`, `utilitiesCss`)
- `classes` set
- `hash`
- `updatedAt`
- `expiresAt`

### TTL and LRU

- page entries use sliding TTL (`cacheTtlMs`).
- project aggregated cache uses `projectCacheTtlMs`.
- page cap (`cacheMaxPages`) is global across all projects.
- LRU eviction removes oldest page and decrements project class usage counts.

### Base CSS cache

`base` bundle is generated once and cached process-wide.

## 6. Project aggregation semantics

`GET /api/projects/:projectId/css` compiles from sorted unique keys of `project.classCounts`.

This is the union of currently cached page classes in that project after TTL and LRU effects.

## 7. Suggestion pipeline

`POST /api/suggest` fills suggestions in this order:

1. classes from request body
2. project class list sorted by frequency desc, then name asc
3. static fallback classes (if enabled and prefix provided)

Fallback path:

- first tries Tailwind design-system static class list
- if no static matches, uses local compact fallback data (`services/tailwind-suggestions.json`)

Notes:

- suggestions are unique and prefix-filtered.
- fallback only runs when `prefix` is non-empty.
- arbitrary values are not enumerated by fallback generation.

## 8. Validation and limits

Core validations:

- ID format and length
- body JSON size (`maxBodyBytes`)
- HTML char length (`maxHtmlChars`)
- class string char length (`maxClassChars`) for string input
- resolved class count (`maxClassCount`)

Rate limiter:

- per-IP fixed window
- `rateLimitWindowMs`, `rateLimitMax`
- returns `429` with `Retry-After`

## 9. Error semantics

- `400`: validation/no-valid-classes conditions
- `404`: cache misses/project not found
- `413`: size/class count limits
- `429`: rate limit
- `500`: unexpected error

## 10. Plugin runtime semantics

Plugins are lifecycle hooks around request, compile, cache, suggest, and errors.

Hook behavior:

- hooks run in plugin registration order
- per-hook timeout enforced
- hook errors do not crash the server
- `onError` is invoked for hook failures/timeouts
- deferred hooks (`defer`/`deferHooks`) run asynchronously via microtask queue

See [Plugin System](/docs/plugin-system) for API shape and examples.

## 11. Config precedence

Config resolution order:

1. `createCore({ config })` / top-level options
2. environment variables
3. internal defaults

Invalid values fall back to defaults.

## 12. Non-goals in current core

- no built-in auth/session/tenant enforcement
- no built-in persistent storage or cross-node cache
- no request-time Tailwind config/theme file ingestion API
- no streaming compile responses

## 13. Operational implications

- restart clears in-memory page/project caches.
- horizontal scaling creates cache fragmentation without external persistence.
- cold paths (first compile/suggest) are slower than warmed paths.
- production systems should layer:
  - auth and tenant scoping
  - observability
  - queueing/backpressure
  - optional artifact persistence

See [Integration Cookbook](/docs/integration-cookbook) for deployment patterns.
