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
- [x] 0.3 OWNER DECISION: `parked-demos` — DONE 2026-09-26: replace the branch with the
  annotated tag `archive/parked-demos` (same commit 4012000; the branch had no commits of
  its own and is an ancestor of `main`; a tag survives the Phase 5.2 rewrite)
- [x] 0.4a `npm test` baseline — DONE 2026-08-18 (277/277, 19 files)
- [x] 0.4b `npm run test:pack` + `npm audit` snapshot + CI green on dev — DONE 2026-09-26:
  pack smoke passed; audit snapshot in `evidence/npm-audit-2026-09-26.txt` (8 advisories:
  1 critical, 3 high, 2 moderate, 2 low; all fixable via `npm audit fix`; production
  dependencies only: `qs` moderate and `body-parser` low, both via express, the rest are
  test/build tooling); CI green on the
  dev head 0cb1c97 (PR #44 checks)
- [x] 0.5 Docs-vs-code divergence inventory — DONE 2026-08-18 (Appendix A)
- [x] 0.6 GitHub milestone "V1" + issues — DONE 2026-09-26: milestone #1, issues #45-#73
  (one per open item in Phases 1-6; 5.3 has none, only the owner's branch deletion remains)

## Phase 1 — Machine-readable API contract

- [ ] 1.1 `rejected` field on compile (explicit classes input only) (#45)
- [ ] 1.2 Central error helper + closed code enum + plugin guard mappings +
  openapi error schema (#46)
- [ ] 1.3 Alias removal PR (project_id/page_id/mode/max/count + bundle value aliases) (#47)
- [ ] 1.4 CSS GET miss -> 404 NOT_FOUND (#48)
- [ ] 1.5 Plugin contract truth-up (guard hook, request hooks docs, ctx.compile shape) (#49)
- [ ] 1.6 ajv contract validation in tests/contracts.test.js (#50)
- [ ] 1.7 Contract freeze PR (last of Phases 1+2) + full 1.x compatibility
  policy (#51)

## Phase 2 — Core hardening

- [ ] 2.1 Bounded in-core rate limiter (two buckets 120/600 per min; delete
  plugins/rate-limit) (#52)
- [ ] 2.2 Optional RW_API_KEY service access on the three POST endpoints (#53)
- [ ] 2.3 Middleware placement (post-CORS, pre-body-parse, before runGuard) (#54)
- [ ] 2.4 RW_MAX_CONCURRENT_COMPILES + immediate 503 SERVER_BUSY shed (#55)
- [ ] 2.5 UNSAFE_CLASS_CHAR_RE `{ }` + brace-bomb and prose-noise regression tests (#56)
- [ ] 2.6 Threat model section in runtime-spec; security-headers audit (#57)

## Phase 3 — Packaging

- [ ] 3.1 files + explicit exports for auto-promote and cache-store-fs (#58)
- [ ] 3.2 Remove Dockerfile (#59)
- [ ] 3.3 pack-smoke imports exported plugin subpaths from tarball (#60)
- [ ] 3.4 index.d.ts aligned with post-Phase-1/2 reality (#61)

## Phase 4 — Docs repositioning

- [ ] 4.1 README + docs/index.md lead with AI-guided UI and preserve the
  core/wrapper boundary (#62)
- [ ] 4.2 Agent quickstart (explicit classes + rejected feedback loop) +
  docs-examples test (#63)
- [ ] 4.3 Remaining divergence doc fixes (Appendix A items 9-12, 6) (#64)
- [ ] 4.4 api-reference: error enum, rejected, auth, rate limits; Pages render check (#65)

## Phase 5 — Go-public gate

- [ ] 5.1 gitleaks full history, all branches (#66)
- [ ] 5.2 git filter-repo purge + force-push + fresh clone (#67)
- [ ] 5.3 Execute parked-demos decision — IN PROGRESS: tag `archive/parked-demos` pushed
  2026-09-26; the owner deletes the `parked-demos` branch (remote and local)
- [ ] 5.4 SECURITY.md, CONTRIBUTING.md, templates, branch protection, Dependabot (#68)
  - Note 2026-09-26: branch protection and rulesets return HTTP 403 while the repo is
    private on GitHub Free, so protection can only be applied after 5.5 (or on a paid
    plan). `release-npm.yml` pushes the version commit and tag straight to `main`
    (`git push origin HEAD:main --follow-tags`), so a require-PR rule on `main` must
    leave that push possible (or the release job must switch to opening a PR).
- [ ] 5.5 Flip public + enable Pages + repo metadata (#69)

## Phase 6 — Release and go-live

- [ ] 6.1 dev -> main; release-npm.yml -> 1.0.0-rc.1 on dist-tag next (#70)
- [ ] 6.2 Deploy rc to VM (owner picks the moment) (#71)
- [ ] 6.3 Soak + test:load (#72)
- [ ] 6.4 Promote 1.0.0 to latest; CHANGELOG; GitHub Release (#73)
