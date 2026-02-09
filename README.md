# Rich Wind Core

Rich Wind Core is a stateless Tailwind runtime service. It compiles CSS from
HTML and/or class lists and caches results in memory (LRU + TTL). There is no
database.

## Deploy on Render (free)

This repo includes a `render.yaml` Blueprint that provisions **two web services**:
- `rich-wind-core` (API)
- `rich-wind-ui` (SSR demo UI)

Render will wire the UI to the API automatically via `RW_CORE_URL` (internal host:port).

### Steps
1. Push this repo to GitHub.
2. In Render, create a **Blueprint** and point it at the repo root.
3. Render will detect `render.yaml` and provision both services.
4. Open the `rich-wind-ui` service URL when the deploy finishes.

### Notes
- Free services **sleep after 15 minutes of inactivity**, so the first request can be slow.
- If you change rate limits or size caps, update env vars in Render or edit `render.yaml`.

## Run The Core Service

```bash
npm install
npm run start
```

The server listens on `http://localhost:3001`.

## API

### `POST /api/compile`

Compile CSS for a project page. Accepts `html`, `classes`, or both.

```json
{
  "projectId": "demo-project",
  "pageId": "hero",
  "html": "<div class='text-red-500'>Hello</div>",
  "classes": "bg-blue-500 p-4"
}
```

### `GET /api/css?projectId=...&pageId=...`

Fetch cached CSS for a project page. Returns `404` on cache miss.

### `GET /api/projects/:projectId/css`

Return aggregated CSS for all cached pages in a project.

## UI Demo

The demo UI lives in `ui/`.

```bash
cd ui
npm install
npm run dev
```

The UI proxies `/api` calls to `http://localhost:3001` by default.
