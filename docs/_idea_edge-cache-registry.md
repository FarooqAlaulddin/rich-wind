# Edge Cache Registry

Shared edge caching for compiled CSS can reduce repeat compilation across multiple Rich Wind instances.

## Goals

- Reuse artifacts across replicas and restarts.
- Improve tail latency on first-request traffic.
- Lower aggregate compile CPU under burst load.

## Cache Key

Use a deterministic key composed of:

- `projectId`
- `pageId`
- `bundle`
- `hash` returned by `/api/compile`

Suggested key format:

```txt
rw:v1:{projectId}:{pageId}:{bundle}:{hash}
```

## Request Flow

1. Wrapper computes cache key from request context.
2. Wrapper checks edge cache for CSS artifact.
3. On hit, return cached CSS.
4. On miss, call Rich Wind core endpoint.
5. Store response artifact with TTL and return it.

## Storage Policy

- Short TTL for page-level artifacts.
- Longer TTL for project aggregate artifacts where stable.
- `stale-while-revalidate` for hot keys.
- Optional compression for large CSS payloads.

## Guardrails

- Enforce tenant-scoped `projectId` at wrapper boundary.
- Cap max object size for cache entries.
- Rate-limit cache-miss amplification paths.
- Record cache errors without failing open API traffic.

## Metrics

- edge hit ratio
- miss ratio
- revalidation count
- origin compile latency
- saved origin compile count

## Open Questions

- Invalidation strategy for tenant-wide style shifts.
- Multi-region replication tradeoffs (latency vs consistency).
- Cost crossover point vs in-memory-only operation.
