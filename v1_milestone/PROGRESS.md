# V1 Milestone — Progress Tracker

Status values: DONE, IN PROGRESS, BLOCKED (with reason), or unchecked.
Update this file in the same commit that completes or starts an item.
Plan: `README.md`. Conventions and stop-for-owner rules: `EXECUTION.md`.

## Phase 0 — Cleanup and baseline

- [x] 0.1 Untrack `.claude/CLAUDE.md`; add `.claude/` to `.gitignore` — DONE 2026-09-26
  (history purge remains Phase 5.2)
- [ ] 0.2 Delete stray `installed-versions.txt` — verified redundant 2026-09-26 (164 of
  165 entries match the two lockfiles; the other is the demo workspace itself).
  Untracked, so nothing to commit; owner deletes it locally.
- [ ] 0.3 OWNER DECISION: `parked-demos` — delete vs scrub
- [x] 0.4a `npm test` baseline — DONE 2026-08-18 (277/277, 19 files)
- [ ] 0.4b `npm run test:pack` + `npm audit` snapshot + CI green on dev
- [x] 0.5 Docs-vs-code divergence inventory — DONE 2026-08-18 (Appendix A)
- [ ] 0.6 GitHub milestone "V1" + issues

## Phase 1 — Machine-readable API contract

- [ ] 1.1 `rejected` field on compile (explicit classes input only)
- [ ] 1.2 Central error helper + closed code enum + plugin guard mappings +
  openapi error schema
- [ ] 1.3 Alias removal PR (project_id/page_id/mode/max/count + bundle value aliases)
- [ ] 1.4 CSS GET miss -> 404 NOT_FOUND
- [ ] 1.5 Plugin contract truth-up (guard hook, request hooks docs, ctx.compile shape)
- [ ] 1.6 ajv contract validation in tests/contracts.test.js
- [ ] 1.7 Contract freeze PR (last of Phases 1+2) + full 1.x compatibility
  policy

## Phase 2 — Core hardening

- [ ] 2.1 Bounded in-core rate limiter (two buckets 120/600 per min; delete
  plugins/rate-limit)
- [ ] 2.2 Optional RW_API_KEY service access on the three POST endpoints
- [ ] 2.3 Middleware placement (post-CORS, pre-body-parse, before runGuard)
- [ ] 2.4 RW_MAX_CONCURRENT_COMPILES + immediate 503 SERVER_BUSY shed
- [ ] 2.5 UNSAFE_CLASS_CHAR_RE `{ }` + brace-bomb and prose-noise regression tests
- [ ] 2.6 Threat model section in runtime-spec; security-headers audit

## Phase 3 — Packaging

- [ ] 3.1 files + explicit exports for auto-promote and cache-store-fs
- [ ] 3.2 Remove Dockerfile
- [ ] 3.3 pack-smoke imports exported plugin subpaths from tarball
- [ ] 3.4 index.d.ts aligned with post-Phase-1/2 reality

## Phase 4 — Docs repositioning

- [ ] 4.1 README + docs/index.md lead with AI-guided UI and preserve the
  core/wrapper boundary
- [ ] 4.2 Agent quickstart (explicit classes + rejected feedback loop) +
  docs-examples test
- [ ] 4.3 Remaining divergence doc fixes (Appendix A items 9-12, 6)
- [ ] 4.4 api-reference: error enum, rejected, auth, rate limits; Pages render check

## Phase 5 — Go-public gate

- [ ] 5.1 gitleaks full history, all branches
- [ ] 5.2 git filter-repo purge + force-push + fresh clone
- [ ] 5.3 Execute parked-demos decision
- [ ] 5.4 SECURITY.md, CONTRIBUTING.md, templates, branch protection, Dependabot
  - Note 2026-09-26: branch protection and rulesets return HTTP 403 while the repo is
    private on GitHub Free, so protection can only be applied after 5.5 (or on a paid
    plan). `release-npm.yml` pushes the version commit and tag straight to `main`
    (`git push origin HEAD:main --follow-tags`), so a require-PR rule on `main` must
    leave that push possible (or the release job must switch to opening a PR).
- [ ] 5.5 Flip public + enable Pages + repo metadata

## Phase 6 — Release and go-live

- [ ] 6.1 dev -> main; release-npm.yml -> 1.0.0-rc.1 on dist-tag next
- [ ] 6.2 Deploy rc to VM (owner picks the moment)
- [ ] 6.3 Soak + test:load
- [ ] 6.4 Promote 1.0.0 to latest; CHANGELOG; GitHub Release
