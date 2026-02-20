# FAQ

Scope labels:

- `[Core]` applies to Rich Wind core behavior.
- `[Plugin: Auto-Promote]` applies only when the auto-promote plugin is enabled.

## [Core] Do I need to store `base.css` and `theme.css` files in my host application?

No. In the standard Rich Wind setup, your host application does not need to generate or manage static `base.css`/`theme.css` files on disk.

Rich Wind compiles and serves the CSS bundles at runtime (`base`, `theme`, `utilities`, or `full`) through its API endpoints. It recalculates only when needed (for example, when classes change or cache entries expire), and otherwise serves cached artifacts.

If you need persistence across process restarts or across multiple replicas, configure a shared `cacheStore`. Without a `cacheStore`, caching is in-memory for the current process lifetime.

## [Core] What should each page load: `full`, or layered bundles?

For multi-page editors and site builders, use layered bundles:

- `base` (shared)
- `theme` (shared)
- `utilities` (per page)

This avoids repeating shared CSS on every page and keeps per-page payloads focused on that page's utilities.

## [Core] Should per-page CSS contain `base` and `theme`?

No. Per-page CSS should be utilities-only. Shared layers (`base` and `theme`) should be loaded once and reused across pages.

## [Plugin: Auto-Promote] What is the promoted shared bundle?

The promoted shared bundle contains utility classes that crossed the promotion threshold (used across enough pages). Those classes are removed from per-page utilities and moved to a shared layer.

This behavior is plugin-driven and not part of core unless the plugin is enabled.

## [Plugin: Auto-Promote] When a class is promoted, what happens to per-page utilities?

After promotion, the class should no longer appear in per-page utilities CSS for affected pages. It should be emitted from the shared promoted layer instead.

## [Plugin: Auto-Promote] Do I need a periodic cleanup script to remove stale promoted classes?

Usually no. Promotion/demotion should be event-driven during compile updates (including page edits and deletions).

A scheduled reconcile job can still be useful as a safety net (for example, daily/weekly) to repair drift from migrations or manual data edits.

## [Core] What should the host application persist?

Persist your source content and identifiers (for example `projectId`, `pageId`, HTML/content state, and class inputs). Do not treat generated CSS files as the source of truth.

## [Core] When does Rich Wind recompute CSS?

Rich Wind recomputes when inputs change or cache is cold/expired. Otherwise it serves cached artifacts. On process restart, memory cache resets unless a shared `cacheStore` is configured.
