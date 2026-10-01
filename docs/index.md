# Rich Wind

Rich Wind is runtime Tailwind CSS infrastructure for dynamic and AI-generated UI. You send it HTML or a list of Tailwind classes, and it sends back the compiled CSS. There's no per-page build step, no file watching, no CLI in every host app - just an HTTP API that compiles on demand.

It's designed for applications that generate or edit HTML dynamically: CMS platforms, visual editors, code playgrounds, email builders, rich text editors, tenant-authored pages, and agent-generated previews. Anywhere you don't know the final set of Tailwind classes until runtime.

Rich Wind core is intentionally auth-agnostic. Host applications own authentication, tenant isolation, source content, publishing, and long-term artifact storage.

## Why It Helps

- Handles dynamic pages where class names are not known during CI/build.
- Lets editors and AI agents preview Tailwind-styled HTML without rebuilding the host app.
- Centralizes CSS generation so every product does not need its own Tailwind build pipeline for dynamic surfaces.
- Improves response time on repeated requests using per-page/per-project cache.
- Scales to multi-replica deployments with a shared `cacheStore`.

## When to Use It

- You are building a CMS, site/page editor, email/template builder, or preview environment.
- You generate HTML/classes at runtime and need correct CSS immediately.
- You let AI agents create or revise HTML/classes after deployment.
- You want one core service for runtime CSS across multiple teams or apps.

## When Not to Use It

- Your app is mostly static and build-time Tailwind gives you simpler operations.
- Your AI-generated UI lands in source control and can use the normal Tailwind build.
- You need zero runtime compilation cost and can precompile everything.
- You require request-time custom Tailwind config uploads (not a Rich Wind goal).

## AI-Era Positioning

AI tools make it faster to create UI, but they do not remove the need to compile, cache, scope, and govern the resulting CSS. Tailwind's standard production path is still static CSS generated from classes that exist in source files. Rich Wind is useful when the class list is produced later by an editor, tenant, plugin, CMS workflow, or coding agent.

The short version:

- Use normal Tailwind for committed application code.
- Use Rich Wind for runtime-authored pages and previews.
- Use plugins and wrapper services for tenant isolation, policy, analytics, and publishing.

See [AI Runtime Styling](ai-runtime-styling.html) for the research notes, tested hypotheses, and product implications behind this positioning.

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

## What's in the Docs

- **[API Reference](api-reference.html)** — every endpoint, every parameter, every config option
- **[AI Runtime Styling](ai-runtime-styling.html)** — 2026 positioning for dynamic and AI-generated UI
- **[OpenAPI Contract](openapi.json)** — machine-readable API schema for tooling and client generation
- **[Runtime Spec](runtime-spec.html)** — how caching works, the cacheStore adapter interface, bundle splitting internals, and including Rich Wind in an app
- **[Plugin System](plugin-system.html)** — lifecycle hooks, setup context, plugin storage, and custom behavior
- **[Integration Cookbook](integration-cookbook.html)** — production patterns: multi-tenant wrappers, editor integration, CMS pipelines, and a reference cacheStore adapter
- **[Compatibility Policy (1.x)](api-reference.html#compatibility-policy-1x)** — what stays stable within 1.x
- **[FAQ](faq.html)** — common implementation and architecture questions
