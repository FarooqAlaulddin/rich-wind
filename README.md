# Rich Wind

Runtime Tailwind CSS compiler library: compile class names or HTML to CSS at runtime, no build step. It is for markup that did not exist when your app was built. The main use is AI-driven UI, where a model writes the HTML after deploy ([overview](https://farooqalaulddin.github.io/rich-wind/)). CMS pages, editors and previews use it the same way.

V1 compiles against Tailwind's default design system. Core compiles explicit classes or the class attributes of HTML and serves CSS. Authentication, tenant mapping, rate limiting, and TLS belong to the host app or a proxy.

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

You can also run the bundled server (`npm start`) as a separate service behind a proxy. See [Embedding](https://farooqalaulddin.github.io/rich-wind/integration-cookbook.html#embedding) for each pattern.

## API

Endpoints, functions, errors, and configuration are in the [API Reference](https://farooqalaulddin.github.io/rich-wind/api-reference.html). Options are set through `createCore({ config: { ... } })` or `RW_*` environment variables; the full list is in [Configuration](https://farooqalaulddin.github.io/rich-wind/api-reference.html#configuration). `PORT` applies only to the bundled server (`npm start`), not to `createCore`.

## Docs

- **[Overview](https://farooqalaulddin.github.io/rich-wind/)**
- **[Agent Quickstart](https://farooqalaulddin.github.io/rich-wind/agent-quickstart.html)** - the compile, `rejected`, recompile loop for models
- **[API Reference](https://farooqalaulddin.github.io/rich-wind/api-reference.html)** - endpoints, functions, errors, config
- **[Runtime Spec](https://farooqalaulddin.github.io/rich-wind/runtime-spec.html)** - caching, `cacheStore`, replica roles, threat model
- **[Plugin System](https://farooqalaulddin.github.io/rich-wind/plugin-system.html)** - hooks, setup context, custom routes
- **[Integration Cookbook](https://farooqalaulddin.github.io/rich-wind/integration-cookbook.html)** - multi-tenant wrappers, editors, CMS pipelines

## Development

```bash
npm install
npm test
npm run dev              # core API (watch mode) at localhost:3001
npm run dev:lexical      # core API + demo plugins for the Lexical demo
npm run dev:lexical-ui   # Lexical demo at localhost:5174 (separate terminal)
```

## License

MIT. See `LICENSE`.
