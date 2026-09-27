# V1 Milestone — Execution Guide

Read this together with `README.md` (the plan) and `PROGRESS.md` (the tracker) before
doing anything. This file exists so an agent with no prior context can execute the
plan without guessing conventions or overstepping authority.

## Ground rules

- **Branching:** all work lands on `dev` (directly or via short-lived feature
  branches off `dev`). Never commit to `main`. `main` only moves via a reviewed PR
  from `dev` (an auto-PR workflow opens one when `dev` diverges).
- **Every code change ships with its tests.** Run `npm test` locally before any PR;
  the full suite must stay green (baseline: 277 tests / 19 files). CI can be
  triggered manually with: `gh workflow run test-before-merge.yml --ref dev`.
- **Docs snippets are tested.** Any example added to `docs/` that shows request or
  response shapes gets wired into `tests/docs-examples.test.js`.
- **Protect the core boundary.** V1 core owns deterministic validation, compilation,
  caching, suggestions, and resource protection. Do not add MCP, prompts, agent
  context, policy, draft/publish workflows, or other wrapper responsibilities.
- **Update `PROGRESS.md` in the same commit** that completes (or starts) an item.
  Use DONE with a date, IN PROGRESS, or BLOCKED with the reason.
- **No AI attribution in commits or PRs.** No `Co-Authored-By` trailers naming an AI,
  no "Generated with ..." footers. Commit messages end at the message body.
- **No emojis** in any file, commit message, or PR text.
- **This folder goes public with the repo at Phase 5.** Nothing under
  `v1_milestone/` — or any tracked file — may ever contain server IPs, hostnames,
  SSH key names/paths, tokens, or other infrastructure details.

## Decision authority

Proceed without asking on: implementation details the plan already specifies
(function/file placement, test structure, wording of docs), and any reversible
change on `dev`.

STOP and get explicit owner approval before:

- `git filter-repo` / any history rewrite / any force-push (Phase 5.2). Also
  requires: no open PRs at the time.
- Flipping the repo public, enabling Pages, changing branch protection (Phase 5.4-5.5).
- Running `release-npm.yml`, promoting dist-tags, or any npm publish (Phase 6.1, 6.4).
- Deleting a branch or tag.
- Any deviation from the plan's frozen contract decisions (the "Settled by evidence"
  section of README.md). New evidence may reopen a decision; present it first.
- Moving a responsibility assigned to wrappers in the Positioning or Out of V1
  sections into core.

## Owner-only / local-environment steps

Some steps cannot run from a fresh clone or a cloud environment:

- **VM deployment (Phase 6.2-6.3):** the deploy runbook (rsync release script,
  service restart) lives in the owner's untracked local notes (`.claude/CLAUDE.md`
  on the owner's machine — untracked after Phase 0.1) and requires the owner's SSH
  access. Prepare everything up to the deploy, then hand off.
- **GitHub settings (Phase 5.4-5.5):** repo visibility, Pages, branch protection,
  Dependabot need an admin-authenticated `gh` or the web UI — coordinate with the
  owner if not available.

## Hard sequencing constraints

- Phase 0.1 (untrack `.claude/CLAUDE.md`) lands before any other milestone commits.
- Within Phases 1+2: alias removal (1.3) and the limiter/auth error codes (2.1, 2.2)
  land before the contract freeze (1.7). The freeze PR is the LAST PR of Phases 1+2.
- Phases 1-4 are otherwise parallelizable; Phase 5 strictly precedes Phase 6.
- Phase 5.1-5.2 (gitleaks + history purge) strictly precede 5.5 (flip public).

## Evidence

`evidence/compile-bench.mjs` reproduces the measurements behind the settled
decisions (compile cost within input caps; brace-token rejection by
`candidatesToCss`). Run from the repo root after `npm install`:

    node v1_milestone/evidence/compile-bench.mjs

Use its scenarios as the starting point for the Phase 2.5 regression tests. If your
numbers differ by orders of magnitude from the recorded ones (~10ms worst case),
stop and re-evaluate the "no compile timeout" decision with the owner instead of
silently proceeding.
