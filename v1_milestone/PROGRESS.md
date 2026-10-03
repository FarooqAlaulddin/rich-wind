# V1 Milestone — Progress Tracker

Status values: DONE, IN PROGRESS, BLOCKED (with reason), DROPPED (with reason), MOVED
(to the item that absorbed it), or unchecked.
Update this file in the same commit that completes or starts an item.
Plan: `README.md`. Conventions and stop-for-owner rules: `EXECUTION.md`.
Plan revised 2026-09-27 (gap review, `README.md` Appendix B): new items 2.7, 3.5-3.7,
5.0, 6.0. Revised again 2026-09-27 (owner): library-first positioning; no in-core rate
limiter or API key (2.1 rewritten, 2.2 and 2.3 dropped). Revised a third time
2026-09-27 (owner): core drops Express before the freeze; new 1.8 native transport
absorbs 2.7 (`README.md` Appendix C). Tightened 2026-09-30 (owner): the 1.8 contract
details, 1.8 as two PRs, and the order around 1.8.

## Phase 0 — Cleanup and baseline

- [x] 0.1 Untrack `.claude/CLAUDE.md`; add `.claude/` to `.gitignore` — DONE 2026-09-26
  (history purge remains Phase 5.2)
- [x] 0.2 Delete stray `installed-versions.txt` — DONE 2026-09-26 (verified redundant: 164
  of 165 entries matched the two lockfiles; the other was the demo workspace itself)
- [x] 0.3 OWNER DECISION: `parked-demos` — DONE 2026-09-26: replace the branch with the
  annotated tag `archive/parked-demos` (same commit 82d1da1; the branch had no commits of
  its own and is an ancestor of `main`; a tag survives the Phase 5.2 rewrite)
- [x] 0.4a `npm test` baseline — DONE 2026-08-18 (277/277, 19 files)
- [x] 0.4b `npm run test:pack` + `npm audit` snapshot + CI green on dev — DONE 2026-09-26:
  pack smoke passed; audit snapshot in `evidence/npm-audit-2026-09-26.txt` (8 advisories:
  1 critical, 3 high, 2 moderate, 2 low; all fixable via `npm audit fix`; production
  dependencies only: `qs` moderate and `body-parser` low, both via express, the rest are
  test/build tooling); CI green on the
  dev head 7133896 (PR #44 checks, now in rich-wind-archive)
- [x] 0.5 Docs-vs-code divergence inventory — DONE 2026-08-18 (Appendix A)
- [x] 0.6 GitHub milestone "V1" + issues — DONE 2026-09-26: milestone #1, issues #2-#30
  (one per open item in Phases 1-6; 5.3 has none, only the owner's branch deletion remains)

## Phase 1 — Machine-readable API contract

- [x] 1.1 `rejected` field on compile (explicit classes input only) — DONE 2026-09-30 (#2)
- [x] 1.2 Central error helper + closed code enum (INVALID_BODY and
  UNSUPPORTED_MEDIA_TYPE added; no HTML error pages) + plugin guard mappings +
  openapi error schema — DONE 2026-09-30 (#3)
- [x] 1.3 Alias removal PR (project_id/page_id/mode/max/count + bundle value aliases) — DONE 2026-09-30 (#4)
- [x] 1.4 CSS GET miss -> 404 NOT_FOUND — DONE 2026-09-30 (#5)
- [x] 1.5 Plugin contract truth-up (guard hook, request hooks docs; ctx.compile
  shape with the first 1.8 PR, addRoute contract with the second) — DONE 2026-10-01
  2026-09-30: guard types and HTTP-only request-hook reality documented. 2026-10-01:
  ctx.compile contract documented with 1.8a (result shape, RichWindError, chain depth
  500 INTERNAL); neutral addRoute contract (request in, { status, headers, body } out)
  documented and typed with 1.8b (#6)
- [x] 1.6 ajv contract validation in tests/contracts.test.js, envelope cases
  included; after 1.2 and 1.3, before 1.8 — DONE 2026-09-30 (#7)
- [x] 1.7 Contract freeze PR (last of Phases 1+2) + full 1.x compatibility
  policy — DONE 2026-10-01
  2026-10-01: "Compatibility Policy (1.x)" in docs/api-reference.md (field/status/
  error-code stability, optional fields may be added, embedding contract, frozen error
  enum with new codes reserved for 2.0, CSS and `rejected` track Tailwind 4.x, narrowing
  the tailwindcss range if `__unstable__loadDesignSystem`/`candidatesToCss` break);
  linked from README and docs/index.md; openapi info.version 1.0.0 (#8)
- [x] 1.8 Native transport, two PRs: (a) functions + RichWindError, ctx.compile
  shares core.compile; (b) drop Express, core.handler, core.fetch with basePath,
  neutral plugin routes, client identity via proxy-addr (absorbs 2.7) — DONE 2026-10-01
  2026-10-01: (a) DONE: core.compile/getCss/getProjectCss/invalidate/suggest own input
  validation and throw RichWindError; the Express routes call them; ctx.compile shares
  core.compile (chain depth is 500 INTERNAL); auto-promote uses try/catch; GET /api/css,
  GET /api/projects/:projectId/css, /api/invalidate and /api/suggest 400s now carry
  MISSING_INPUT/INVALID_ID instead of the INVALID_BODY fallback; tests in
  core-functions.test.js. (b) DONE: createCore returns { handler, fetch, ... } (no
  `app`); one internal router behind core.handler (node:http, Express mount via
  req.url) and core.fetch (Web Request/Response, basePath, ip option); exact
  case-sensitive paths, HEAD on GET routes, envelope 404 for unknown paths/methods,
  INVALID_ID on bad percent-encoding, explicit loader ETags, no weak JSON ETags; guard
  before body read, 415/413 (Connection: close)/400 body rules incl. chunked cap,
  length mismatch and fatal UTF-8; 500 INTERNAL + onError for unexpected errors (fixes
  plugin route exceptions surfacing as 400 INVALID_BODY); neutral plugin routes, both
  auto-promote routes ported; trustProxy via proxy-addr (boolean, hop count, subnet
  list; RW_TRUST_PROXY=1 is now hop count 1), host-resolved req.ip used when unset;
  express moved to devDependencies, proxy-addr added; index.d.ts no longer imports
  express; tests migrated to http.createServer(core.handler), new
  tests/transport.test.js; lexical-demo dev server mounts core.handler in an Express
  host. Deploy note for 6.0: an out-of-repo startup script that uses `core.app` breaks
  on the first post-1.8 release, and the VM's RW_TRUST_PROXY=1 now means one hop (#37)

## Phase 2 — Core hardening

- [x] 2.1 Embedding contract: drop the rate-limit promise and plugins/rate-limit;
  mount-under-prefix tests; host-side recipe; after 1.8 — DONE 2026-10-01
  2026-10-01: plugins/rate-limit deleted; rateLimit* removed from index.d.ts, docs,
  tests, scripts and the demo dev server; 429 documented as plugin-guard only;
  runtime-spec "Including Rich Wind in an App" (Express mount behind middleware,
  node:http prefix strip, Next.js core.fetch with basePath, Fastify library calls,
  standalone behind nginx with the 120/600 per-minute zones; plugin routes own their
  access policy); tests/embedding.test.js (#9)
- [x] 2.2 Optional RW_API_KEY on the POST endpoints — DROPPED 2026-09-27 (owner:
  access control belongs to the host app or the proxy in front) (#10)
- [x] 2.3 Middleware placement for the limiter and key — DROPPED 2026-09-27 (neither
  is built) (#11)
- [x] 2.4 RW_MAX_CONCURRENT_COMPILES + immediate 503 SERVER_BUSY shed; after 1.8
  — DONE 2026-10-01
  2026-10-01: maxConcurrentCompiles (default 8, min 1), no wait queue; slot taken in
  core.compile after input validation, so direct calls are bounded; 503 SERVER_BUSY
  with Retry-After: 1 over HTTP and plugin routes; ctx.compile from an awaited hook
  reuses the parent slot, from a deferred hook or plugin route takes its own and can be
  shed (auto-promote's try/catch skips the promotion); tests/concurrency.test.js;
  config tables, threat model, openapi 503 and index.d.ts updated (#12)
- [x] 2.5 UNSAFE_CLASS_CHAR_RE `{ }` + brace-bomb and prose-noise regression tests — DONE 2026-09-30 (#13)
- [x] 2.6 Threat model in runtime-spec (core-enforced vs host-enforced);
  security-headers audit — DONE 2026-09-30 (#14)
- [x] 2.7 Client identity behind proxies — MOVED 2026-09-27 into 1.8 (native
  transport) (#31)

## Phase 3 — Packaging

- [x] 3.1 files + explicit exports for auto-promote and cache-store-fs — DONE 2026-09-30 (#15)
- [x] 3.2 Remove Dockerfile — DONE 2026-09-30 (#16)
- [x] 3.3 pack-smoke imports exported plugin subpaths from tarball — DONE 2026-09-30 (#17)
- [x] 3.4 index.d.ts aligned with post-Phase-1/2 reality — DONE 2026-10-01
  2026-10-01: rateLimit* gone, trustProxy boolean/hop count/list, guard typed,
  ctx.compile shape, aliases removed, handler/fetch/basePath, five functions and
  RichWindError, plugin route request/response, maxConcurrentCompiles, no express
  import; verified with `tsc --noEmit --strict` against a usage file including
  @ts-expect-error checks for rateLimitMax, core.app and snake_case aliases (#18)
- [x] 3.5 Dependency hygiene: npm audit fix, delete stale lexical-demo lockfile — DONE 2026-10-01
  2026-09-30: stale lockfile removed; npm audit fix currently fails in npm's dependency-tree
  resolver (`Cannot read properties of null (reading 'edgesOut')`). 2026-10-01: npm 10.9.8
  still crashes; `npx npm@11 audit fix` (no --force) succeeds. Lockfile stays v3, Tailwind
  stays 4.1.18, vite deduped to 8.3.1, vitest 4.1.11, all within declared ranges. `npm ci`
  with npm 10 installs it cleanly; npm audit and npm audit --omit=dev both report 0
  (evidence/npm-audit-2026-10-01.txt); full tests, pack smoke and demo build pass (#32)
- [x] 3.6 Supported Node versions: engines >=22, CI matrix 22/24, lockfile-free job — DONE 2026-09-30 (#33)
- [ ] 3.7 Release pipeline readiness: version input, npm credential, back-merge — IN PROGRESS
  2026-10-03: release-npm.yml no longer pushes to main: the version is bumped by a pull
  request, the `version` input must equal package.json, the tag and GitHub release are
  created on the tested commit, and the back-merge step is gone (nothing to merge back).
  Node 22 in the job (engines >=22). Steps in CONTRIBUTING.md "Releasing".
  2026-10-01: release-npm.yml takes an explicit semver `version` input (prerelease never
  to `latest`, dist_tag default `next`), inputs passed via env, final step merges main
  back into dev without --force; npm name still unclaimed. Open: NPM_TOKEN (owner: "no
  npm yet") (#34)

## Phase 4 — Docs repositioning

- [x] 4.1 README + docs/index.md: library first, AI-driven UI as the vision;
  package description — DONE 2026-10-01
  2026-10-01: owner direction: docs are minimal (how to use, why, API reference; the
  code documents the internals). README and docs/index.md cut down to a short why,
  default design system note, core/wrapper boundary, one usage snippet and links;
  ai-runtime-styling.md trimmed to the AI-driven UI story; package.json description and
  keywords describe a library (#19)
- [x] 4.2 Agent quickstart (explicit classes + rejected feedback loop) +
  docs-examples test — DONE 2026-10-01
  2026-10-01: docs/agent-quickstart.md (loop, Node example, curl transcript captured
  from a real local core); docs-examples.test.js runs the loop via core calls and HTTP
  and asserts `rejected` (#20)
- [x] 4.3 Remaining divergence doc fixes (Appendix A items 9-12, 6) — DONE 2026-09-30 (#21)
- [x] 4.4 api-reference: error enum, rejected, core vs host enforcement; Pages render
  check — DONE 2026-10-01
  2026-10-01: Errors table (13 codes, status, when), Functions table with RichWindError,
  `rejected` defined in one sentence, core vs host enforcement table linking the threat
  model; GET /api/css wording fixed (serves cached CSS, never compiles new classes).
  docs/_config.yml parses (ruby yaml); no Jekyll build run; Pages stays off (#22)

## Phase 5 — Go-public gate

- [x] 5.0 OWNER DECISIONS: D1 PR-refs route, D2 author email and trailers, D3
  public demo hostname rule — DONE 2026-10-01
  2026-10-01: D1 (b) new repository: rename this one to rich-wind-archive (stays
  private), push the purged history to a new `rich-wind`, transfer the issues. D2:
  author email mapped to the GitHub noreply address and AI Co-Authored-By / "Generated
  with Claude Code" lines removed, in the 5.2 run. D3: the public demo URL is allowed in
  tracked files (EXECUTION.md amended); IPs, SSH details and keys stay banned (#35)
- [x] 5.1 gitleaks full history, all branches — DONE 2026-10-01
  2026-10-01: gitleaks 8.30.1 over --all (dev, main, archive/parked-demos): no leaks.
  Extra grep for the server IP, the SSH key name and the personal email: found only in
  `.claude/CLAUDE.md`, which 5.2 purges (#23)
- [x] 5.2 git filter-repo purge + force-push + fresh clone — DONE 2026-10-01 (#24)
  2026-10-01: old repo renamed rich-wind-archive (private, keeps PRs and old refs). Purged
  history (no `.claude/`, noreply author email, AI trailers removed; trees identical,
  196 commits to 187) pushed to a new private `rich-wind`; labels, milestone V1 and
  workflow permissions copied; 36 issues transferred (old #45-#81 now #2-#37). Fresh
  clone: no `.claude/` in any ref, gitleaks clean, 339 tests pass. Old PR numbers in
  this file refer to rich-wind-archive
- [x] 5.3 Execute parked-demos decision — DONE 2026-09-26: tag `archive/parked-demos`
  pushed; `parked-demos` branch deleted (remote and local)
- [x] 5.4 SECURITY.md, CONTRIBUTING.md, templates, branch protection, Dependabot — DONE 2026-10-03 (#25)
  - 2026-10-03: with the release job no longer pushing to main, the "main protection"
    ruleset also requires a pull request and the five CI checks
  - 2026-10-01: SECURITY.md, CONTRIBUTING.md, issue forms, PR template and
    dependabot.yml (npm + github-actions, weekly, target dev) added; branch protection
    follows 5.5
  - Note 2026-09-26: branch protection and rulesets return HTTP 403 while the repo is
    private on GitHub Free, so protection can only be applied after 5.5 (or on a paid
    plan). `release-npm.yml` pushes the version commit and tag straight to `main`
    (`git push origin HEAD:main --follow-tags`), so a require-PR rule on `main` must
    leave that push possible (or the release job must switch to opening a PR).
  - 2026-10-01: ruleset "main protection" active on main: no deletion, no force-push.
    A require-PR or required-checks rule needs a bypass for the release push, and a
    personal repo cannot list GitHub Actions as a bypass actor, so those rules wait on
    the release-flow choice
- [x] 5.5 Flip public + enable Pages + repo metadata — DONE 2026-10-01 (#26)
  2026-10-01: repo public; Pages from main /docs (built); description, homepage and
  topics set from package.json; rich-wind-archive stays private
  2026-10-01: made private again the same day pending review (Pages off, ruleset not
  enforced). 2026-10-02: public again; ruleset enforced; Pages re-enabled from main /docs

## Phase 6 — Release and go-live

- [ ] 6.0 Restore deploy target: host-key check, tunnel, deploy/ templates,
  rollback, VM config (#36)
- [ ] 6.1 dev -> main; release-npm.yml -> 1.0.0-rc.1 on dist-tag next (#27)
- [ ] 6.2 Deploy rc to VM (owner picks the moment) (#28)
- [ ] 6.3 Soak + test:load (#29)
- [ ] 6.4 Promote 1.0.0 to latest; CHANGELOG; GitHub Release (#30)
