# Rich Wind

Runtime Tailwind CSS compiler library: compile class names or HTML to CSS at runtime, no build step. It is for markup that did not exist when your app was built. The main use is AI-driven UI, where a model writes the HTML after deploy ([AI Runtime Styling](https://farooqalaulddin.github.io/rich-wind/ai-runtime-styling.html)). CMS pages, editors and previews use it the same way.

V1 compiles against Tailwind's default design system. Core compiles explicit classes or HTML and serves CSS. Authentication, rate limiting, and HTML-parsing workflows belong to the host app or a wrapper.

Requires Node 22 or later. It cannot run on edge runtimes.

## Include it in an app

```bash
npm install rich-wind
```

```js
import http from "node:http";
import { createCore } from "rich-wind";

const core = await createCore();

// 1. Mount: core.handler (Node-style hosts) or core.fetch (Fetch-style hosts)
http.createServer(core.handler).listen(3001);

// 2. Or call functions directly
const result = await core.compile({
  projectId: "my-app",
  pageId: "hero",
  html: '<div class="text-red-500 p-4">Hello</div>',
});
```

You can also run the bundled server (`npm start`) as a separate service behind a proxy. See [Including Rich Wind in an App](https://farooqalaulddin.github.io/rich-wind/runtime-spec.html#including-rich-wind-in-an-app) for each pattern.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/compile` | Compile CSS from HTML and/or class strings |
| `GET /api/css` | Fetch cached CSS for a page |
| `GET /api/projects/:projectId/css` | Fetch aggregated CSS across all pages in a project |
| `POST /api/suggest` | Class name autocomplete |
| `POST /api/invalidate` | Purge a page or project from the cache |
| `GET /health` | Health check |

The same operations are available as `core.compile`, `core.getCss`, `core.getProjectCss`, `core.suggest` and `core.invalidate`. Plugins, a pluggable `cacheStore`, and replica roles are covered in the docs below.

## Configuration

All options can be set via `createCore({ config: { ... } })` or environment variables. See the [API Reference](https://farooqalaulddin.github.io/rich-wind/api-reference.html#configuration) for the full table.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `RW_CACHE_MAX_PAGES` | `200` | Max cached pages |
| `RW_CACHE_TTL_MS` | `600000` | Page cache TTL (ms) |
| `RW_MAX_CONCURRENT_COMPILES` | `8` | Max simultaneous compiles; extra compiles get `503 SERVER_BUSY` |
| `RW_NODE_ROLE` | `hybrid` | Replica role |
| `RW_CORS_ORIGIN` | unset | CORS allowlist |
| `RW_TRUST_PROXY` | unset | Trusted proxy hops or addresses for client IP detection (`1` is a hop count) |

## Docs

- **[Overview](https://farooqalaulddin.github.io/rich-wind/)**
- **[Agent Quickstart](https://farooqalaulddin.github.io/rich-wind/agent-quickstart.html)** - the compile, `rejected`, recompile loop for models
- **[AI Runtime Styling](https://farooqalaulddin.github.io/rich-wind/ai-runtime-styling.html)** - why runtime styling for AI-generated UI
- **[API Reference](https://farooqalaulddin.github.io/rich-wind/api-reference.html)** - endpoints, functions, errors, config
- **[Runtime Spec](https://farooqalaulddin.github.io/rich-wind/runtime-spec.html)** - caching, `cacheStore`, replica roles, embedding, threat model
- **[Plugin System](https://farooqalaulddin.github.io/rich-wind/plugin-system.html)** - hooks, setup context, custom routes
- **[Integration Cookbook](https://farooqalaulddin.github.io/rich-wind/integration-cookbook.html)** - multi-tenant wrappers, editors, CMS pipelines
- **[Compatibility Policy (1.x)](https://farooqalaulddin.github.io/rich-wind/api-reference.html#compatibility-policy-1x)** - what stays stable within 1.x
- **[FAQ](https://farooqalaulddin.github.io/rich-wind/faq.html)**

## Development

```bash
npm install
npm run dev          # core API only (watch mode) at localhost:3001
npm run dev:lexical  # core API + demo plugins for the Lexical demo
npm run dev:lexical-ui   # lexical demo at localhost:5174 (separate terminal)
npm test                  # test suite
npm run test:pack         # smoke test the npm package
npm run build:lexical-demo
```

## License

MIT. See `LICENSE`.
