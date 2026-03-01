# Rich Wind — AGENTS

This file is for AI agents and contributors who clone the repo. It captures project structure, runtime behavior, and execution conventions. Keep it current when core behavior changes.

## What This Repo Is
- **Core library / service** for compiling Tailwind CSS from HTML/classes at runtime.
- **Demo** is a Preact SPA (`demo/src/`) with Monaco editor, live preview, docs, and plugin showcases. Built with Vite.
- **Lexical Demo** (`lexical-demo/src/`) is a separate Preact app demonstrating Rich Wind with a Lexical rich text editor.
- The core is intentionally **auth-agnostic**. Callers must supply a safe tenant-scoped `projectId`.

## Quick Map
- `services/index.js` — Express API, in-memory cache, compile/suggest endpoints, plugin system.
- `services/index.d.ts` — TypeScript definitions for the public API and plugin interfaces.
- `tests/*.test.js` — Vitest tests (239 tests across 18 files).
- `plugins/auto-promote/` — built-in auto-promote plugin.
- `demo/` — Preact SPA demo (Vite + `@preact/preset-vite`).
  - `demo/src/App.jsx` — root component with preact-router (5 routes: playground, docs, plugin showcases).
  - `demo/src/components/` — EditorPane, PreviewFrame, MonacoEditor, DocsShell, DocsSidebar, etc.
  - `demo/src/pages/` — Docs, Analytics, AutoPromote page components.
  - `demo/demo.css` — hand-written CSS for things Tailwind can't express.
- `lexical-demo/` — Lexical rich text editor demo (separate Vite app, deployed under `/lexical-demo/`).
- `scripts/dev-server.js` — starts rich-wind core + serves the demo (dev and production modes).
- `scripts/demo-routes.js` — Express handlers for documentation API (`/api/docs/*`).
- `scripts/docs-catalog.js` — scans `/docs` directory, builds navigation catalog from markdown files.
- `docs/` — Markdown documentation rendered inside the demo at `/docs`.

## Environment & Prereqs
- Node.js **>= 20** (see `package.json`).
- `npm` is used in scripts.

## Run
```bash
npm install
npm run dev:demo
```
This starts the core service + demo at `http://localhost:3001` (`PORT` env overrides).

For core-only (no demo UI):
```bash
npm run dev
```

## Tests
```bash
npm test
```
- Uses Vitest.
- If you adjust env-driven behavior, set env **before** importing the app in tests.

## Core API Notes
Key endpoints in `services/index.js`:
- `POST /api/compile`
- `POST /api/suggest`
- `GET /api/css`
- `GET /api/projects/:projectId/css`
- `GET /health`

Core runtime is stateless except for process-local in-memory caches.

## Cache & Rate Limit Configuration
Config can be set via `createCore({ config: { ... } })` or env vars:
- Cache: `RW_CACHE_MAX_PAGES`, `RW_CACHE_TTL_MS`, `RW_PROJECT_CACHE_TTL_MS`
- Request limits: `RW_MAX_BODY_BYTES`, `RW_MAX_HTML_CHARS`, `RW_MAX_CLASS_CHARS`, `RW_MAX_CLASS_COUNT`, `RW_MAX_ID_LENGTH`
- Suggest: `RW_SUGGEST_LIMIT`, `RW_SUGGEST_FALLBACK`
- Rate limit: `RW_RATE_LIMIT_WINDOW_MS`, `RW_RATE_LIMIT_MAX`, `RW_RATE_LIMIT_DISABLED`, `RW_TRUST_PROXY`

## Suggestions
`/api/suggest` returns:
- Tailwind static class list (design system)
- cached classes per project
- optional provided `classes`

Arbitrary values (`text-[18px]`) are not enumerated.

## Demo Architecture
The demo is a Preact SPA built with Vite:
- **Playground** (`/`) — Monaco code editor with live preview iframe, auto-compile on keystroke.
- **Docs** (`/docs`, `/docs/:slug`) — markdown docs fetched from `/api/docs/*` endpoints, rendered client-side.
- **Plugin showcases** (`/plugins/analytics`, `/plugins/auto-promote`) — interactive dashboards for built-in plugins.
- Preview iframe renders compiled HTML with CSS injected via `<style>` tags.
- `VITE_RW_CORE_URL` env var controls the core API base URL (defaults to `http://localhost:3001`).

## Lexical Demo
The lexical-demo is a separate Preact app at `lexical-demo/`:
- Multi-page editor with Tailwind class inspector panel.
- Built with Vite, deployed under `/lexical-demo/` base path.
- Shares the same core API via `VITE_RW_CORE_URL`.

## Conventions
- ESM modules (`type: module` in root).
- Prefer small, direct functions for middleware.
- Keep the core library free of auth/session logic. Multi-tenant protection belongs in wrappers/host apps.

## Safe Changes Checklist
1. **Core API changes** → update README + tests + `docs/api-reference.md`.
2. **Plugin system changes** → update `docs/plugin-system.md` + `services/index.d.ts` + tests.
3. **Demo component changes** → verify all 5 routes still render correctly.
4. **Preview/CSP changes** → verify Google Fonts and custom CSS still work in iframe.
5. **Documentation changes** → verify `/api/docs/catalog` and `/api/docs/:slug` still serve correctly.

## Common Gotchas
- Do not hardcode preview styles in the compile route; keep styles in Custom CSS.
- `RW_TRUST_PROXY` affects rate-limit IP behavior; default false unless behind a trusted proxy.
- The demo and lexical-demo are separate Vite apps with separate `package.json` files.

## Git Workflow Expectations
- For every meaningful code/documentation change, create a commit with a clear, specific message that explains intent.
- After pushing to `dev`, maintain a pull request from `dev` to `main`.
- PR title and body must clearly cover what changed, why it changed, and how it was validated.

## Rule Evolution
- Agents may add new rules when needed to prevent recurring mistakes, remove ambiguity, or capture newly established project conventions.
- New rules must stay consistent with higher-priority instructions and should be narrowly scoped, actionable, and verifiable.

## Deployment
Set `RW_TRUST_PROXY=1` and `VITE_RW_CORE_URL` for production environments behind a reverse proxy.
