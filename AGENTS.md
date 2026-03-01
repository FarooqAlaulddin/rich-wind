# Rich Wind — AGENTS

This file is for AI agents and contributors who clone the repo. It captures project structure, runtime behavior, and execution conventions. Keep it current when core behavior changes.

## What This Repo Is
- **Core library / service** for compiling Tailwind CSS from HTML/classes at runtime.
- **Demo** is a single HTML file (`demo/index.html`) using HTMX, served by the dev server. It dogfoods rich-wind for its own shell CSS.
- The core is intentionally **auth-agnostic**. Callers must supply a safe tenant-scoped `projectId`.

## Quick Map
- `services/index.js` — Express API, in-memory cache, compile/suggest endpoints.
- `tests/*.test.js` — Vitest tests for API, cache, docs examples.
- `demo/` — single-page HTMX demo that dogfoods rich-wind.
  - `demo/index.html` — the entire UI in one HTML file with Tailwind utility classes.
  - `demo/demo.css` — hand-written CSS for things Tailwind can't express (vars, animations, pseudo-elements, media queries).
  - `demo/scripts/` — vanilla JS client scripts (tab switching, preview sync, auto-compile, layout, etc.).
- `scripts/dev-server.js` — starts rich-wind core + serves the demo.
- `scripts/demo-routes.js` — Express handlers for `/htmx/compile` and `/demo/shell.css`.
- `scripts/demo-helpers.js` — HTML fragment generators for HTMX OOB swaps.

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

## Demo / Preview Pipeline (Important)
The demo uses HTMX for server communication and client-side JS for preview rendering:
- HTMX responses include a base64 `preview-data` payload via OOB swaps.
- `demo/scripts/preview-sync.js` decodes it and updates the iframe DOM.
- iframe host doc is intentionally minimal; styling is controlled by **Custom CSS** in the editor.
- CSP allows Google Fonts from `fonts.googleapis.com` / `fonts.gstatic.com`.
- Shell CSS (`/demo/shell.css`) compiles the demo's own HTML through rich-wind — dogfooding.

If you change preview behavior:
- Keep CSP consistent.
- Avoid inline scripts inside `srcdoc` (sandboxed).
- Keep OOB ids stable (`status-pill`, `cache-badge`, `class-list`, `preview-badge`, etc.).

## Demo Layout Notes
- Layout modes: split/editor/preview/collapsed (stored in `localStorage`).
- Splitter and pane height resizers are in `demo/scripts/splitter.js` and `demo/scripts/pane-resizers.js`.
- Body scroll is locked in split mode and unlocked for stacked/resized layouts.
- Editor tabs use `data-tab`/`data-panel` attributes; preview tabs use `data-preview-tab`/`data-preview-panel`.

## Conventions
- ESM modules (`type: module` in root).
- Prefer small, direct functions for middleware.
- Keep the core library free of auth/session logic. Multi-tenant protection belongs in wrappers/host apps.

## Safe Changes Checklist
1. **Core API changes** -> update README + tests.
2. **HTMX OOB markup changes** -> verify IDs used in demo/index.html and scripts still exist.
3. **Preview/CSP changes** -> verify Google Fonts and custom CSS still work.
4. **Demo layout changes** -> verify split/stacked modes + resizer behavior.

## Common Gotchas
- Do not hardcode preview styles in the compile route; keep styles in Custom CSS.
- `RW_TRUST_PROXY` affects rate-limit IP behavior; default false unless behind a trusted proxy.

## Git Workflow Expectations
- For every meaningful code/documentation change, create a commit with a clear, specific message that explains intent.
- After pushing to `dev`, maintain a pull request from `dev` to `main`.
- PR title and body must clearly cover what changed, why it changed, and how it was validated.

## Rule Evolution
- Agents may add new rules when needed to prevent recurring mistakes, remove ambiguity, or capture newly established project conventions.
- New rules must stay consistent with higher-priority instructions and should be narrowly scoped, actionable, and verifiable.

## Deployment
Set `RW_TRUST_PROXY=1` and `RW_CORE_URL` for production environments behind a reverse proxy.
