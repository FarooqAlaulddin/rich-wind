# Runtime Spec

The operational contract: what the cache does, what a `cacheStore` must implement, what each replica role can do, and where the core stops and the host starts. Defaults are in [Configuration](api-reference.html#configuration).

## Caching

- Cache is in process memory, per process. A restart clears it unless a `cacheStore` holds the artifacts.
- A page is keyed by `projectId` + `pageId`. The `hash` is the identity of the class set (also the ETag), not the key.
- Page TTL is sliding (`cacheTtlMs`, reset on access); `cacheMaxPages` is a global LRU cap across projects. Expired entries are evicted when read, there is no background sweep.
- Project CSS is the union of the classes of the project's pages held in memory. It is recompiled after any page in the project is added, removed, or changes, and has a fixed TTL (`projectCacheTtlMs`) that a hit does not extend.
- `GET /api/css` and `core.getCss` never compile new classes. After expiry or eviction, with no store holding the entry, they return `404`; only compile rebuilds.
- Split bundles are stored per half: requesting `theme` and then `utilities` for the same page compiles twice.

## cacheStore

An object passed to `createCore({ cacheStore })` that persists artifacts and plugin data so they survive restarts and are shared between replicas. Exact types: `services/index.d.ts` (`CacheStoreAdapter`). Working adapters: [Redis](integration-cookbook.html#redis-cachestore), [filesystem](integration-cookbook.html#filesystem-cachestore).

| Method | Called when | Receives | Returns |
| --- | --- | --- | --- |
| `readPageArtifact` | Page not in memory (compile pre-hydration and `GET /api/css`) | `projectId, pageId, bundle, now` | artifact or `null` |
| `upsertPageArtifact` | After a compile | `projectId, pageId, bundle, css, hash, classes, cached, updatedAt, expiresAt` | ignored |
| `deletePageArtifact` | `ctx.purgePage` and `POST /api/invalidate` with a `pageId`, once per bundle (`full`, `utilities`, `theme`) | `projectId, pageId, bundle` | ignored |
| `readProjectArtifact` | Project CSS requested and the project has no pages in memory | `projectId, bundle, now` | artifact or `null` |
| `upsertProjectArtifact` | Every project CSS read served from memory on a writer or hybrid node | `projectId, bundle, css, hash, cached, updatedAt, expiresAt` | ignored |
| `deleteProjectArtifact` | `ctx.purgeProject` and `POST /api/invalidate` without a `pageId`, once per bundle | `projectId, bundle` | ignored |
| `deleteProjectPageArtifacts` | `ctx.purgeProject` and `POST /api/invalidate` without a `pageId` | `projectId` | ignored |
| `readPluginData` | `ctx.storage.get` | `pluginName, key` | value or `null` |
| `writePluginData` | `ctx.storage.set` | `pluginName, key, value` | ignored |
| `deletePluginData` | `ctx.storage.delete` | `pluginName, key` | ignored |
| `listPluginData` | `ctx.storage.list` | `pluginName, prefix` | array of keys |

An artifact is `{ css, hash, updatedAt, expiresAt, classes? }`.

- Every method is optional. A missing method is reported once through `onError` with code `CACHE_STORE_METHOD_MISSING`.
- Fail-open: a throw or timeout never fails the request. It is reported to [`onError`](plugin-system.html#hooks) with `stage: "cache-store"` and the request continues from memory. Purges return `false`.
- The timeout is per call and is the top-level `cacheStoreTimeoutMs` option (not inside `config`). It stops core from waiting; it does not cancel the call.
- Writes are queued without blocking the compile response, and their return values are ignored.
- Page artifacts need `classes` to be hydrated into memory or counted in project CSS. Without `classes` they are still served by `GET`, but not hydrated, and compile pre-hydration skips them. With `classes`, the hash is recomputed from them.
- `expiresAt` is honoured. Expired, oversized (`maxCssChars`), or malformed artifacts count as a miss.
- A compile that misses memory can issue up to three sequential `readPageArtifact` calls (the requested bundle, then the other two of `full`, `utilities`, `theme`), each bounded by the timeout.
- `deleteProjectPageArtifacts` is needed for a purge from a cold replica, which has no local page list to delete per page.
- Plugin storage keys, fallbacks and role behaviour: [Plugin Storage](plugin-system.html#plugin-storage).

## Replica Roles

Set with `config.nodeRole` or `RW_NODE_ROLE`.

| Role | Can do | Cannot do |
| --- | --- | --- |
| `hybrid` (default) | Everything | Nothing blocked |
| `writer` | Compile, purge, hydrate, plugin storage writes | Nothing blocked |
| `reader` | Serve CSS, suggestions, plugin storage reads | `POST /api/compile` and `POST /api/invalidate` return `409 READ_ONLY_REPLICA`; `ctx.compile` throws a `RichWindError` with the same status and code; `ctx.purge*` and `ctx.hydrate*` return `false`; `ctx.evict*` does nothing; `ctx.storage.set/delete` are blocked |

- Readers read the store first. If the entry is missing there (or the store errors or times out), a reader returns `404` rather than stale local CSS; `resolvePageCss` and `resolveProjectCss` plugin hooks can still answer.
- Route writes to writers, reads to readers, and give both pools the same `cacheStore`.
- Caveat: keep one writer per project. A writer or hybrid node that holds only some of a project's pages builds the project aggregate from those local pages and upserts it, overwriting a fuller one.

## Security Boundary

The core validates and bounds what it owns: input and body caps, cache caps, CSS output caps, and safe construction of Tailwind inline sources. The host owns the rest.

- **Host owns:** authentication, tenant-to-`projectId` mapping, authorization, rate limiting, TLS, CSP, logging, WAF. Core trusts whatever `projectId` it is sent.
- **Direct library calls bypass HTTP guards.** The host has already authorized them.
- **Plugin routes** under `/plugins/<name>/...` are reachable by anyone who can reach core. A plugin that exposes data or mutates state must enforce its own access policy, in a `guard` hook or in the route.
- **Guards fail open** if they throw or time out.
- **Compile concurrency** is capped (`maxConcurrentCompiles`, see [Configuration](api-reference.html#configuration)). When all slots are busy a compile is shed immediately with `503 SERVER_BUSY` and `Retry-After: 1`; there is no queue and no per-client fairness, so one client can hold every slot. The cap also bounds direct `core.compile` calls. A `ctx.compile` from a hook its parent awaits runs inside the parent's slot; from a deferred hook or a plugin route it takes its own and can be shed.
- **Class tokens** containing any of `( ) { } ; ,`, a newline, a carriage return, or NUL are put in `rejected` even if Tailwind would accept them.
- **Headers:** core sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and `Cross-Origin-Resource-Policy: same-origin` (`cross-origin` for CSS, the loader and reload scripts, and any response where CORS resolves an allowed origin). CSP, HSTS and cookies are the host's.

What the core does not do:

- Authentication, tenant enforcement, or rate limiting.
- Custom Tailwind configuration; it uses the default design system.
- Streaming responses; compilation finishes before the response is sent.

## Client IP and trustProxy

`trustProxy` follows Express `trust proxy` semantics: `true` or `false`, a hop count (`1`, `2`, ...), or a comma-separated list of addresses or subnets (`loopback` and `uniquelocal` also work). With `RW_TRUST_PROXY`, `1` is a hop count, not "trust all".

- `true` trusts the leftmost `X-Forwarded-For` entry, which the client controls. It is unsafe on the open internet. Use a hop count equal to the number of proxies in front of core that append to `X-Forwarded-For`, or a subnet list.
- Unset: core uses the socket address and ignores `X-Forwarded-For`, except when mounted in a host that already resolved `req.ip` (such as Express with `trust proxy`); then it uses the host's `req.ip`.
- For `core.fetch`, `trustProxy` applies to the `ip` you pass, as if it were the socket address.
- The resolved address reaches plugin hooks only (`request.ip`).
