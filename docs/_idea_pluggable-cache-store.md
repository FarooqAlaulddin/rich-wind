# Pluggable Cache Store

Introduce an optional cache-store adapter so Rich Wind can persist and read cached artifacts without exposing internal in-memory maps.

## Problem

Current core cache is process-local memory:

- cache is lost on restart
- cache is fragmented across replicas
- persistence requires wrapper/service workarounds

At the same time, exposing raw internal cache schema would tightly couple external integrations to internals.

## Goals

- Add a minimal, explicit persistence seam to `createCore`.
- Keep current behavior unchanged by default.
- Preserve deterministic compile/cache behavior.
- Keep failure mode fail-open so compile traffic remains reliable.

## Non-Goals

- Core-owned database schema/migrations.
- Arbitrary plugin mutation of internal cache maps.
- Breaking changes to existing endpoints/hooks.

## Proposed Core API

```ts
createCore({
  config,
  plugins,
  pluginTimeoutMs,
  cacheStore,           // optional
  cacheStoreTimeoutMs,  // optional, default from core/env
})
```

Suggested env fallback:

- `RW_CACHE_STORE_TIMEOUT_MS`

## Proposed Store Interface

```ts
type Bundle = "full" | "base" | "theme" | "utilities";

interface CacheStore {
  readPageArtifact?(input: {
    projectId: string;
    pageId: string;
    bundle: Bundle;
    now: number;
  }): Promise<null | {
    css: string;
    hash?: string;
    classes?: string[];
    updatedAt?: number;
    expiresAt?: number;
    source?: string;
  }>;

  upsertPageArtifact?(input: {
    projectId: string;
    pageId: string;
    bundle: Bundle;
    css: string;
    hash: string;
    classes: string[];
    cached: boolean;
    updatedAt: number;
    expiresAt: number;
  }): Promise<void>;

  readProjectArtifact?(input: {
    projectId: string;
    bundle: Bundle;
    now: number;
  }): Promise<null | {
    css: string;
    hash?: string | null;
    updatedAt?: number;
    expiresAt?: number;
    source?: string;
  }>;

  upsertProjectArtifact?(input: {
    projectId: string;
    bundle: Bundle;
    css: string;
    hash: string | null;
    cached: boolean;
    updatedAt: number;
    expiresAt: number;
  }): Promise<void>;
}
```

## Read Path (Memory-First)

### `GET /api/css`

1. Try in-memory cache first.
2. On miss, call `cacheStore.readPageArtifact`.
3. On valid hit, return CSS.
4. If classes/hash are present and valid, hydrate in-memory page/class counts.
5. On timeout/error/invalid payload, treat as miss (existing 404 behavior).

### `GET /api/projects/:projectId/css`

1. Try in-memory project cache first.
2. On miss, call `cacheStore.readProjectArtifact`.
3. On valid hit, return CSS.
4. On timeout/error/invalid payload, keep existing not-found behavior.

## Write Path

### `POST /api/compile`

1. Compile and update in-memory state as today.
2. Best-effort async `upsertPageArtifact`.
3. Persistence errors go to `onError`; response still succeeds.

### Project aggregate generation

1. Generate/serve project CSS as today.
2. Best-effort async `upsertProjectArtifact`.
3. Persistence errors do not fail request.

## Failure Semantics

- Default mode: fail-open.
- Store timeout/error is treated as cache miss or skipped write.
- Core availability is prioritized over persistence availability.

## Invariants and Validation

Store payloads should be validated before hydration:

- IDs match current validation rules.
- `classes` are normalized, valid, sorted.
- `hash` matches normalized classes (or is recomputed).
- Expired artifacts are ignored.
- Oversized CSS artifacts are rejected by configured guardrails.

## Edge Cases and Mitigations

- Restart + first compile on existing page:
  - pre-hydrate old page artifact before class-delta accounting.
- Partial bundle availability:
  - serve available artifact; do not assume full/theme/utilities all exist.
- Corrupt artifacts:
  - reject and fall back to current core path.
- Slow store:
  - bounded timeout per store operation.

## Rollout

1. Add interface and in-memory default behavior unchanged.
2. Enable adapter usage only when `cacheStore` is provided.
3. Start with compile + page/project CSS read/write integration.
4. Add metrics for store hit/miss/timeout/error before broader adoption.

## Compatibility with Other Ideas

- Complements [Persistence Layer](/docs/persistence-layer): persistence adapter can implement this interface.
- Complements [Edge Cache Registry](/docs/edge-cache-registry): edge cache remains a latency layer, not source of truth.
- Works independently of [Plugin Enrichment Hooks](/docs/plugin-enrichment-hooks): this provides a direct core seam for persistence.
