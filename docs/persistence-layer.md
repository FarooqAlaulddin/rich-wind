# Rich Wind Persistence Layer — Detailed Report

This document outlines a persistence layer package that plugs into the Rich Wind core. The design keeps developer setup under 5 minutes while supporting SQL and NoSQL databases.

## 1. Goals

### Primary goals
- Persist class usage and compiled bundles across restarts.
- Enable project-level intelligence (usage stats, promotion of utilities into base).
- Keep developer setup under 5 minutes.
- Support SQL + NoSQL with minimal configuration.

### Non-goals
- Authentication / tenant enforcement (belongs to the host app).
- CMS or multi-tenant management.

## 2. Package Shape

**New package:** `rich-wind-persist`

### Exports
```ts
import { createPersistence } from "rich-wind-persist";
```

### Usage (under 5 minutes)
```ts
const persist = await createPersistence({
  // optional: DATABASE_URL, defaults to ./rich-wind.db
});

const core = createRichWindCore({
  persistence: persist
});
```

### Environment auto-detect
- If `DATABASE_URL` is not set: SQLite file `./.rich-wind.db`
- If `DATABASE_URL` starts with:
  - `postgres://` -> Postgres adapter
  - `mongodb://` -> Mongo adapter
  - `sqlite://` -> SQLite adapter

## 3. Adapter Interface (Minimal)

```ts
interface PersistenceAdapter {
  init(): Promise<void>;
  close(): Promise<void>;

  recordPageClasses(projectId: string, pageId: string, classes: string[]): Promise<void>;
  getProjectUsage(projectId: string): Promise<Array<{ className: string; count: number }>>;

  saveBundle(projectId: string, type: "base"|"theme"|"utilities", css: string, hash: string): Promise<void>;
  getBundle(projectId: string, type: "base"|"theme"|"utilities"): Promise<{ css: string; hash: string } | null>;

  // optional: decay + cleanup
  pruneExpired?(projectId?: string): Promise<void>;
}
```

## 4. Schema Design

### SQL (Postgres/SQLite)
```sql
projects (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

pages (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  updated_at TIMESTAMP
)

class_usage (
  project_id TEXT,
  class_name TEXT,
  count INTEGER,
  last_seen TIMESTAMP,
  PRIMARY KEY (project_id, class_name)
)

page_classes (
  project_id TEXT,
  page_id TEXT,
  class_name TEXT,
  PRIMARY KEY (project_id, page_id, class_name)
)

bundles (
  project_id TEXT,
  type TEXT, -- base/theme/utilities
  css TEXT,
  hash TEXT,
  updated_at TIMESTAMP,
  PRIMARY KEY (project_id, type)
)
```

### MongoDB
Collections:
- `projects`
- `page_classes`
- `class_usage`
- `bundles`

Example document:
```json
{
  "projectId": "demo",
  "className": "bg-red-500",
  "count": 12,
  "lastSeen": "2026-02-12T00:00:00Z"
}
```

## 5. Bundling + Promotion Logic

### Key idea
- Each compile updates usage counts.
- If a class crosses a configured cutoff, it is promoted into `base`.

### Configurable cutoff
```ts
createPersistence({
  promoteThreshold: 20,
  decayDays: 30
});
```

### Base / Utilities split
- `base` = high-frequency classes
- `utilities` = per-page or low-frequency classes
- `theme` = variables for classes in use

## 6. Migrations (Auto by default)

### Strategy
- Migration files are shipped with the package.
- On `init()`, adapter checks `schema_version` and runs missing migrations.

### Optional CLI
```
npx rich-wind-persist migrate
```

## 7. Performance + Safety

- Writes are async (write-behind) so compile stays fast.
- Core memory cache remains the hot path.
- Persistence failures do not block compile.
- Optional event hooks for observability.

## 8. Setup Flow (Under 5 Minutes)

### SQLite default
```bash
npm i rich-wind-persist
node app.js
```
Creates `./.rich-wind.db`.

### Postgres
```bash
export DATABASE_URL="postgres://user:pass@localhost:5432/richwind"
npm i rich-wind-persist
node app.js
```

### Mongo
```bash
export DATABASE_URL="mongodb://user:pass@localhost:27017/richwind"
npm i rich-wind-persist
node app.js
```

## 9. Integration Points

```ts
const persist = await createPersistence();
const core = createRichWindCore({
  persistence: persist,
  onUsageUpdate: (projectId, stats) => {}
});
```

## 10. Extension Points

- Custom adapters for other databases.
- Custom promotion policy (override cutoff logic).
- Analytics hooks for dashboards.

## 11. Why this design works

- Zero-config setup for developers.
- SQL + NoSQL support without heavy ORM requirements.
- Core stays clean and deterministic.
- Scales from local dev to production.
