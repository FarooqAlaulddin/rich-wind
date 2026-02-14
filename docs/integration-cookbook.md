# Integration Cookbook

Practical integration patterns for production use of Rich Wind.

## 1. Minimal embedded core

Use Rich Wind as an in-process Express app.

```js
import { createCore } from "rich-wind";

const app = createCore({
  config: {
    cacheMaxPages: 500,
    cacheTtlMs: 10 * 60 * 1000,
    projectCacheTtlMs: 10 * 60 * 1000
  }
});

app.listen(3001);
```

Use this for local tooling or small internal systems.

## 2. Multi-tenant wrapper service

Rich Wind is auth-agnostic. In production, put it behind a wrapper that:

- authenticates caller
- maps tenant/project to safe internal `projectId`
- enforces per-tenant quotas
- logs request metadata

```js
import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json({ limit: "100kb" }));

function tenantFromRequest(req) {
  return req.header("x-tenant-id") || null;
}

function scopedProjectId(tenantId, projectSlug) {
  return crypto
    .createHash("sha256")
    .update(`${tenantId}:${projectSlug}`)
    .digest("hex")
    .slice(0, 32);
}

app.post("/css/compile", async (req, res) => {
  const tenantId = tenantFromRequest(req);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const projectSlug = String(req.body.projectSlug || "");
  if (!projectSlug) return res.status(400).json({ error: "projectSlug required" });

  const payload = {
    projectId: scopedProjectId(tenantId, projectSlug),
    pageId: String(req.body.pageId || "default"),
    html: req.body.html,
    classes: req.body.classes,
    bundle: req.body.bundle || "full"
  };

  const r = await fetch(`${process.env.RW_CORE_URL}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await r.text();
  res.status(r.status).type(r.headers.get("content-type") || "application/json").send(body);
});
```

## 3. Editor/autocomplete pattern

For live editors:

- debounce suggest calls (for example 100-200ms)
- send `prefix`, `projectId`, and current class buffer
- compile on explicit action or debounced idle
- avoid compile on every keystroke for miss-heavy traffic

Recommended flow:

1. `POST /api/suggest` while typing
2. `POST /api/compile` on run/save
3. use returned `hash`, `classes`, and `cached` for UI state

## 4. Publish pipeline pattern

For CMS/static publishing:

- compile during save/publish jobs
- persist returned CSS artifacts to object storage/CDN
- serve persisted CSS in runtime path
- keep Rich Wind for preview/authoring paths

Useful endpoints:

- `POST /api/compile` for per-page artifacts
- `GET /api/projects/:projectId/css` for project aggregate artifacts

## 5. Bundle strategy pattern

Common bundle choices:

- `full` for simplest integration
- `base` shared globally + `theme` + `utilities` for layered delivery
- `utilities` only for strict composition where preflight/theme are loaded elsewhere

Rule: if split, ensure `theme` loads before `utilities`.

## 6. Horizontal scaling pattern

Rich Wind cache is in-memory per process. Under many replicas:

- cache is not shared
- miss ratio usually increases

Mitigations:

- sticky routing for editing sessions
- precompute and persist artifacts
- keep hot projects in fewer dedicated workers
- consider external persistence layer in wrapper architecture

## 7. Serverless and cold starts

The implementation is Node-native (Express + Tailwind node/oxide), so treat serverless carefully:

- expect cold-start penalty on first compile/suggest
- prewarm on deploy if platform supports it
- avoid using it as a high-frequency cold endpoint

## 8. Security hardening checklist

- [ ] auth gateway in front of Rich Wind
- [ ] tenant scoped projectId mapping
- [ ] strict body/html/classes/class-count validation in wrapper
- [ ] per-tenant and per-IP quotas
- [ ] 429 and 5xx alerting
- [ ] memory pressure alarms and worker recycling policy

## 9. Observability checklist

- [ ] compile latency histogram (`bundle`, `cached`)
- [ ] cache hit ratio (page/project)
- [ ] suggest latency and result count
- [ ] rate-limit counter + retry-after stats
- [ ] process RSS/heap/CPU/event-loop lag

Log fields to include:

- request id
- tenant id
- internal project/page ids
- bundle
- class count
- cached boolean
- response status

## 10. Failure handling guide

Common responses and action:

- `400`: bad request; fix payload/IDs/classes
- `404`: cache miss; compile first or handle empty state
- `413`: request too large; enforce upstream limits
- `429`: backoff and retry after header
- `500`: retry with jitter and trigger incident alerts if sustained


## 11. File system cacheStore adapter

If you want persistence without introducing a database, use a host-owned filesystem adapter.
This keeps core auth-agnostic and lets your host app own data layout and retention policy.

```js
import fs from "node:fs/promises";
import path from "node:path";
import { createCore } from "rich-wind";

const CACHE_ROOT = path.resolve(".rw-cache");

const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
const pagePath = ({ projectId, pageId, bundle }) =>
  path.join(CACHE_ROOT, "pages", safe(projectId), `${safe(pageId)}.${safe(bundle)}.json`);
const projectPath = ({ projectId, bundle }) =>
  path.join(CACHE_ROOT, "projects", safe(projectId), `${safe(bundle)}.json`);

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(payload), "utf8");
}

const cacheStore = {
  async readPageArtifact(input) {
    return readJson(pagePath(input));
  },
  async upsertPageArtifact(input) {
    await writeJson(pagePath(input), input);
  },
  async readProjectArtifact(input) {
    return readJson(projectPath(input));
  },
  async upsertProjectArtifact(input) {
    await writeJson(projectPath(input), input);
  }
};

const app = createCore({
  cacheStore,
  cacheStoreTimeoutMs: 150,
  config: {
    cacheTtlMs: 10 * 60 * 1000,
    projectCacheTtlMs: 10 * 60 * 1000
  }
});

app.listen(3001);
```

Operational notes:

- keep cache files on local disk only for single-node or sticky-node setups
- for multi-replica deployments, use shared storage or a network store adapter
- prune expired files out-of-band (cron/job) to cap disk growth

## 12. Related docs

- [API Reference](/docs/api-reference)
- [Runtime Spec](/docs/runtime-spec)
- [Plugin System](/docs/plugin-system)
- [CSS Strategies](/docs/css-strategies)
