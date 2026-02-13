# Persistence Layer

Design report for a persistence layer package that plugs into the Rich Wind core. Setup takes under 5 minutes and supports both SQL and NoSQL databases.

## Goals

**In scope:**

- Persist class usage and compiled bundles across restarts.
- Enable project-level intelligence (usage stats, promotion of utilities into base).
- Keep developer setup under 5 minutes.
- Support SQL + NoSQL with minimal configuration.

**Out of scope:**

- Authentication / tenant enforcement (belongs to the host app).
- CMS or multi-tenant management.

## Package Shape

**New package:** `rich-wind-persist`

### Exports
```ts
import { createPersistence } from "rich-wind-persist";
```

### Quick setup
```ts
const persist = await createPersistence({
  // optional: DATABASE_URL, defaults to ./rich-wind.db
});

const core = createCore({
  persistence: persist
});
```

### Auto-detection
- If `DATABASE_URL` is not set: SQLite file `./.rich-wind.db`
- If `DATABASE_URL` starts with:
  - `postgres://` -> Postgres adapter
  - `mongodb://` -> Mongo adapter
  - `sqlite://` -> SQLite adapter

## Adapter Interface

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

## Schema Design

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

## Bundling + Promotion Logic

Each compile updates usage counts. When a class crosses a configurable cutoff, it is promoted into `base`.
```ts
createPersistence({
  promoteThreshold: 20,
  decayDays: 30
});
```

**Bundle types:**

| Bundle | Contains |
| --- | --- |
| `base` | High-frequency classes |
| `utilities` | Per-page or low-frequency classes |
| `theme` | CSS variables for classes in use |

## Migrations

Migration files ship with the package. On `init()`, the adapter checks `schema_version` and runs missing migrations automatically.
```
npx rich-wind-persist migrate
```

## Performance + Safety

- Writes are async (write-behind) so compilation stays fast.
- The core memory cache remains the hot path.
- Persistence failures never block compilation.
- Optional event hooks for observability.

## Setup Examples

### SQLite (default)
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

## Integration

```ts
const persist = await createPersistence();
const core = createCore({
  persistence: persist,
  onUsageUpdate: (projectId, stats) => {}
});
```

## Extension Points

- Custom adapters for other databases.
- Custom promotion policy (override cutoff logic).
- Analytics hooks for dashboards.

## Design Rationale

- Zero-config setup for developers.
- SQL + NoSQL support without heavy ORM requirements.
- Core stays clean and deterministic.
- Scales from local dev to production.
