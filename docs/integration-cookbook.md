# Integration Cookbook

How-to recipes for putting Rich Wind into an app. Core has no authentication and no rate limiter, so in every pattern the host's middleware runs first; a request the host rejects never reaches a plugin hook or the compiler. The access rules are in [Security Boundary](runtime-spec.html#security-boundary).

## Embedding

### Express (mounted handler)

`core.handler` resolves paths from `req.url`, which Express rewrites under a mount path, so it works under any prefix. A body already parsed by `express.json()` is used as is (see [createCore](api-reference.html#createcore)).

```js
import express from "express";
import expressRateLimit from "express-rate-limit";
import { createCore } from "rich-wind";

const core = await createCore();
const limiter = expressRateLimit({ windowMs: 60_000, limit: 120 });
const auth = (req, res, next) =>
  req.header("authorization") ? next() : res.status(401).json({ error: "Unauthorized" });

const app = express();
app.use("/rw", limiter, auth, core.handler);
```

`POST /rw/api/compile` reaches `/api/compile`.

### node:http

Strip the prefix from `req.url` before calling the handler, keeping any query string:

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore();

http.createServer((req, res) => {
  if (req.url === "/rw" || req.url.startsWith("/rw/") || req.url.startsWith("/rw?")) {
    req.url = req.url.slice(3) || "/";
    if (req.url[0] === "?") req.url = "/" + req.url;
    return core.handler(req, res);
  }
  res.statusCode = 404;
  res.end();
}).listen(3000);
```

To serve core at the root, pass `core.handler` straight to `http.createServer`.

### Next.js App Router

`core.fetch` takes a Web `Request` and returns a `Response`. It needs the Node.js runtime because `@tailwindcss/oxide` is a native addon.

```js
// app/rw/[...path]/route.js
import { createCore } from "rich-wind";

const core = await createCore();
const handle = (req) => core.fetch(req, { basePath: "/rw" });

export const runtime = "nodejs";
export const GET = handle;
export const POST = handle;
export const HEAD = handle;
```

`basePath` and `ip` are described under [core.fetch](api-reference.html#createcore). Export `OPTIONS = handle` only if you configured CORS (`RW_CORS_ORIGIN`).

### Hono

```js
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createCore } from "rich-wind";

const core = await createCore();
const app = new Hono();

app.all("/rw/*", (c) =>
  core.fetch(c.req.raw, {
    basePath: "/rw",
    ip: c.req.header("x-forwarded-for")?.split(",").pop()?.trim(),
  })
);

serve({ fetch: app.fetch, port: 3000 });
```

The sample passes the last `X-Forwarded-For` entry, which is the address your nearest proxy appended. That is the final client address only if one trusted proxy sits in front of you, so leave `trustProxy` unset. If you instead pass the proxy's own address as `ip`, set `trustProxy` so core resolves the client from it. If no proxy you control sets the header, omit `ip`.

### Fastify (library calls)

Call the core functions directly and map `RichWindError` to a reply. Direct calls bypass plugin guards.

```js
import Fastify from "fastify";
import { createCore, RichWindError } from "rich-wind";

const core = await createCore();
const app = Fastify();

app.post("/css/compile", async (request, reply) => {
  try {
    return await core.compile(request.body);
  } catch (err) {
    if (err instanceof RichWindError) {
      return reply.code(err.status).send({ error: err.message, code: err.code });
    }
    throw err;
  }
});
```

### Standalone behind a proxy

Run `npm start` (listens on `PORT`, default `3001`) and let the proxy own authentication, TLS and rate limiting. Set `RW_TRUST_PROXY` to the number of proxy hops so plugin hooks see the real client address.

## Multi-Tenant Wrapper

Derive `projectId` server-side from the authenticated identity, so callers never choose it. The gateway below calls the core in-process; `RichWindError` carries the status and code for validation failures.

```js
import express from "express";
import crypto from "node:crypto";
import { createCore, RichWindError } from "rich-wind";

const core = await createCore();

const gateway = express();
gateway.use(express.json({ limit: "100kb" }));

// JSON.stringify of a pair is unambiguous: ("a:b","c") and ("a","b:c") differ.
function scopedId(tenantId, slug) {
  return crypto.createHash("sha256")
    .update(JSON.stringify([tenantId, slug]))
    .digest("hex")
    .slice(0, 32);
}

gateway.post("/css/compile", async (req, res) => {
  const tenantId = req.header("x-tenant-id"); // replace with real authentication
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await core.compile({
      projectId: scopedId(tenantId, req.body.projectSlug),
      pageId: req.body.pageId || "default",
      html: req.body.html,
      classes: req.body.classes,
      bundle: req.body.bundle
    });
    res.json(result);
  } catch (err) {
    if (err instanceof RichWindError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});
```

To expose Rich Wind's own routes to authenticated callers, mount `core.handler` behind your auth middleware instead. You must then still map `projectId` yourself, because core accepts whatever the caller sends.

## Editor Integration

- Suggest while typing: `POST /api/suggest`, debounced.
- Compile on an explicit action (run or save), not per keystroke.
- Compare the compile response's `hash` with the last one; if equal, skip the preview refresh.

For AI-generated HTML and agent preview loops, see [Agent Quickstart](agent-quickstart.html).

## CMS Publish

Persist content and its ids, compile at publish, and serve the `css` from the compile response (or from your own storage) so Rich Wind is not on the read path.

## Redis cacheStore

Separate prefixes for pages, projects and plugin data keep the key spaces from colliding (ids contain no `:`).

```js
import Redis from "ioredis";
import { createCore } from "rich-wind";

const redis = new Redis();
const ttlSeconds = (expiresAt) => Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
const pageKey = (p, g, b) => `rw:page:${p}:${g}:${b}`;
const projectKey = (p, b) => `rw:project:${p}:${b}`;
const pluginKey = (n, k) => `rw:plugin:${n}:${k}`;
const getJson = async (key) => {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : null;
};
const scanDel = async (pattern) => {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) await redis.del(keys);
  } while (cursor !== "0");
};

const cacheStore = {
  readPageArtifact: ({ projectId, pageId, bundle }) => getJson(pageKey(projectId, pageId, bundle)),
  upsertPageArtifact: (i) =>
    redis.set(pageKey(i.projectId, i.pageId, i.bundle), JSON.stringify(i), "EX", ttlSeconds(i.expiresAt)),
  deletePageArtifact: ({ projectId, pageId, bundle }) => redis.del(pageKey(projectId, pageId, bundle)),
  deleteProjectPageArtifacts: ({ projectId }) => scanDel(`rw:page:${projectId}:*`),

  readProjectArtifact: ({ projectId, bundle }) => getJson(projectKey(projectId, bundle)),
  upsertProjectArtifact: (i) =>
    redis.set(projectKey(i.projectId, i.bundle), JSON.stringify(i), "EX", ttlSeconds(i.expiresAt)),
  deleteProjectArtifact: ({ projectId, bundle }) => redis.del(projectKey(projectId, bundle)),

  readPluginData: ({ pluginName, key }) => getJson(pluginKey(pluginName, key)),
  writePluginData: ({ pluginName, key, value }) => redis.set(pluginKey(pluginName, key), JSON.stringify(value)),
  deletePluginData: ({ pluginName, key }) => redis.del(pluginKey(pluginName, key)),
  async listPluginData({ pluginName, prefix = "" }) {
    const head = pluginKey(pluginName, "");
    const out = [];
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${head}${prefix}*`, "COUNT", 200);
      cursor = next;
      for (const k of keys) out.push(k.slice(head.length));
    } while (cursor !== "0");
    return out;
  }
};

const core = await createCore({ cacheStore });
```

The interface and rules are in [cacheStore](runtime-spec.html#cachestore). Implement the three delete methods if plugins call `ctx.purgePage` or `ctx.purgeProject`.

## Filesystem cacheStore

The repo ships one. Options and defaults are documented at the top of `plugins/cache-store-fs/index.js`.

```js
import { createCore } from "rich-wind";
import { createFsCacheStore } from "rich-wind/plugins/cache-store-fs";

const core = await createCore({
  cacheStore: createFsCacheStore({ dir: "./rw-cache", maxPageArtifacts: 5000, maxAgeDays: 30 })
});
```

## Error visibility

The store is fail-open. To see failures, handle `onError` with `stage: "cache-store"`:

```js
import { createCore } from "rich-wind";

const core = await createCore({
  cacheStore, // from the sections above
  plugins: [{
    name: "store-monitor",
    onError({ error, stage, op, timedOut }) {
      if (stage === "cache-store") console.warn(`cacheStore ${op} failed (timedOut: ${timedOut})`, error.message);
    }
  }]
});
```
