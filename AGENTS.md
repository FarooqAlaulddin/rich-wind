# Rich Wind — AGENTS

This file is for AI agents and contributors who clone the repo. It captures project structure, runtime behavior, and execution conventions. Keep it current when core behavior changes.

## What This Repo Is
- **Core library / service** for compiling Tailwind CSS from HTML/classes at runtime.
- **Demo UI** (React Router + Monaco) lives in `ui/` and talks to the core via HTTP.
- The core is intentionally **auth-agnostic**. Callers must supply a safe tenant-scoped `projectId`.

## Quick Map
- `services/index.js` — Express API, in-memory cache, compile/suggest endpoints.
- `tests/*.test.js` — Vitest tests for API, cache, docs examples.
- `ui/` — demo UI + HTMX preview pipeline.
  - `ui/app/routes/home.jsx` — main editor/preview screen.
  - `ui/app/routes/docs.jsx` — docs site route; loads Markdown files from `ui/public/docs` dynamically.
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

## UI/Preview Pipeline (Important)
Preview rendering is client-side to avoid hydration flicker:
- HTMX responses include a base64 `preview-data` payload.
- `ui/app/root.jsx` decodes it and updates the iframe DOM.
- iframe host doc is intentionally minimal; styling is controlled by **Custom CSS** in the editor.
- CSP allows Google Fonts from `fonts.googleapis.com` / `fonts.gstatic.com`.

If you change preview behavior:
- Keep CSP consistent.
- Avoid inline scripts inside `srcdoc` (sandboxed).
- Keep OOB ids stable (`status-pill`, `cache-badge`, `class-list`, `preview-badge`, etc.).

## UI Layout Notes
- Layout modes: split/editor/preview/collapsed (stored in `localStorage`).
- Splitter and pane height resizers are in `ui/app/root.jsx`.
- Body scroll is locked in split mode and unlocked for stacked/resized layouts.

## Docs Route Conventions
- Docs pages are discovered dynamically from `ui/public/docs/*.md`; do not hardcode docs page lists in route code.
- Files matching `_*.md` are treated as incomplete drafts and excluded from nav/routing, except `_review_*.md` and `_idea_*.md`.
- `_review_<name>.md` is published at `/docs/<name>` and must show a yellow "under review" banner.
- `_idea_<name>.md` is published at `/docs/<name>` and must show a blue "idea / not implemented yet" banner.
- When asked to rethink an idea/review doc, write it as a first-version document. Do not mention rewrites/new drafts/prior versions in the content.
- Docs nav sections must render in this order: `All Docs`, `Review`, `Ideas`.
- Each docs nav section should have a visible left border:
  - `All Docs`: blue
  - `Review`: yellow
  - `Ideas`: blue
- Empty categories should be hidden.
- `index.md` maps to `/docs`; all other published markdown files map to `/docs/<filename-without-.md>`.

## Instruction Authoring (Industry-Aligned)
- Be specific in rules; avoid vague guidance.
- Use structured headings and bullet points.
- Keep frequently used commands (build/test/lint) explicit in this file.
- Document architecture patterns and project quirks the model cannot infer from code alone.
- Review and update this file periodically as workflows evolve.

## Instruction Scope & Precedence
- Keep shared defaults in repo root `AGENTS.md`.
- For specialized subtrees, place scoped rules closer to code (for example nested `AGENTS.md` or `AGENTS.override.md`).
- More specific local rules should override broader repository defaults for that subtree.
- Avoid duplicating the same rule in multiple layers unless intentional.

## Git Workflow Expectations
- For every meaningful code/documentation change, create a commit with a clear, specific message that explains intent.
- After pushing to `dev`, maintain a pull request from `dev` to `main`.
- PR title and body must clearly cover what changed, why it changed, and how it was validated.

## Idea Architecture Checks
- Before proposing architecture ideas, validate assumptions against current behavior in `services/index.js`.
- Explicitly distinguish "current" vs "proposed" behavior.
- For plugin-related ideas, confirm whether current hooks are observer-only or behavior-influencing, and state resulting constraints.
- If an idea depends on other core changes, list those dependencies explicitly.
- Include concrete read-path and write-path flows plus failure semantics (timeout, fallback, fail-open/fail-closed) so proposals are testable.

## Rule Evolution
- Agents may add new rules when needed to prevent recurring mistakes, remove ambiguity, or capture newly established project conventions.
- New rules must stay consistent with higher-priority instructions and should be narrowly scoped, actionable, and verifiable.

## Conventions
- ESM modules (`type: module` in root and UI).
- Prefer small, direct functions for middleware.
- Keep the core library free of auth/session logic. Multi-tenant protection belongs in wrappers/host apps.

## Safe Changes Checklist
1. **Core API changes** -> update README + tests.
2. **HTMX OOB markup changes** -> verify IDs used in `root.jsx` still exist.
3. **Preview/CSP changes** -> verify Google Fonts and custom CSS still work.
4. **UI layout changes** -> verify split/stacked modes + resizer behavior.

## Common Gotchas
- Hydration mismatch can occur if SSR/client markup diverges.
- Do not hardcode preview styles in `htmx.compile.jsx` or `root.jsx`; keep styles in Custom CSS.
- `RW_TRUST_PROXY` affects rate-limit IP behavior; default false unless behind a trusted proxy.

## Deployment
This repo includes `render.yaml` for Render deploys (core + UI). Keep the core public endpoint in `RW_CORE_URL` for UI builds.
