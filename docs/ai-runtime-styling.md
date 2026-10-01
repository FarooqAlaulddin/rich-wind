# AI Runtime Styling

Rich Wind is runtime Tailwind infrastructure for dynamic and AI-generated UI.

When a model writes HTML after deploy, its class list is not in your build. Tailwind's static build only compiles classes it can find in source files, so those classes have no CSS. Rich Wind compiles them on demand and serves the CSS, cached and scoped per project and page. Use the normal Tailwind build for committed app code.

## The flow

1. The model emits HTML and an explicit class list.
2. `POST /api/compile` (or `core.compile()`) returns CSS plus `rejected`, the explicit classes Tailwind could not compile.
3. Feed `rejected` back to the model and recompile.
4. Serve `GET /api/css` (or `core.getCss()`).

See the [Agent Quickstart](agent-quickstart.html) for a working example.

## Other uses

CMS and site builders, rich text and email editors, tenant-authored pages, and preview sandboxes use the same API.

## Boundaries

V1 compiles against Tailwind's default design system. Rich Wind is not an AI UI generator, a component registry, a design-token system, a replacement for the static Tailwind build, or an authentication layer. Authentication, tenant isolation, and rate limiting belong to the host app or a proxy. Core only bounds its own input sizes, cache, and compile concurrency (see [What core enforces](api-reference.html#what-core-enforces-vs-what-the-host-enforces)).
