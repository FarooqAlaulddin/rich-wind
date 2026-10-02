# Rich Wind

Runtime Tailwind CSS compiler library: compile class names or HTML to CSS at runtime, no build step. It is for markup that did not exist when your app was built. The main use is AI-driven UI, where a model writes the HTML after deploy ([AI Runtime Styling](ai-runtime-styling.html)). CMS pages, editors and previews use it the same way.

V1 compiles against Tailwind's default design system. Core compiles explicit classes or HTML and serves CSS. Authentication, tenant isolation, rate limiting, and HTML-parsing workflows belong to the host app or a wrapper.

## Include it in an app

```bash
npm install rich-wind
```

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore();
http.createServer(core.handler).listen(3001);
```

`createCore()` returns `{ handler, fetch, compile, getCss, getProjectCss, invalidate, suggest, close }`. Mount `handler` (Node-style hosts such as Express) or `fetch` (Next.js, Hono), call the functions directly, or run the bundled server behind a proxy. See [Including Rich Wind in an App](runtime-spec.html#including-rich-wind-in-an-app).

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"projectId":"my-app","pageId":"hero","html":"<div class=\"text-red-500 p-4\">Hello</div>"}'
```

The response has the compiled CSS, the classes compiled, `rejected` explicit classes, and a content hash.

## Mental Model

Rich Wind organizes CSS around **projects** and **pages**.

A **project** is a namespace — your app, your tenant, your site. A **page** is a unit within that project — a landing page, an email template, a component preview. You pick the IDs; Rich Wind just uses them to scope its cache.

When you compile a page, Rich Wind extracts every valid Tailwind class from your input, compiles them into CSS, and caches the result. If you compile the same page again with the same classes, it returns the cached output instantly. If the classes change, it recompiles.

You can also ask for a **project-level stylesheet** — the union of every class across all cached pages in that project, compiled into one CSS file.

## Quick Start

```bash
npm install rich-wind
```

Create an HTTP service in your app:

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore();
const server = http.createServer(core.handler);
server.listen(3001, () => {
  console.log("Rich Wind running on http://localhost:3001");
});
```

Compile a page:

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-app",
    "pageId": "hero",
    "html": "<div class=\"text-red-500 p-4\">Hello</div>"
  }'
```

The response includes the compiled CSS, the list of classes found, and a content hash you can use for cache invalidation on your end.

`createCore()` is async and returns `{ handler, fetch, compile, getCss, getProjectCss, invalidate, suggest, close }`. `handler` is a plain Node request listener: pass it to `http.createServer()` or mount it in Express with `app.use("/rw", core.handler)`. `fetch` takes a Web `Request` and returns a `Response`, for Next.js App Router, Hono, and other Fetch-style hosts. The remaining functions call the core directly without HTTP. Express is not a dependency of Rich Wind.

## Bundles

By default, Rich Wind compiles everything into one stylesheet (`full` bundle). But you can split the output into layers:

| Bundle | What it contains | When to use it |
| --- | --- | --- |
| `full` | Preflight reset + theme variables + utility rules | Simplest option — one `<link>` tag covers everything |
| `base` | Just the preflight reset (Tailwind's CSS normalize) | Load once globally, shared across all pages |
| `theme` | CSS custom properties (colors, spacing, fonts, etc.) | Load once globally — these are the design tokens |
| `utilities` | The actual utility class rules (`bg-red-500`, `p-4`, etc.) | Load per-page — this is the part that changes |

Splitting makes sense when many pages share the same design tokens but have different utility classes. You load `base` and `theme` once, then swap `utilities` per page. If you split, always load `theme` before `utilities` — the utility rules reference the CSS custom properties that `theme` defines.

## Docs

- **[Agent Quickstart](agent-quickstart.html)** - the compile, `rejected`, recompile loop for models
- **[AI Runtime Styling](ai-runtime-styling.html)** - why runtime styling for AI-generated UI
- **[API Reference](api-reference.html)** - endpoints, functions, errors, config
- **[OpenAPI Contract](openapi.json)** - machine-readable API schema
- **[Runtime Spec](runtime-spec.html)** - caching, `cacheStore`, embedding, threat model
- **[Plugin System](plugin-system.html)** - hooks, setup context, custom routes
- **[Integration Cookbook](integration-cookbook.html)** - multi-tenant wrappers, editors, CMS pipelines
- **[Compatibility Policy (1.x)](api-reference.html#compatibility-policy-1x)** - what stays stable within 1.x
- **[FAQ](faq.html)**
