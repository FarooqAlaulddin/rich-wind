# Rich Wind — AGENTS

This file is for AI agents and contributors who clone the repo. It captures project structure, runtime behavior, and execution conventions. Keep it current when core behavior changes.

## What This Repo Is
- **Core library / service** for compiling Tailwind CSS from HTML/classes at runtime.
- **Lexical Demo** (`lexical-demo/src/`) is the only live reference UI in this branch. It demonstrates Rich Wind with a Lexical rich text editor.
- The previous playground/docs/plugin showcase app is parked on the `parked-demos` branch.
- The core is intentionally **auth-agnostic**. Callers must supply a safe tenant-scoped `projectId`.

## Quick Map
- `services/index.js` — Express API, in-memory cache, compile/suggest endpoints, plugin system.
- `services/index.d.ts` — TypeScript definitions for the public API and plugin interfaces.
- `tests/*.test.js` — Vitest tests (239 tests across 18 files).
- `plugins/auto-promote/` — built-in auto-promote plugin used by the Lexical demo and tests.
- `lexical-demo/` — Lexical rich text editor demo (separate Vite app, deployed under `/lexical-demo/`).
- `lexical-demo/scripts/dev-server.js` — starts rich-wind core with demo plugins for the Lexical demo.
- `scripts/` — root package/release utilities only (`clean-package`, pack smoke, load test).
- `docs/` — Markdown documentation intended for GitHub Pages.

## Environment & Prereqs
- Node.js **>= 20** for the core package.
- Node.js **>= 20.19.0** for repo development and the Lexical demo, because Vite 8 requires it.
- `npm` is used in scripts.

## Run
```bash
npm install
npm run dev:lexical
```
This starts the core service with demo plugins at `http://localhost:3001` (`PORT` env overrides).

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
The previous playground/docs/plugin showcase app is parked on the `parked-demos` branch. Keep this branch focused on the core runtime, package docs, and the Lexical reference app.

## Lexical Demo
The lexical-demo is a separate Vite app at `lexical-demo/`:
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
3. **Lexical demo component changes** → verify the editor, preview iframe, inspector, and autocomplete still render correctly.
4. **Preview/CSP changes** → verify Google Fonts and custom CSS still work in the Lexical preview iframe.
5. **Documentation changes** → verify Markdown links and GitHub Pages suitability.

## Common Gotchas
- Do not hardcode preview styles in the compile route; keep styles in Custom CSS.
- `RW_TRUST_PROXY` affects rate-limit IP behavior; default false unless behind a trusted proxy.
- The full playground/docs/plugin showcase is intentionally parked on `parked-demos`; do not recreate it on `dev` unless requested.

## Git Workflow Expectations
- For every meaningful code/documentation change, create a commit with a clear, specific message that explains intent.
- After pushing to `dev`, maintain a pull request from `dev` to `main`.
- PR title and body must clearly cover what changed, why it changed, and how it was validated.

## Rule Evolution
- Agents may add new rules when needed to prevent recurring mistakes, remove ambiguity, or capture newly established project conventions.
- New rules must stay consistent with higher-priority instructions and should be narrowly scoped, actionable, and verifiable.

## Deployment
Set `RW_TRUST_PROXY=1` and `VITE_RW_CORE_URL` for production environments behind a reverse proxy.


<claude-mem-context>
# Memory Context

# [rich-wind] recent context, 2026-05-04 5:36pm PDT

No previous sessions found.
</claude-mem-context>