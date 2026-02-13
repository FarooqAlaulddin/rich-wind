# Persistence Layer

Database-backed persistence for Rich Wind can be implemented as a plugin package plus a small wrapper service.

## Goals

- Preserve page and project CSS artifacts across process restarts.
- Track class usage history for analytics and tuning.
- Keep Rich Wind core API behavior unchanged.
- Support multiple storage backends behind one adapter interface.

## Dependency

This idea has two integration modes:

- Works now with current observer hooks plus a wrapper read-through service.
- Can support direct core read-through only if the enrichment-hook capability from [Plugin Enrichment Hooks](/docs/plugin-enrichment-hooks) is implemented.

## Proposed Package

Package name:

- `rich-wind-plugin-persist`

Primary export:

```js
import { createPersistencePlugin } from "rich-wind-plugin-persist";
```

Core wiring:

```js
import { createCore } from "rich-wind";
import { createPersistencePlugin } from "rich-wind-plugin-persist";

const app = createCore({
  pluginTimeoutMs: 200,
  plugins: [
    createPersistencePlugin({
      adapter: "postgres",
      connectionString: process.env.DATABASE_URL,
    }),
  ],
});

app.listen(3001);
```

## Hook Integration Model

Persistence writes should be driven by existing lifecycle hooks:

- `onCompileResult`: page-level artifacts (`projectId`, `pageId`, `bundle`, `hash`, `classes`, `css`).
- `onProjectCss`: project aggregate artifacts (`projectId`, `bundle`, `hash`, `css`).
- `onCacheHit` and `onCacheMiss`: cache telemetry.
- `onError`: persistence fault reporting.

Recommended plugin behavior:

- Use `deferHooks` for write-heavy hooks.
- Keep hook `timeoutMs` bounded.
- Use idempotent upserts keyed by stable identifiers.

Minimal pattern:

```js
import { createCore } from "rich-wind";

const writes = [];

const persistencePlugin = {
  name: "persist-write-behind",
  deferHooks: ["onCompileResult", "onProjectCss"],
  async onCompileResult({ projectId, pageId, bundle, hash, classes, css }) {
    writes.push({ type: "page", projectId, pageId, bundle, hash, classes, cssLength: css.length });
  },
  async onProjectCss({ projectId, bundle, hash, css }) {
    writes.push({ type: "project", projectId, bundle, hash, cssLength: css.length });
  },
};

createCore({ plugins: [persistencePlugin], pluginTimeoutMs: 200 });
```

## Read-Through Wrapper Pattern

Plugins cannot replace core response bodies. Persistent reads should be implemented in a wrapper layer:

1. Resolve tenant-scoped `projectId`.
2. Read artifact from durable store.
3. On miss, call Rich Wind core endpoint.
4. Write back asynchronously.
5. Return artifact to caller.

## Adapter Interface

```ts
interface PersistenceAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  upsertPageArtifact(input: {
    projectId: string;
    pageId: string;
    bundle: "full" | "base" | "theme" | "utilities";
    hash: string;
    css: string;
    classes: string[];
    cached: boolean;
    updatedAt: number;
  }): Promise<void>;

  upsertProjectArtifact(input: {
    projectId: string;
    bundle: "full" | "base" | "theme" | "utilities";
    hash: string | null;
    css: string;
    updatedAt: number;
  }): Promise<void>;

  incrementClassUsage(input: {
    projectId: string;
    className: string;
    delta: number;
    lastSeen: number;
  }): Promise<void>;
}
```

## Data Model

Suggested tables/collections:

- `page_artifacts` keyed by `project_id + page_id + bundle`.
- `project_artifacts` keyed by `project_id + bundle`.
- `class_usage` keyed by `project_id + class_name`.
- Optional `outbox` for retryable async writes.

## Reliability

- Write-behind queue with bounded concurrency.
- Retry policy with exponential backoff.
- Dead-letter capture for repeated failures.
- Fail open: compile responses should still succeed if persistence is unavailable.

Operational metrics:

- queue depth
- write latency
- retry rate
- write error rate
- dropped write count

## Rollout

1. Persist compile/project artifacts.
2. Add read-through wrapper routes.
3. Add replay/backfill tasks.
4. Add retention and archival policies.
