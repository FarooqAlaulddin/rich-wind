# Rich Wind

Rich Wind is a runtime Tailwind CSS compiler. You send it HTML or a list of Tailwind classes, and it sends back the compiled CSS. There's no build step, no file watching, no CLI — just an HTTP API that compiles on demand.

It's designed for applications that generate or edit HTML dynamically: CMS platforms, visual editors, code playgrounds, email builders. Anywhere you don't know the final set of Tailwind classes until runtime.

First pre-release scope: Rich Wind publishes the core runtime service. The Lexical demo remains in the repo as the live reference app; the older playground/docs/plugin showcase app is parked on the `parked-demos` branch.

## Why It Helps

- Handles dynamic pages where class names are not known during CI/build.
- Centralizes CSS generation so every product does not need its own Tailwind build pipeline.
- Improves response time on repeated requests using per-page/per-project cache.
- Scales to multi-replica deployments with a shared `cacheStore`.

## When to Use It

- You are building a CMS, site/page editor, email/template builder, or preview environment.
- You generate HTML/classes at runtime and need correct CSS immediately.
- You want one core service for runtime CSS across multiple teams or apps.

## When Not to Use It

- Your app is mostly static and build-time Tailwind gives you simpler operations.
- You need zero runtime compilation cost and can precompile everything.
- You require request-time custom Tailwind config uploads (not a Rich Wind goal).

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
import { createCore } from "rich-wind";

const { app, close } = await createCore();
const server = app.listen(3001, () => {
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

`createCore()` is async and returns `{ app, close }` — a standard Express app and a shutdown function. You can mount it, add middleware, or pass configuration to control cache sizes, rate limits, and timeouts.

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
- **[OpenAPI Contract](openapi.json)** — machine-readable API schema for tooling and client generation
- **[Runtime Spec](runtime-spec.html)** — how caching works, the cacheStore adapter interface, bundle splitting internals, and rate limiting
- **[Plugin System](plugin-system.html)** — lifecycle hooks, setup context, plugin storage, and custom behavior
- **[Integration Cookbook](integration-cookbook.html)** — production patterns: multi-tenant wrappers, editor integration, CMS pipelines, and a reference cacheStore adapter
- **[FAQ](faq.html)** — common implementation and architecture questions
