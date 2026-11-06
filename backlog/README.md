# Rich Wind Backlog

Engineering work worth remembering that is not part of the current change. Not for product ideas or research notes.

## Format

Each item is one line here, with full context in `details/<slug>.md`.

```md
- [ ] **<slug>** _(SEVERITY, tag)_ - one-sentence summary · added YYYY-MM-DD · touched YYYY-MM-DD · [details](details/<slug>.md)
```

States: `[ ]` open, `[x]` done (add the PR), `[-]` dropped. Detail files carry frontmatter (`slug`, `status`, `added`, `touched`, `pr`, `tags`) and the sections Context, Done when, Links.

## Rules

- `Now` cap 5, `Next` cap 10, `Later` cap 20. Prune before adding to a full bucket.
- Update `touched` on every revisit. When work merges, mark it done with the PR and describe what shipped.

## Now

## Next

- [ ] **auto-promote-check-coverage** _(MEDIUM, diagnostics)_ - host-run check that every page's classes are in its stored CSS or the shared bundle, flagging pages that would render unstyled · added 2026-11-06 · touched 2026-11-06 · [details](details/auto-promote-check-coverage.md)
- [ ] **auto-promote-theme-css-docs** _(LOW, docs)_ - say that the promoted bundle is utilities only, so pages must also load the project theme CSS · added 2026-11-06 · touched 2026-11-06 · [details](details/auto-promote-theme-css-docs.md)
- [ ] **ci-pr-run-phantom-failure** _(LOW, ci)_ - the pull_request run of Test Before Merge on dev->main PRs ends as failure or action_required with no jobs, while the push run passes · added 2026-11-06 · touched 2026-11-06 · [details](details/ci-pr-run-phantom-failure.md)

## Later

## Done
