# Rich Wind

**A stateless Tailwind CSS v4 runtime service that compiles CSS from HTML and class lists on-the-fly**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)

---

## Features

- 🚀 **Stateless Runtime Service** — Compile Tailwind CSS on-demand from HTML or class lists
- 💾 **In-Memory Caching** — LRU + TTL eviction strategy, no database required
- 🔗 **Dual Usage** — Run as a standalone API service OR import as an npm library (`import { app } from 'rich-wind-core'`)
- 🎯 **Per-Page & Project-Level Caching** — Compile individual pages or aggregate CSS across a project
- 🛡️ **Production-Ready Security** — Rate limiting, input validation, security headers, payload size limits
- 🎨 **Live Demo UI** — React 19 + React Router 7 SSR dashboard with Monaco editor and live preview
- ⚡ **Fast & Efficient** — Hash-based deduplication, class extraction via `@tailwindcss/oxide` Scanner
- 🐳 **Docker Ready** — Includes optimized Alpine-based Dockerfile
- ☁️ **One-Click Deploy** — Render Blueprint provisions both API and UI services

---

## Tech Stack

### Core Service (`/`)

- **Runtime:** Node.js 20+ (Alpine Linux)
- **Framework:** Express 5.x
- **Module System:** ES Modules (`"type": "module"`)
- **Tailwind CSS:** `@tailwindcss/node` v4.1.4, `@tailwindcss/oxide` v4.1.4
- **Testing:** Vitest 3.x

### Demo UI (`ui/`)

- **Frontend:** React 19.1.0
- **Routing:** React Router 7.7.1 (SSR enabled)
- **Build Tool:** Vite 7.0.6
- **Styling:** Tailwind CSS v4.1.4 with `@tailwindcss/vite`
- **Code Editor:** Monaco Editor 0.49.0
- **Icons:** Lucide React 0.526.0

---

## Project Structure

```
rich-wind/
├── .dockerignore
├── .gitignore
├── Dockerfile                  # Production-ready Alpine image
├── LICENSE                     # MIT License
├── README.md                   # This file
├── package.json                # Core service dependencies
├── package-lock.json
├── render.yaml                 # Render Blueprint (provisions 2 services)
├── vitest.config.js            # Test configuration
├── services/
│   └── index.js                # Core API server (~480 lines)
├── tests/
│   └── api.test.js             # API integration tests
└── ui/                         # Demo SSR UI
    ├── .react-router/
    ├── app/
    │   ├── routes/
    │   │   ├── home.jsx        # Landing page
    │   │   ├── htmx.compile.jsx # HTMX-driven compilation demo
    │   │   └── preview.jsx     # Live preview with Monaco editor
    │   ├── routes.js
    │   └── sessions.server.js
    ├── components.json
    ├── package.json
    ├── public/
    ├── react-router.config.js  # SSR config
    ├── README.md
    └── vite.config.js          # Proxies /api to localhost:3001
```

---

## Prerequisites

- **Node.js** 20 or higher
- **npm** 7 or higher

---

## Quick Start

### 1. Run the Core API Service

```bash
# Install dependencies
npm install

# Start the server (production)
npm run start

# OR start with auto-reload (development)
npm run dev
```

The API will be available at **`http://localhost:3001`**.

### 2. Run the Demo UI (Optional)

```bash
# Navigate to the UI directory
cd ui

# Install dependencies
npm install

# Start the development server
npm run dev
```

The UI will be available at **`http://localhost:5173`** (proxies `/api` requests to `localhost:3001`).

### 3. Build the UI for Production

```bash
cd ui
npm run build
npm run start
```

The production SSR server will run on **`http://localhost:3000`**.

---

## API Reference

### `POST /api/compile`

Compile Tailwind CSS for a project page. Accepts `html`, `classes`, or both.

**Request Body:**

```json
{
  "projectId": "demo-project",      // Required: Project identifier
  "pageId": "home",                 // Optional: Defaults to "default"
  "html": "<div class='text-red-500 font-bold'>Hello</div>",
  "classes": "bg-blue-500 p-4 hover:bg-blue-600"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "projectId": "demo-project",
  "pageId": "home",
  "hash": "a3f5c9...",
  "classes": ["bg-blue-500", "font-bold", "hover:bg-blue-600", "p-4", "text-red-500"],
  "cached": false,
  "css": "/* Compiled Tailwind CSS */"
}
```

**Error Codes:**
- `400` — Missing/invalid `projectId`, invalid `pageId`, no input provided, input too long
- `413` — Too many classes (exceeds `RW_MAX_CLASS_COUNT`)
- `429` — Rate limit exceeded
- `500` — Internal server error

**cURL Example:**

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "my-app",
    "pageId": "landing",
    "html": "<button class=\"bg-blue-500 text-white px-4 py-2 rounded\">Click Me</button>"
  }'
```

---

### `GET /api/css`

Fetch cached CSS for a specific project page.

**Query Parameters:**
- `projectId` (required) — Project identifier
- `pageId` (optional) — Defaults to `"default"`

> **Note:** Also accepts `project_id` and `page_id` in snake_case.

**Response (200 OK):**

```css
/* Compiled Tailwind CSS */
.bg-blue-500 { background-color: rgb(59 130 246); }
.text-white { color: rgb(255 255 255); }
/* ... */
```

**Error Codes:**
- `400` — Missing or invalid `projectId`/`pageId`
- `404` — Cache miss (page not compiled yet)
- `429` — Rate limit exceeded
- `500` — Internal server error

**cURL Example:**

```bash
curl "http://localhost:3001/api/css?projectId=my-app&pageId=landing"
```

---

### `GET /api/projects/:projectId/css`

Get aggregated CSS for all cached pages in a project. Merges classes from all pages and compiles once.

**URL Parameters:**
- `projectId` (required) — Project identifier

**Response (200 OK):**

```css
/* Aggregated Tailwind CSS from all project pages */
```

**Error Codes:**
- `400` — Invalid `projectId`
- `404` — Project not found in cache
- `429` — Rate limit exceeded
- `500` — Internal server error

**cURL Example:**

```bash
curl http://localhost:3001/api/projects/my-app/css
```

---

### `GET /health`

Health check endpoint for monitoring and uptime checks.

**Response (200 OK):**

```json
{
  "status": "ok"
}
```

**cURL Example:**

```bash
curl http://localhost:3001/health
```

---

## Environment Variables

All environment variables are **optional** and have sensible defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server listen port |
| `NODE_ENV` | — | Node environment (`production`, `development`, etc.) |
| `RW_CACHE_MAX_PAGES` | `200` | Maximum number of pages in the LRU cache |
| `RW_CACHE_TTL_MS` | `600000` (10 min) | Time-to-live for individual page cache entries (milliseconds) |
| `RW_PROJECT_CACHE_TTL_MS` | Same as `RW_CACHE_TTL_MS` | Time-to-live for aggregated project CSS cache (milliseconds) |
| `RW_MAX_BODY_BYTES` | `100000` | Maximum request body size (bytes) |
| `RW_MAX_HTML_CHARS` | `50000` | Maximum HTML input length (characters) |
| `RW_MAX_CLASS_CHARS` | `10000` | Maximum class list input length (characters) |
| `RW_MAX_CLASS_COUNT` | `1500` | Maximum number of resolved Tailwind classes per page |
| `RW_MAX_ID_LENGTH` | `64` | Maximum length of `projectId`/`pageId` strings |
| `RW_RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Rate limit sliding window duration (milliseconds) |
| `RW_RATE_LIMIT_MAX` | `60` | Maximum requests per IP per window |
| `RW_RATE_LIMIT_DISABLED` | `false` | Set to `"true"` to disable rate limiting (not recommended in production) |
| `RW_CORE_URL` | — | *(UI only)* URL of the core service; auto-wired on Render |

**ID Validation Rules:**
- `projectId` and `pageId` must be ≤ 64 characters
- Must match pattern: `a-z`, `0-9`, `.`, `-`, `_`

---

## Caching

Rich Wind uses an **in-memory LRU (Least Recently Used) cache with TTL (Time-To-Live) expiration** — no database required.

### Per-Page Caching

- Each `(projectId, pageId)` pair stores:
  - Compiled CSS
  - Resolved class set
  - Content hash (SHA-256)
- **Cache hit detection:** If the incoming class list produces the same hash as the cached entry, the cached CSS is returned immediately.
- **LRU eviction:** When the cache exceeds `RW_CACHE_MAX_PAGES`, the least recently accessed page is evicted.
- **TTL expiration:** Entries expire after `RW_CACHE_TTL_MS` milliseconds.

### Project-Level Caching

- The `/api/projects/:projectId/css` endpoint **aggregates classes from all cached pages** in a project.
- Compiles a **single unified CSS file** for the entire project.
- Cached separately with its own TTL (`RW_PROJECT_CACHE_TTL_MS`).
- Automatically invalidated when any page in the project is updated.

### Hash-Based Deduplication

- Rich Wind computes a **SHA-256 hash** of the sorted class list.
- If the hash matches an existing cache entry, no recompilation occurs.
- Ensures efficient caching even when input order changes.

---

## Security

Rich Wind is hardened for production use with multiple layers of protection:

### Security Headers

All responses include the following headers:

- `X-Content-Type-Options: nosniff` — Prevents MIME-type sniffing
- `Referrer-Policy: no-referrer` — Blocks referrer leakage
- `X-Frame-Options: DENY` — Prevents clickjacking
- `Cross-Origin-Resource-Policy: same-origin` — Restricts cross-origin resource sharing
- `x-powered-by` header is **disabled** (no framework fingerprinting)

### Rate Limiting

- **Per-IP rate limiting** using a sliding window algorithm
- Default: **60 requests per minute** per IP address
- Returns `429 Too Many Requests` with a `Retry-After` header when exceeded
- Configurable via `RW_RATE_LIMIT_WINDOW_MS` and `RW_RATE_LIMIT_MAX`
- Can be disabled in development with `RW_RATE_LIMIT_DISABLED=true`

### Input Validation

- **Project/Page IDs:** Max 64 characters, alphanumeric + `.` `-` `_` only
- **HTML Input:** Max 50,000 characters (configurable)
- **Class Lists:** Max 10,000 characters (configurable)
- **Class Count:** Max 1,500 resolved classes per page (configurable)
- **Request Body Size:** Max 100 KB (configurable)

### DoS Protection

- Request body size limits prevent memory exhaustion
- LRU cache prevents unbounded memory growth
- Rate limiting prevents abuse
- Class count limits prevent excessive compilation time

---

## Testing

Rich Wind uses **Vitest** for testing.

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

The test suite includes:
- Compile endpoint with HTML + class lists
- Cached page CSS retrieval
- Project-level CSS aggregation
- Cache miss handling (404 responses)
- Input validation (400 errors)

Tests use **strict assertions** and validate both success and error cases.

---

## Docker

### Build the Docker Image

```bash
docker build -t rich-wind .
```

### Run the Container

```bash
docker run -p 3001:3001 \
  -e RW_CACHE_MAX_PAGES=200 \
  -e RW_CACHE_TTL_MS=600000 \
  rich-wind
```

### Docker Image Details

- **Base Image:** `node:20-alpine` (lightweight, secure)
- **Working Directory:** `/app`
- **Exposed Port:** `3001`
- **Production-Only Dependencies:** Uses `npm ci --omit=dev`
- **Image Size:** ~150 MB (optimized)

---

## Deploy on Render

Rich Wind includes a **Render Blueprint** (`render.yaml`) that provisions **two free web services**:

1. **`rich-wind-core`** — API service
2. **`rich-wind-ui`** — SSR demo UI

Render automatically wires the UI to the API via the `RW_CORE_URL` environment variable.

### Deployment Steps

1. **Push this repository to GitHub**

2. **Create a new Blueprint in Render:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click **New** → **Blueprint**
   - Connect your GitHub repository
   - Point to the repository root (where `render.yaml` is located)

3. **Render will automatically:**
   - Detect `render.yaml`
   - Provision both services
   - Wire the UI to the API
   - Deploy both services

4. **Access your deployment:**
   - Open the `rich-wind-ui` service URL when the deploy finishes
   - The API will be available at the `rich-wind-core` service URL

### Important Notes

- **Free Tier:** Render free services **sleep after 15 minutes of inactivity**. The first request after sleep will be slower (~30-60 seconds).
- **Environment Variables:** Customize cache limits, rate limits, and size caps by editing `render.yaml` or updating env vars in the Render dashboard.
- **Auto-Deploy:** Both services auto-deploy on every push to `main` (configurable in `render.yaml`).

---

## Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/my-feature`
3. **Make your changes** (follow existing code style)
4. **Run tests:** `npm test`
5. **Commit your changes:** `git commit -m "Add my feature"`
6. **Push to your fork:** `git push origin feature/my-feature`
7. **Open a Pull Request**

### Guidelines

- Write clear, concise commit messages
- Add tests for new features
- Update documentation if needed
- Keep changes focused and atomic

---

## License

**MIT License**

Copyright (c) 2026 Farooq Alaulddin

See [LICENSE](LICENSE) for full details.
