# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
