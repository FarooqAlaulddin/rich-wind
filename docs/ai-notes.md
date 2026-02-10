# AI Notes (Codex/Claude/Cursor)

This file helps AI assistants quickly understand the project, its entry points, and the key data flows.

---

## What This Project Does
- Stateless Tailwind runtime that compiles CSS from HTML/class lists.
- In‑memory cache for speed (not persistence).
- Optional demo UI with Monaco editor + live preview.

---

## Core Entry Points

### Core API
- File: `services/index.js`
- Exported via `package.json` → `"main": "./services/index.js"`

### Demo UI
- `ui/app/routes/home.jsx` → main editor/preview screen
- `ui/app/routes/htmx.compile.jsx` → HTMX proxy to core compile/cache endpoints
- `ui/app/routes/api.suggest.jsx` → UI proxy to `/api/suggest`
- `ui/app/root.jsx` → global client logic (HTMX + preview sync + layout/resizers)
- `ui/app/app.css` → UI theme/layout styles

---

## Core API Behavior (Quick Summary)

### `POST /api/compile`
- Input: `{ projectId, pageId, html?, classes? }`
- Output: `{ css, classes, hash, cached }`
- Updates in‑memory project/page cache.

### `GET /api/projects/:projectId/css`
- Returns CSS for union of cached classes in a project.

### `POST /api/suggest`
- Returns Tailwind static class list + cached project classes.
- Arbitrary values (`text-[18px]`) are not enumerated.

---

## Preview Pipeline (Important)

The preview is **client‑side rendered** to avoid React hydration flicker:
- HTMX response includes base64 `preview-data`.
- `ui/app/root.jsx` decodes and writes into iframe DOM.
- The iframe `srcdoc` contains **no scripts**; all JS runs in the parent.
- Preview styling is controlled by **Custom CSS** in the editor.
- CSP allows Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`).

Key DOM ids used for out‑of‑band updates:
- `status-pill`, `cache-badge`, `class-list`, `preview-badge`
- `preview-data`, `css-output`, `preview-frame`

---

## Caching & Isolation
- Cache keys are based on `projectId` + `pageId`.
- No auth or tenant isolation in the core.
- Callers should namespace `projectId` (e.g. `tenantId:projectId`).

---

## Layout & Resizing
- Split layout uses a column splitter (stored in `localStorage`).
- Editor/preview height resizers are in `root.jsx`.
- Body scroll is locked in split mode; unlocked when stacked/resized.

---

## Running Locally

Core:
```bash
npm install
npm run dev
```

UI:
```bash
cd ui
npm install
RW_CORE_URL=http://localhost:3001 npm run dev
```

---

## Tests
```bash
npm test
```

---

## Common Gotchas
- Hydration mismatch warnings appear if SSR markup differs from client changes.
- Avoid inline script tags in iframe `srcdoc` (sandboxed).
- Don’t hardcode preview styles in core responses; keep them in Custom CSS.
- Env values are read at module init, so tests must set env before import.

---

## Suggested Reading Order
1. `services/index.js`
2. `README.md`
3. `ui/app/routes/home.jsx`
4. `ui/app/root.jsx`
5. `ui/app/routes/htmx.compile.jsx`

