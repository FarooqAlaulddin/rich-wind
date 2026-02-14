# Integration Cookbook

Real patterns for putting Rich Wind into production. Each section is a self-contained recipe — pick the ones that apply to your setup.

## Embedded Service

The simplest deployment. Rich Wind runs as an in-process Express app with default settings.

```js
import { createCore } from "rich-wind";

const { app } = await createCore({
  config: {
    cacheMaxPages: 500,
    cacheTtlMs: 10 * 60 * 1000,
  }
});

app.listen(3001);
```

This works well for local tooling, internal services, or single-node deployments where you don't need persistence or multi-tenant isolation.

## Multi-Tenant Wrapper

Rich Wind doesn't do authentication — it compiles whatever you send it. In a multi-tenant system, you need a wrapper that authenticates the caller and maps their identity to a scoped `projectId` so tenants can't see each other's cache.

```js
import express from "express";
import crypto from "node:crypto";

const gateway = express();
gateway.use(express.json({ limit: "100kb" }));

// Hash tenant + project into a safe, collision-free internal ID
function scopedId(tenantId, slug) {
  return crypto.createHash("sha256")
    .update(`${tenantId}:${slug}`)
    .digest("hex")
    .slice(0, 32);
}

gateway.post("/css/compile", async (req, res) => {
  const tenantId = req.header("x-tenant-id");
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const resp = await fetch(`${process.env.RW_CORE_URL}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: scopedId(tenantId, req.body.projectSlug),
      pageId: req.body.pageId || "default",
      html: req.body.html,
      classes: req.body.classes,
      bundle: req.body.bundle
    })
  });

  res.status(resp.status)
    .type(resp.headers.get("content-type"))
    .send(await resp.text());
});
```

The key idea: your users never see or control the `projectId`. You generate it from their authenticated identity, so there's no way for tenant A to read tenant B's cache.

## Editor Integration

If you're building a live editor with Tailwind autocomplete, the flow looks like this:

**While the user types** — call `POST /api/suggest` with the current prefix and the project ID. Debounce to 100–200ms so you're not hammering the API on every keystroke. Suggestions are fast since they read from an in-memory index.

**When the user runs or saves** — call `POST /api/compile` with the full HTML or class list. This is the expensive operation. Compile on explicit actions, not on every keystroke.

**For the preview pane** — call `GET /api/css` with the project and page ID to fetch the most recently compiled stylesheet. If you've already compiled, this is just a cache read.

The response from `/api/compile` includes a `hash` and `cached` flag. Use `hash` to detect whether the preview actually needs updating — if the hash hasn't changed, the CSS is identical and you can skip a preview refresh.

## CMS / Publish Pipeline

For content management systems and static site generators where you compile at publish time:

1. **On save/publish** — `POST /api/compile` for each page being published. Store the returned CSS alongside your page content in your CMS or object storage.
2. **At runtime** — serve the pre-built CSS directly from your CDN. Rich Wind is not in the hot path.
3. **For project-wide CSS** — `GET /api/projects/:id/css` generates a single stylesheet covering all compiled pages. Useful for a global `<link>` tag.

This keeps Rich Wind as a build-time tool for authoring and preview. Your production site serves static CSS with no dependency on Rich Wind being available.

## Horizontal Scaling

Rich Wind's cache is per-process. If you run three replicas behind a load balancer, each replica builds its own cache independently. This means:

- The same page might be compiled multiple times (once per replica that gets a request for it)
- Cache hit rates drop as you add replicas
- Project-level CSS might differ briefly between replicas if they've seen different pages

**Mitigations:**

- **Sticky sessions** — route requests from the same editing session to the same replica. This keeps the cache warm for active users.
- **cacheStore adapter** — add a shared persistence layer (Redis, database, filesystem) so replicas share cached artifacts. See the [cacheStore section in Runtime Spec](/docs/runtime-spec#cachestore) for the adapter interface.
- **Pre-compile on deploy** — compile your known pages on startup so the cache is warm from the start.

## cacheStore Adapters

The `cacheStore` option accepts any object that implements four async methods. What backs those methods is up to you — a database, Redis, S3, the local filesystem, or anything else that can store and retrieve JSON.

For the full interface — what each method receives, what it should return, failure behavior, and validation rules — see the [cacheStore section in Runtime Spec](/docs/runtime-spec#cachestore).

The pattern is the same regardless of backend: map `projectId + pageId + bundle` to a storage key, serialize the artifact as JSON, and return `null` on miss. Here are two examples:

### Redis

```js
const cacheStore = {
  async readPageArtifact({ projectId, pageId, bundle }) {
    const raw = await redis.get(`rw:${projectId}:${pageId}:${bundle}`);
    return raw ? JSON.parse(raw) : null;
  },
  async upsertPageArtifact(input) {
    const key = `rw:${input.projectId}:${input.pageId}:${input.bundle}`;
    const ttl = Math.max(1, Math.ceil((input.expiresAt - Date.now()) / 1000));
    await redis.set(key, JSON.stringify(input), "EX", ttl);
  },
  async readProjectArtifact({ projectId, bundle }) {
    const raw = await redis.get(`rw:${projectId}:_project:${bundle}`);
    return raw ? JSON.parse(raw) : null;
  },
  async upsertProjectArtifact(input) {
    const key = `rw:${input.projectId}:_project:${input.bundle}`;
    const ttl = Math.max(1, Math.ceil((input.expiresAt - Date.now()) / 1000));
    await redis.set(key, JSON.stringify(input), "EX", ttl);
  }
};
```

### Filesystem

```js
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(".rw-cache");
const safe = (v) => String(v).replace(/[^a-zA-Z0-9._-]/g, "_");
const readJson = async (f) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return null; } };
const writeJson = async (f, d) => { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, JSON.stringify(d), "utf8"); };

const cacheStore = {
  readPageArtifact: (i) => readJson(path.join(DIR, safe(i.projectId), `${safe(i.pageId)}.${safe(i.bundle)}.json`)),
  upsertPageArtifact: (i) => writeJson(path.join(DIR, safe(i.projectId), `${safe(i.pageId)}.${safe(i.bundle)}.json`), i),
  readProjectArtifact: (i) => readJson(path.join(DIR, safe(i.projectId), `_project.${safe(i.bundle)}.json`)),
  upsertProjectArtifact: (i) => writeJson(path.join(DIR, safe(i.projectId), `_project.${safe(i.bundle)}.json`), i),
};
```

### Wiring it up

```js
const { app } = await createCore({ cacheStore, cacheStoreTimeoutMs: 150 });
app.listen(3001);
```

### Error visibility

The store is [fail-open](/docs/runtime-spec#failure-behavior) — if your backend is slow or down, Rich Wind continues working with in-memory cache only. To monitor store health, use the [`onError` plugin hook](/docs/plugin-system#error-handling) with `stage: "cache-store"`:

```js
const { app } = await createCore({
  cacheStore,
  cacheStoreTimeoutMs: 150,
  plugins: [{
    name: "store-monitor",
    onError({ error, stage, op, timedOut, context }) {
      if (stage === "cache-store") {
        console.warn(
          `cacheStore ${op} failed (timeout: ${timedOut})`,
          `project: ${context.projectId}`,
          error.message
        );
      }
    }
  }]
});
```
