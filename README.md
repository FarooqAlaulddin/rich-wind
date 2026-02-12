# Rich Wind

Runtime Tailwind CSS compiler and suggestion API. Feed it HTML or class lists, get back compiled CSS. Caching is in memory by `projectId` + `pageId`.

## Table of Contents
- Background
- Features
- Install
- Usage
- API
- Configuration
- Development
- License

## Background
Rich Wind focuses on the “compile at request time” workflow without persisting CSS or class state. It’s intentionally auth‑agnostic and expects callers to scope `projectId` within their own tenant model.

## Features
- Compile CSS from HTML, class strings, or both.
- In‑memory page cache plus aggregated project CSS.
- Class suggestions from cached data and Tailwind’s static design system.
- Simple JSON API with small surface area.

## Install

```bash
npm install
```

## Usage

### Run the core API

```bash
npm run start
```

Default base URL: `http://localhost:3001`

### Run the UI demo (optional)

```bash
cd ui
npm install
RW_CORE_URL=http://localhost:3001 npm run dev
```

## API

### `POST /api/compile`
Compile CSS for a page.

Request body:

```json
{
  "projectId": "string (required)",
  "pageId": "string (optional, default: \"default\")",
  "html": "string (optional)",
  "classes": "string | string[] (optional)"
}
```

At least one of `html` or `classes` is required.

Response:

```json
{
  "success": true,
  "projectId": "string",
  "pageId": "string",
  "hash": "string",
  "classes": ["string"],
  "cached": true,
  "css": "string"
}
```

Example:

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "demo",
    "pageId": "hero",
    "html": "<div class=\"text-red-500\">Hello</div>",
    "classes": ["bg-blue-500", "p-4"]
  }'
```

### `GET /api/css`
Fetch cached CSS for a page.

Query:

```text
projectId (required)
pageId (optional, default: "default")
```

Response: `text/css`

Example:

```bash
curl "http://localhost:3001/api/css?projectId=demo&pageId=hero"
```

### `GET /api/projects/:projectId/css`
Fetch aggregated CSS for a project (union of cached pages).

Response: `text/css`

Example:

```bash
curl "http://localhost:3001/api/projects/demo/css"
```

### `POST /api/suggest`
Class suggestions from cached data and Tailwind’s static list. Arbitrary values are not enumerated.

Request body:

```json
{
  "projectId": "string (optional)",
  "prefix": "string (optional)",
  "classes": "string | string[] (optional)",
  "limit": "number (optional)"
}
```

Response:

```json
{
  "success": true,
  "projectId": "string | null",
  "prefix": "string",
  "count": 10,
  "suggestions": ["string"]
}
```

Example:

```bash
curl -X POST http://localhost:3001/api/suggest \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "demo", "prefix": "bg-", "limit": 8 }'
```

### `GET /health`
Health check.

Response:

```json
{ "status": "ok" }
```

## Configuration

Environment variables (core):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `RW_CACHE_MAX_PAGES` | `200` | Max cached pages |
| `RW_CACHE_TTL_MS` | `600000` | Page cache TTL |
| `RW_PROJECT_CACHE_TTL_MS` | `600000` | Project CSS TTL |
| `RW_MAX_BODY_BYTES` | `100000` | Request size limit |
| `RW_MAX_HTML_CHARS` | `50000` | Max HTML length |
| `RW_MAX_CLASS_CHARS` | `10000` | Max class string length |
| `RW_MAX_CLASS_COUNT` | `1500` | Max class count |
| `RW_MAX_ID_LENGTH` | `64` | Max `projectId`/`pageId` length |
| `RW_SUGGEST_LIMIT` | `100` | Max suggestions |
| `RW_SUGGEST_FALLBACK` | `true` | Include Tailwind static list |
| `RW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RW_RATE_LIMIT_MAX` | `60` | Requests per window |
| `RW_RATE_LIMIT_DISABLED` | `false` | Disable rate limiting |
| `RW_TRUST_PROXY` | `false` | Trust proxy IPs |

Environment variables (UI):

| Variable | Default | Purpose |
| --- | --- | --- |
| `RW_CORE_URL` | `http://localhost:3001` | Core API base URL |

## Development

```bash
npm test
```

## License

MIT. See `LICENSE`.
