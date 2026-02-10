# CSS Bundling Strategies (CMS Guide)

This guide lists **all common bundling options** for CMS systems that use Rich Wind as a runtime compiler. The core stays stateless; the CMS decides **when** to compile and **where** to store CSS.

---

## Quick Decision Guide

- **Small/medium sites** → Single project CSS.
- **Large sites** → Group bundles or Base + Delta.
- **Ultra‑fast per‑route** → Per‑page CSS.
- **Dynamic editors** → Runtime compile + cache.
- **Stable published content** → Prebuild on publish.

---

## Option 1: Single Project CSS (Recommended Default)
One shared CSS file for all pages in a project.

**How**
1. On page save → `POST /api/compile` (updates project cache).
2. On publish (or on interval) → `GET /api/projects/:projectId/css`.
3. Store and serve `project.css` from CDN/storage.

**Pros**: simple, great caching, easiest deploy  
**Cons**: larger bundle if pages are very diverse

---

## Option 2: Per‑Page CSS
Each page has its own CSS file.

**How**
- `POST /api/compile` returns `css` for the page.
- Store as `page-123.css` and serve only on that page.

**Pros**: smallest CSS per page  
**Cons**: many files, less cache reuse

---

## Option 3: Group Bundles (Templates/Sections)
Group pages by template or section and compile one CSS per group.

**How**
- Use different `projectId` values per group (e.g. `marketing`, `docs`, `app`).
- Compile each page into its group cache.
- Fetch `GET /api/projects/:projectId/css` per group.

**Pros**: good cache reuse, smaller than single file  
**Cons**: extra complexity, requires grouping strategy

---

## Option 4: Base + Delta (Advanced, Best for Large Sites)
Serve a shared **base.css** plus **page‑specific delta.css**.

**How it works**
1. Track per‑page class lists from `/api/compile` responses.
2. Maintain a global **class frequency** table.
3. Classes used ≥ threshold go into **base**.
4. Page delta = page classes minus base.
5. Compile and store:
   - `base.css`
   - `page-123.css`

**Pros**: small per‑page CSS + strong caching  
**Cons**: needs extra CMS logic (class counting)

**Pseudocode**
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

**How**
- On publish → compile and store CSS artifacts.
- At runtime, serve prebuilt files only.

**Pros**: no runtime cost  
**Cons**: slower publish pipeline, no live preview

---

## Option 6: Runtime Compile + Cache
Compile on demand and rely on in‑memory cache for speed.

**How**
- Every page request can call `/api/compile`.
- Cache provides fast repeat renders.

**Pros**: simple, great for live editors  
**Cons**: depends on runtime service uptime; cache resets on restart

---

## What Rich Wind Provides
- `POST /api/compile` → returns `{ css, classes, cached, hash }`
- `GET /api/projects/:projectId/css` → shared project CSS
- `POST /api/suggest` → autocomplete class suggestions

---

## Out of Scope (By Design)
- Long‑term artifact storage (S3/CDN)
- Multi‑tenant isolation or auth
- Cross‑node cache sync

Those belong in the CMS or a wrapper service.

