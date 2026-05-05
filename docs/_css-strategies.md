# CSS Bundling Strategies

A guide to bundling options for CMS systems that use Rich Wind as a runtime compiler. The core stays stateless — the CMS decides **when** to compile and **where** to store CSS.

## Quick Decision Guide

| Scenario | Recommended strategy |
| --- | --- |
| Small / medium sites | Single project CSS |
| Large sites | Group bundles or Base + Delta |
| Ultra-fast per-route | Per-page CSS |
| Dynamic editors or AI previews | Runtime compile + cache |
| Stable published content | Prebuild on publish |

---

## Option 1: Single Project CSS

> Recommended default.

One shared CSS file for all pages in a project.

**How it works:**

1. On page save — `POST /api/compile` (updates project cache).
2. On publish (or on interval) — `GET /api/projects/:projectId/css`.
3. Store and serve `project.css` from CDN/storage.

**Pros:** Simple, great caching, easiest deploy.
**Cons:** Larger bundle if pages are very diverse.

---

## Option 2: Per-Page CSS

Each page has its own CSS file.

**How it works:**

- `POST /api/compile` returns `css` for the page.
- Store as `page-123.css` and serve only on that page.

**Pros:** Smallest CSS per page.
**Cons:** Many files, less cache reuse.

---

## Option 3: Group Bundles

Group pages by template or section and compile one CSS per group.

**How it works:**

- Use different `projectId` values per group (e.g. `marketing`, `docs`, `app`).
- Compile each page into its group cache.
- Fetch `GET /api/projects/:projectId/css` per group.

**Pros:** Good cache reuse, smaller than single file.
**Cons:** Extra complexity, requires grouping strategy.

---

## Option 4: Base + Delta

Serve a shared `base.css` plus page-specific `delta.css`. Best for large sites.

**How it works:**

1. Track per-page class lists from `/api/compile` responses.
2. Maintain a global class frequency table.
3. Classes used above a threshold go into `base`.
4. Page delta = page classes minus base classes.
5. Compile and store both files.

**Pros:** Small per-page CSS + strong caching.
**Cons:** Needs extra CMS logic (class counting).

```js
const result = await compilePage(pageId, html, classes);
updateClassCounts(pageId, result.classes);

const base = getClassesWhereCountAtLeast(THRESHOLD);
const delta = result.classes.filter(c => !base.has(c));

const baseCss = await compileClasses(base);
const deltaCss = await compileClasses(delta);

storeCss("base.css", baseCss);
storeCss(`page-${pageId}.css`, deltaCss);
```

---

## Option 5: Prebuild on Publish

Only compile when content is published.

- On publish — compile and store CSS artifacts.
- At runtime, serve prebuilt files only.

**Pros:** No runtime cost.
**Cons:** Slower publish pipeline, no live preview.

---

## Option 6: Runtime Compile + Cache

Compile on demand and rely on in-memory cache for speed.

- Every page request calls `/api/compile`.
- Cache provides fast repeat renders.

**Pros:** Simple, great for live editors.
**Cons:** Depends on runtime service uptime; cache resets on restart.

This is also the fastest loop for AI-generated previews: the agent or editor can revise HTML/classes, the host can compile the new class set immediately, and publishing can still store static CSS later.

---

## What Rich Wind Provides

| Endpoint | Returns |
| --- | --- |
| `POST /api/compile` | `{ css, classes, cached, hash }` |
| `GET /api/projects/:projectId/css` | Shared project CSS |
| `POST /api/suggest` | Autocomplete class suggestions |

## Out of Scope

The following belong in the CMS or a wrapper service:

- Long-term artifact storage (S3, CDN)
- Multi-tenant isolation or auth
- Cross-node cache sync
