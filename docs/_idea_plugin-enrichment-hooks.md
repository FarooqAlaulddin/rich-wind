# Plugin Enrichment Hooks

Extend the plugin system so plugins can influence core behavior, not only observe lifecycle events.

## Problem

Current plugin hooks are observer-oriented:

- hooks are executed for side effects
- hook outputs are ignored
- core read paths (`/api/css`, `/api/projects/:projectId/css`) always resolve from in-memory state

This limits first-class persistence and other behavior extensions that need controlled read-through or result shaping.

## Goals

- Add behavior-influencing extension points without breaking existing observer hooks.
- Keep deterministic core behavior by default.
- Provide explicit conflict resolution and timeout semantics.
- Enable persistence plugins to serve read hits directly when configured.

## Non-Goals

- Arbitrary plugin mutation of internal cache maps.
- Dynamic code loading at runtime.
- Implicit behavior changes with no config flag.

## Proposed Extension Model

Keep existing hooks unchanged and add new optional enrichment methods on plugins.

### 1) Read Providers (short-circuit capable)

```ts
resolvePageCss?: (ctx: {
  projectId: string;
  pageId: string;
  bundle: "full" | "base" | "theme" | "utilities";
  request: { ip: string; method: string; path: string };
}) => Promise<null | {
  css: string;
  hash?: string;
  classes?: string[];
  source?: string;
}>;

resolveProjectCss?: (ctx: {
  projectId: string;
  bundle: "full" | "base" | "theme" | "utilities";
  request: { ip: string; method: string; path: string };
}) => Promise<null | {
  css: string;
  hash?: string | null;
  source?: string;
}>;
```

Semantics:

- Run providers in plugin registration order.
- First non-null value wins.
- If all return `null`, use current core behavior.
- Timeouts/errors are routed to `onError` and treated as `null` (fail open).

### 2) Compile Input Transform

```ts
transformCompileInput?: (ctx: {
  projectId: string;
  pageId: string;
  bundle: "full" | "base" | "theme" | "utilities";
  html?: string;
  classes?: string | string[];
}) => Promise<null | Partial<{
  html: string;
  classes: string | string[];
  bundle: "full" | "base" | "theme" | "utilities";
}>>;
```

Semantics:

- Applied sequentially in registration order.
- Each transform receives the accumulated payload.
- Final payload still goes through existing core validation/limits.

### 3) Compile Result Transform

```ts
transformCompileResult?: (ctx: {
  projectId: string;
  pageId: string;
  bundle: "full" | "base" | "theme" | "utilities";
  css: string;
  classes: string[];
  hash: string;
  cached: boolean;
}) => Promise<null | Partial<{
  css: string;
  classes: string[];
  hash: string;
}>>;
```

Semantics:

- Sequential in registration order.
- Core revalidates transformed fields:
  - `classes` must remain valid + sorted + within limits.
  - `hash` must match normalized `classes`; otherwise recompute.
- Prevents integrity drift between classes/hash/cache identity.

## Route Integration

### `GET /api/css`

1. Current in-memory lookup path runs first.
2. On miss, run `resolvePageCss` chain.
3. If provider returns artifact, respond with provider CSS.
4. If no provider hit, keep current `404` behavior.

### `GET /api/projects/:projectId/css`

1. Current project in-memory path runs first.
2. On miss, run `resolveProjectCss` chain.
3. If provider returns artifact, respond with provider CSS.
4. Otherwise keep current not-found flow.

### `POST /api/compile`

1. Apply `transformCompileInput` chain before compile orchestration.
2. Run compile/cache logic as today.
3. Apply `transformCompileResult` chain before response and `onCompileResult`.

## Safety Controls

- `pluginTimeoutMs` continues to apply.
- New enrichers can be disabled globally with config:
  - `enablePluginEnrichment: false` (default `false` for first rollout).
- Observer hooks remain always available.
- On enrichment failure, core should continue with baseline behavior unless explicitly configured otherwise.

## Compatibility

- Existing plugins continue to work unchanged.
- New enrichment methods are optional.
- No breaking changes to current hook signatures.

## Testing Plan

- Provider chain precedence tests (first hit wins).
- Timeout/error fail-open tests for providers/transforms.
- Determinism tests ensuring transformed classes/hash consistency.
- Regression tests confirming existing observer hooks still fire in same order.

## Rollout

1. Introduce provider hooks for read miss paths behind feature flag.
2. Add compile transform hooks with strict validation.
3. Add metrics for enrichment hit rate and fallback rate.
4. Evaluate promoting feature flag default after production burn-in.
