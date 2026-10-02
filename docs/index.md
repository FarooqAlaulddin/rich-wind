# Rich Wind

Runtime Tailwind CSS compiler library: compile class names or HTML to CSS at runtime, no build step.

Tailwind's static build only compiles classes it finds in source files. Markup produced after deploy (AI-generated UI, CMS pages, editors, previews) did not exist at build time, so its classes have no CSS. Rich Wind compiles them on demand and serves the CSS, cached and scoped per project and page.

V1 compiles against Tailwind's default design system. Core compiles explicit classes or the class attributes of HTML and serves CSS. Authentication, tenant mapping, rate limiting, and TLS belong to the host app or a proxy.

## Quick start

```bash
npm install rich-wind
```

```js
import { createCore } from "rich-wind";

const core = await createCore();
const { css, classes, rejected, hash } = await core.compile({
  projectId: "my-app",
  pageId: "hero",
  html: '<div class="text-red-500 p-4">Hello</div>',
});
```

To serve it over HTTP, mount `core.handler` or `core.fetch`; see [Embedding](integration-cookbook.html#embedding) for Express, `node:http`, Next.js, Hono, and Fastify.

## How it works

- You choose a `projectId` (an app, tenant, or site) and a `pageId` (a page, template, or preview) to scope the cache.
- Each compile is for one page. The result is cached in memory with a sliding TTL and an LRU cap.
- The same class set produces the same `hash`.
- The project CSS is the union of the project's cached pages.
- `GET` CSS endpoints never compile new classes: after expiry they return 404, and only a new compile rebuilds. Details in [Caching](runtime-spec.html#caching).

## Bundles

| Bundle | Contains |
| --- | --- |
| `full` | Preflight, theme variables, and utilities (the default) |
| `base` | Tailwind preflight only; the same for every page |
| `theme` | Only the CSS variables the page's classes use |
| `utilities` | The utility class rules |

To share CSS across pages, load `base` once, the project theme (`GET /api/projects/:projectId/css?bundle=theme`, the union across the project's cached pages), and each page's `utilities`. The bundled loader script does this for you; see the [API Reference](api-reference.html).

## When not to use it

Code committed to a repo should use the normal Tailwind build. Rich Wind is for markup that appears after deploy.

Persist your source content and ids (`projectId`, `pageId`, the HTML), not generated CSS: compile recreates it.

Next: [Agent Quickstart](agent-quickstart.html) and [API Reference](api-reference.html).
