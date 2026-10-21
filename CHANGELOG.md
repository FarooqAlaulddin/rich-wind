# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project themes. A `resolveTheme({ projectId })` plugin hook returns a project's design tokens as CSS custom-property declarations, compiled as an `@theme` block after Tailwind's own, so `--color-*: initial; --color-ink: #111;` makes `bg-ink` a class and `bg-red-500` a rejection for that project alone. Every route that builds or serves a project's CSS resolves the theme first; the hook fails closed, never falls back to stock, and is never deferred. A theme holds declarations only and anything else is `500 INVALID_THEME`. The theme is part of the page hash and the ETag; stock hashes are unchanged. Artifacts carry `themeHash`, and one built for another theme is never served. `scanHtml`, `exportCss` and `exportSet` take a `theme` option, and `ctx.validateClasses(classes, { projectId })` validates against the project's theme. `cache-store-fs` persists `themeHash`.

- `parseTheme(theme)` checks a theme as core will and returns its normalized `{ text, hash }`, or throws `INVALID_THEME`, so a host or plugin can test one before serving it.

- `rich-wind/plugins/design-tokens`: `createDesignTokensPlugin({ tokensFor })` answers `resolveTheme` from a project's Tailwind v4 token file. A namespace the file declares replaces Tailwind's (spacing excepted, whose reset would switch off the numeric scale); a declaration core would refuse is dropped and reported by `readTokens` rather than failing the project. `plainCss` turns the file into CSS a page can load without Tailwind.

- The Lexical demo has a **Themes** view in the Rich Wind strip. It compiles the current page under Tailwind's stock theme and two token files through the design-tokens plugin, previews each, and lists what each rejects. The **Brand card** example is written in tokens to show it.

### Fixed

- The plugin loader returns only plugins. A `plugins/` directory whose factory returns no named plugin (`cache-store-fs`, a store rather than a plugin) is skipped with a warning instead of being registered unnamed, and a test loads every plugin directory with no arguments as the loader does.

## [1.0.0-rc.3] - 2026-10-19

### Fixed

- `rejected` now lists a class exactly when the CSS has no rule for it. Before, any class containing `( ) { } ; ,` was reported as rejected while its CSS was emitted, so the CSS-variable forms (`text-(--ink)`, `p-(--space-3)`, `text-(length:--text-body)`) and arbitrary values with commas (`grid-cols-[repeat(2,minmax(0,1fr))]`) were reported as errors that were not errors. The character ban guarded `@source inline("...")` directives that repeated every class into the compiler's input CSS; classes now reach Tailwind only as build candidates, which it takes literally, so the directives, the ban and the brace-expansion path they opened are all gone. One test holds the rule across `compile`, `POST /api/compile`, `exportCss`, `exportSet` and `scanHtml`.

- A writer replica now rewrites the project CSS it stored for readers when a compile changes the project's classes, or once half the project cache TTL has passed. Before, readers served stale project CSS after new classes were compiled and returned 404 once the stored copy expired.

## [1.0.0-rc.2] - 2026-10-03

### Changed

- Published as `@thinkly/rich-wind` under the thinkly npm org. The unscoped `rich-wind` package was unpublished.
- Test files are no longer included in the package; the pack smoke check fails if one is.

## [1.0.0-rc.1] - 2026-10-03

First release candidate (published as `rich-wind`, since unpublished).

### Added

- `createCore()` with `core.handler` (Node-style hosts), `core.fetch` (Fetch-style hosts) and direct functions (`compile`, page and project CSS, suggestions).
- Compiles explicit class lists or the class attributes of HTML against Tailwind's default design system; unknown classes come back in `rejected`.
- Page and project CSS caches with TTLs, an optional shared cache store, and writer/reader node roles for one writer with many readers.
- Plugin API with hooks, routes and storage; the built-in auto-promote plugin.
- Bundled server (`npm start`), a compile concurrency cap that sheds with 503 `SERVER_BUSY`, and `RW_*` configuration.
