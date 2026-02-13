# Rich Wind — AGENTS

This file is for AI agents and contributors who clone the repo. It captures how the project is structured, how to run it, and the conventions that matter. Keep it current if you change core behavior.

## What This Repo Is
- **Core library / service** for compiling Tailwind CSS from HTML/classes at runtime.
- **Demo UI** (React Router + Monaco) lives in `ui/` and talks to the core via HTTP.
- The core is intentionally **auth‑agnostic**. Callers must supply a safe `projectId` (or namespace) in their own systems.

## Quick Map
- `services/index.js` — Express API, in‑memory cache, compile/suggest endpoints.
- `tests/*.test.js` — Vitest tests for API and cache.
- `ui/` — demo UI + HTMX preview pipeline.
  - `ui/app/routes/home.jsx` — main editor/preview screen.
  - `ui/app/routes/htmx.compile.jsx` — HTMX endpoint that proxies compile/cache/project calls to core and returns OOB updates.
  - `ui/app/routes/api.suggest.jsx` — UI proxy to core `/api/suggest`.
  - `ui/app/root.jsx` — global client script: HTMX, preview sync, layout, resizers, copy button.
  - `ui/app/app.css` — UI styling.

## Environment & Prereqs
- Node.js **>= 20** (see `package.json`).
- `npm` is used in scripts.

## Run (Core)
```bash
npm install
npm run dev
```
Core listens on `http://localhost:3001` by default (`PORT` env overrides).

## Run (UI)
```bash
cd ui
npm install
RW_CORE_URL=http://localhost:3001 npm run dev
```
UI uses React Router dev server (usually `http://localhost:5173` or next available).

## Tests
```bash
npm test
```
- Uses Vitest.
- If you adjust env‑driven behavior, set env **before** importing the app in tests.

## Core API Notes
Key endpoints are in `services/index.js`:
- `POST /api/compile`
- `POST /api/suggest`
- `GET /api/css`
- `GET /api/projects/:projectId/css`

The API is **stateless** except for in‑memory caches. `projectId` is required for caching and should be **tenant‑scoped by the caller**.

## Cache & Rate Limit Configuration
Config can be set via `createCore({ config: { ... } })` or env vars (see README for full list):
- Cache: `RW_CACHE_MAX_PAGES`, `RW_CACHE_TTL_MS`, `RW_PROJECT_CACHE_TTL_MS`
- Request limits: `RW_MAX_BODY_BYTES`, `RW_MAX_HTML_CHARS`, `RW_MAX_CLASS_CHARS`, `RW_MAX_CLASS_COUNT`, `RW_MAX_ID_LENGTH`
- Suggest: `RW_SUGGEST_LIMIT`, `RW_SUGGEST_FALLBACK`
- Rate limit: `RW_RATE_LIMIT_WINDOW_MS`, `RW_RATE_LIMIT_MAX`, `RW_RATE_LIMIT_DISABLED`, `RW_TRUST_PROXY`

## Suggestions
`/api/suggest` returns:
- Tailwind **static class list** (from Tailwind design system).
- Plus cached classes per project + provided `classes`.
Arbitrary values (`text-[18px]`) are not enumerated; callers must supply them directly.

## UI/Preview Pipeline (Important)
Preview rendering is **client‑side** to avoid hydration flicker:
- HTMX responses include a base64 `preview-data` payload.
- `ui/app/root.jsx` decodes it and updates the iframe DOM.
- The iframe host doc is intentionally minimal; styling is controlled by **Custom CSS** in the editor.
- CSP allows **Google Fonts** from `fonts.googleapis.com` / `fonts.gstatic.com`.

If you change preview behavior:
- Keep CSP consistent.
- Avoid inline scripts inside `srcdoc` (sandboxed).
- Keep OOB ids stable (`status-pill`, `cache-badge`, `class-list`, `preview-badge`, etc.).

## UI Layout Notes
- Layout modes: split/editor/preview/collapsed (stored in `localStorage`).
- Splitter (horizontal) and pane height resizers are in `ui/app/root.jsx`.
- Body scroll is normally locked in split mode; it unlocks for stacked layouts or when a pane is resized.

## Conventions
- ESM modules (`type: module` in root and UI).
- Prefer small, direct functions for middleware.
- Keep the core library free of auth/session logic. Any multi‑tenant protection belongs in a wrapper or host app.

## Safe Changes Checklist
When editing:
1. **Core API changes** → update README + tests.
2. **HTMX OOB markup changes** → verify IDs used in `root.jsx` still exist.
3. **Preview/CSP changes** → verify Google Fonts and custom CSS still work.
4. **UI layout changes** → check split/stacked modes + resizer behavior.

## Common Gotchas
- Hydration mismatch happens if SSR and client markup diverge. The UI uses `suppressHydrationWarning` in a few spots.
- Avoid hardcoding preview styles in `htmx.compile.jsx` or `root.jsx`; they should be in Custom CSS.
- `RW_TRUST_PROXY` affects rate limiting IPs—default to false unless behind a trusted proxy.

## Deployment
This repo includes `render.yaml` for Render deploys (core + UI). Keep the core public endpoint in `RW_CORE_URL` for UI builds.
