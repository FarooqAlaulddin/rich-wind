# Rich Wind

Runtime Tailwind CSS compiler. Send HTML or class names, get compiled CSS back. No build step, no CLI — just an HTTP API that compiles on demand.

## Why It Helps

- Supports dynamic content where classes are only known at runtime.
- Removes the need to run a Tailwind build pipeline in each host app.
- Gives you cache control per `projectId` and `pageId` for fast repeat requests.
- Works in single-node or multi-replica deployments with a shared `cacheStore`.

## When to Use It

- You run a CMS, visual builder, template/email editor, or preview system.
- You need CSS generation for user-created or tenant-created pages.
- You want a central CSS runtime service used by multiple products.

## When Not to Use It

- Your UI is static and build-time Tailwind already fits your workflow.
- You do not want runtime compute/network overhead for CSS generation.
- You need direct support for arbitrary user-uploaded Tailwind configs at request time.

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

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/compile` | Compile CSS from HTML and/or class strings |
| `GET /api/css` | Fetch cached CSS for a page |
| `GET /api/projects/:projectId/css` | Fetch aggregated CSS across all pages in a project |
| `POST /api/suggest` | Class name autocomplete |
| `GET /richwind-loader.js` | Browser loader for plain HTML exports |
| `GET /health` | Health check |

CSS is cached per `projectId` + `pageId` with sliding TTL and LRU eviction.

## Browser Loader

For plain HTML, static previews, CMS renderers, or an HTML viewer with no build step, include the hosted loader with a normal `<script src>` tag:

```html
<script
  defer
  src="https://rich-wind.thinkly.dev/core/richwind-loader.js"
  data-project-id="my-app"
  data-page-id="home"
></script>
```

The loader links the shared `base`, project `theme`, and auto-promoted stylesheets, then compiles the utility classes found in `document.body` and injects them into the page. For cross-origin pages, run the core with `RW_CORS_ORIGIN=*` or an explicit origin allowlist so browser `fetch()` can call `POST /api/compile`.

## Features

- **Bundle splitting** — request `full`, `base` (preflight), `theme` (design tokens), or `utilities` separately
- **Plugin system** — 14 hooks for observing, transforming, and resolving CSS at every stage of the pipeline
- **Pluggable persistence** — optional `cacheStore` adapter for shared cache across replicas
- **Replica roles** — `writer` / `reader` / `hybrid` for horizontal scaling
- **Rate limiting and CORS** — built-in, configurable per environment
- **TypeScript definitions** — full type coverage for the public API and plugin interfaces

## Configuration

All options can be set via `createCore({ config: { ... } })` or environment variables. See the [API Reference](docs/api-reference.md#configuration) for the full table.

Key environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `RW_CACHE_MAX_PAGES` | `200` | Max cached pages |
| `RW_CACHE_TTL_MS` | `600000` | Page cache TTL (ms) |
| `RW_NODE_ROLE` | `hybrid` | Replica role |
| `RW_CORS_ORIGIN` | unset | CORS allowlist |
| `RW_TRUST_PROXY` | `false` | Trust `X-Forwarded-For` |

## Docs

Docs are plain Markdown in `docs/` so they can be published from GitHub Pages with the Pages source set to `main` / `/docs`. Once enabled, the project docs will publish at `https://farooqalaulddin.github.io/rich-wind/`.

- **[Overview](docs/index.md)** — mental model, use cases, and quick start
- **[API Reference](docs/api-reference.md)** — every endpoint, parameter, and config option
- **[Runtime Spec](docs/runtime-spec.md)** — caching, `cacheStore` adapter interface, bundle splitting, replica roles
- **[Plugin System](docs/plugin-system.md)** — hooks, setup context, storage, custom routes, and examples
- **[Integration Cookbook](docs/integration-cookbook.md)** — multi-tenant wrappers, editor integration, CMS pipelines, cacheStore adapters
- **[FAQ](docs/faq.md)** — common questions

## Development

```bash
npm install
npm run dev          # core API only (watch mode) at localhost:3001
npm run dev:lexical  # core API + demo plugins for the Lexical demo
```

Run the Lexical reference app in another terminal:

```bash
npm run dev:lexical-ui   # lexical demo at localhost:5174
```

```bash
npm test                  # test suite
npm run test:pack         # smoke test the npm package
npm run build:lexical-demo
```

## License

MIT. See `LICENSE`.
