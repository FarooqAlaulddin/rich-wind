---
slug: auto-promote-check-coverage
status: next
added: 2026-11-06
touched: 2026-11-06
pr: null
tags: [auto-promote, diagnostics]
blocked_on: null
---

# Auto-promote coverage check

## Context

Auto-promote strips shared classes from each page and serves them in one bundle. A page renders correctly only if every class it uses is in its own stored CSS or in the bundle. The known rare gaps (docs/plugin-system.md, Auto-Promote, "Known gaps") break that silently. Surfaced while fixing #62 (PR #63) and the reader fix (rc.6). Reviewed by Codex and Fable on 2026-11-06.

Proposed shape: `checkCoverage(core, { projectId, pageId, classes })`, exported by the plugin and run by the host periodically or after deploys.

- Compare class lists, not CSS text: stored artifact `classes` plus the bundle's `served` must cover the page's validated classes. CSS-text matching misreads variants, arbitrary values and escaped selectors.
- Filter rejected classes first (`ctx.validateClasses` for the project theme), or `group`, `prose` and CMS classes show as false flags.
- Check through the URL users hit, per reader node, or stale readers are missed.
- Return evidence per missing class: in artifact classes, in plugin strips, promoted, served, in the fetched bundle; plus page source and bundle ETag. That separates "bundle shrank", "host never recompiled" and "stale reader".
- Log before repairing (recompile through a writer), count repairs per cause, throttle sweeps to avoid `503 SERVER_BUSY`.

Catches: a crash in the 250 ms state save, stale readers, failed or slow store writes, future coverage bugs. Misses: the invalidate-vs-in-flight-write race (those pages are ones the host deleted), missing theme CSS (rules present, variables absent), breakage between checks, pages the host does not list.

Open decision: flag only, or flag and repair.

## Done when

- [ ] Helper exported with types in `services/index.d.ts` and documented in `docs/plugin-system.md`
- [ ] Tests reproduce each detectable gap and show it flagged with the right evidence
- [ ] No false flags for rejected classes, variants or arbitrary values

## Links

- Issue #62, PR #63, rc.5 and rc.6 releases
- `plugins/auto-promote/index.js`
