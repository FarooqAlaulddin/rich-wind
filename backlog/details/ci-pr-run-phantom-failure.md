---
slug: ci-pr-run-phantom-failure
status: next
added: 2026-11-06
touched: 2026-11-06
pr: null
tags: [ci]
blocked_on: null
---

# Phantom failure on the PR-triggered test run

## Context

On dev->main PRs opened or updated by `auto-pr-dev-to-main.yml`, the `pull_request` run of `test-before-merge.yml` often runs no jobs. It shows as `action_required` while the PR is open, then as `failure` ("This run likely failed because of a workflow file issue") after merge. The `push` run on the same commit runs every job and passes. Harmless today, but it puts a red X on the PR and could hide a real failure.

Seen on PR #63 (31a3514, action_required), #64 (887cb81), #66 (0033ebb) and #67 (d523b19). PR runs for other commits (aa9390b, 0f53093, d8dd296) succeeded.

Unverified lead: PRs created or pushed by the workflow's token may need approval before `pull_request` workflows run, and an unapproved run is closed out as failed on merge. Confirm from the run's event, actor and approval state before changing anything.

## Done when

- [ ] Root cause confirmed from run metadata
- [ ] dev->main PRs show one real, passing test run, or the redundant run is removed with the reason recorded

## Links

- `.github/workflows/test-before-merge.yml`, `.github/workflows/auto-pr-dev-to-main.yml`
- Runs 42212419803, 42203555859, 42201048525
