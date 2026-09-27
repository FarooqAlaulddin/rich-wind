# Rich Wind — V1 Milestone Plan

Finalized 2026-08-18 after three adversarial review rounds (plan drafted and
cross-examined against the codebase; all findings folded in; final round approved
every phase). Evidence-backed decisions below are settled — do not re-litigate them
without new evidence.

Revised 2026-09-27 after a gap review against the repository, GitHub, npm and the
live deployment: new items 2.7, 3.5-3.7, 5.0 and 6.0; added detail to 1.4, 1.7, 2.1,
2.6, 4.3, 5.2, 5.4, 5.5 and 6.1-6.3. Findings and how each was checked: Appendix B.

**If you are executing this plan, read [`EXECUTION.md`](EXECUTION.md) first** — it
carries the working conventions, decision-authority boundaries, owner-only steps,
and hard sequencing constraints. Track progress in [`PROGRESS.md`](PROGRESS.md).
The measurements behind the settled decisions are reproducible via
[`evidence/compile-bench.mjs`](evidence/compile-bench.mjs).

## Positioning

Primary use case: **AI-guided UI**. Apps render LLM-generated HTML/class lists at
runtime; Rich Wind is the machine-readable styling backend returning
`{ css, classes, rejected, hash, cached }`. The app owns rendering and workflow;
Rich Wind owns deterministic validation, compilation, and CSS delivery. The
`rejected` field gives any caller enough compiler feedback to build a correction
loop. CMS/editors/multi-tenant remain secondary documented use cases.

Rich Wind core is **agent-ready, not AI-aware**. Agent wrappers and host apps own
HTML-specific diagnostics, prompts, design-system context, policy, drafts,
publishing, tenant identity, and agent protocols such as MCP. Those concerns must
not enter the V1 core contract. V1 compiles against Tailwind's default design
system; custom compiler theme input is post-V1.

## Constraints

- Repo stays **private** until most of V1 is done. Public flip + GitHub Pages is a
  late phase.
- Deployment stays simple: Cloudflare Tunnel to the VM (nginx + node, rsync release
  script, systemd). Go-live happens near the end, when the milestone reaches a good
  spot. The release script and config templates move into the repo with placeholders
  only (6.0); addresses, users and keys stay in the owner's local notes.
- No Docker distribution work in V1.

## Settled by evidence

- **Compile DoS is a non-issue within existing caps.** Benchmarked the real compile
  path with adversarial inputs at the caps (maxClassChars 10000, maxClassCount 1500,
  maxHtmlChars 50000): worst case observed ~10ms compile + ~7ms build (1010 arbitrary
  values, 14-deep variant stacks, arbitrary selectors, nested calc, 336 variant
  permutations). Verdict: no worker threads, no compile-timeout env; a small
  concurrency cap is cheap insurance only.
- **Brace-expansion bomb cannot reach the compiler.** `@source inline()` supports
  brace expansion (exponential), and `UNSAFE_CLASS_CHAR_RE` does not block `{ } ,` —
  but the pipeline pre-validates every class via `candidatesToCss` (brace tokens
  return null) before `@source inline` is built. Action anyway: add `{ }` to the
  unsafe-char regex as defense-in-depth, plus regression tests locking the
  validate-before-inline ordering.
- **`rejected` must come from explicit `classes` input only.** The HTML scanner
  extracts heuristic candidates: in a prose test, 12 of 19 candidates were words like
  "and" and "dog". HTML-only requests return `rejected: []`.
- **Cache miss on CSS GETs becomes 404.** Docs already claimed 404; code returns
  200-empty. The demo guards `res.ok` on every CSS fetch; a `<link>` to a 404 is
  harmless in browsers. Verified safe.
- **Baseline is green: 277 tests / 19 files** (older references to "239 tests" are
  stale).
- **Docs-vs-code divergence inventory complete** (Appendix A): 12 mismatches found;
  every one is scheduled into a phase. Biggest: `rateLimit*` config is documented in
  `index.d.ts` and `runtime-spec.md` but was never implemented in core; the `guard`
  hook is implemented but absent from the public plugin contract; `ctx.compile()`
  returns a different shape than documented.

## Phase 0 — Cleanup and baseline

1. Untrack `.claude/CLAUDE.md` (internal deployment notes; must not ship in a public
   repo): `git rm --cached`, add `.claude/` to `.gitignore`, keep the file locally.
   Full history purge is deferred to Phase 5 so one `git filter-repo` run covers
   everything right before going public.
2. Delete stray untracked `installed-versions.txt`.
3. DECIDED 2026-09-26: the `parked-demos` branch (no commits of its own; an ancestor of
   `main`) is replaced by the annotated tag `archive/parked-demos` on the same commit. A
   tag survives the Phase 5.2 history rewrite; the demo stays restorable from it.
4. Baseline: `npm test` green (DONE: 277/277), `npm run test:pack`, `npm audit`
   snapshot, CI green on dev.
5. Divergence inventory: DONE (Appendix A), items scheduled into Phases 1/2/4.
6. Create GitHub milestone "V1" + one issue per deliverable (repo still private).

## Phase 1 — V1 machine-readable API contract

1. `rejected: string[]` on `POST /api/compile`: normalized tokens from `body.classes`
   that fail `candidatesToCss` OR are dropped by `UNSAFE_CLASS_CHAR_RE`. html-only
   requests return `[]`. Documented as "explicit class input only". No
   plugin-transform rejects in V1.
2. Central error helper: every non-2xx returns `{ error, code }` with a closed enum
   (`INVALID_ID`, `MISSING_INPUT`, `PAYLOAD_TOO_LARGE`, `READ_ONLY_REPLICA`,
   `RATE_LIMITED`, `SERVER_BUSY`, `UNAUTHORIZED`, `FORBIDDEN`, `REQUEST_BLOCKED`,
   `NOT_FOUND`, `INTERNAL`). Plugin guard responses map 401 to `UNAUTHORIZED`, 403
   to `FORBIDDEN`, 429 to `RATE_LIMITED`, and every other blocking status to
   `REQUEST_BLOCKED`. Includes the final Express error handler. `openapi.json`:
   `code` becomes required on the error schema; guarded-route errors are documented
   on every affected route (today only compile lists 429).
3. Alias removal — one dedicated breaking-change PR. Canonical names only:
   `projectId`, `pageId`, `bundle`, `limit`. Remove: `project_id`, `page_id`
   (compile, css, invalidate, suggest), `mode` (compile + both CSS GETs),
   `max`/`count` (suggest), and tighten bundle values to
   `full | base | theme | utilities` (drop `preflight`, `tokens`, `design`,
   `utility`, `utils`, `util`, `utilities-only`, `utility-only` from
   `normalizeBundle`). Update code + tests (`api.test.js`, `edge-cases.test.js`) +
   `api-reference.md` + `openapi.json` together.
4. Reader/cache-miss semantics: adopt 404 + `NOT_FOUND` on CSS GET misses; verify
   `richwind-loader.js` / lexical demo handle it (pre-verified safe); align docs.
   Scope: the two core CSS GETs (`GET /api/css`, `GET /api/projects/:projectId/css`);
   the auto-promote plugin's CSS route is plugin-owned and keeps its behavior. This
   knowingly reverses commit 9e157d8 (2026-05-03), which moved misses to 200 empty
   `text/css` because browsers ORB-block a JSON body loaded by a cross-origin
   `<link>`. The page result is the same either way (no stylesheet applied, no
   retry); the difference is a console message. The loader adds the project theme
   stylesheet before its first compile, so a first visit to a new project hits that
   404 (today: 200 empty). The 404 body is the 1.2 JSON envelope like every other
   non-2xx; api-reference notes the console message. Cite 9e157d8 in the PR.
5. Plugin contract truth-up (types + docs match code):
   - Add `guard` to `PluginHookName`/`RichWindPlugin` types and `plugin-system.md`.
   - Fix `onRequestStart`/`onResponseSent` docs: they fire for built-in route
     handlers only (not preflight, body-parser failures, 404s, plugin custom
     routes); `source` is present only where actually provided. Document reality; no
     behavior change.
   - Fix `ctx.compile()` documented return shape to the actual internal shape (no
     `success`/`projectId`/`pageId` wrapper).
6. Contract validation for real: add `ajv` as devDependency; extend
   `tests/contracts.test.js` to validate live route responses against
   `openapi.json`.
7. Contract freeze is the LAST PR of Phases 1+2 combined (after the rate limiter and
   service access key add their error codes); then the 1.x compatibility policy goes
   in the docs. Within 1.x, existing fields do not change type or meaning, successful
   status codes and endpoint side effects remain stable, existing error codes keep
   their meaning, and response objects may gain optional fields. New error codes are
   reserved for the next major version; new failure cases in 1.x map to the frozen
   enum. The policy also states that generated CSS and the contents of `rejected`
   track the installed Tailwind CSS 4.x release (a Tailwind minor can add utilities,
   turning a rejected class into a valid one), and that Rich Wind depends on
   Tailwind's `__unstable__loadDesignSystem` and `candidatesToCss`, so a Tailwind
   release that breaks them is answered by a Rich Wind release that narrows the
   dependency range. Set `docs/openapi.json` `info.version` to `1.0.0` (today
   `0.0.1`); it is the API contract version and carries no package prerelease tag.

## Phase 2 — Core hardening

Principle: a bare deployment with no nginx in front must remain resource-bounded on
the open internet. This does not make the auth-agnostic core a tenant-isolation
boundary.

1. Implement the already-documented in-core fixed-window per-IP rate limiter, as two
   buckets: compile 120/min, all other API + plugin routes 600/min (field-tested
   production numbers; a single 60/min would throttle one active demo editor at ~4
   requests per keystroke). Shared `rateLimitWindowMs`; config
   `rateLimitCompileMax`/`rateLimitApiMax` (+ `RW_` envs); `rateLimitDisabled`.
   Default ON (embedded and standalone; embedders can disable). Buckets are keyed on
   the client identity from 2.7, which lands with or before this item. Skip `OPTIONS` and
   `/health`. 429 + `Retry-After` + `RATE_LIMITED` envelope. Update `runtime-spec.md`
   defaults. Rate-limit state must delete expired buckets and enforce an internal,
   non-configurable V1 cap of 10,000 tracked IP buckets so unique-IP traffic cannot
   grow memory without bound. At the cap, reject an unseen IP rather than allocating
   another bucket. DELETE `plugins/rate-limit` (never published; now an unpublished
   duplicate).
2. Optional service access key, `RW_API_KEY` (config `apiKey`): when set, Bearer
   required on exactly
   `POST /api/compile`, `POST /api/invalidate`, `POST /api/suggest` (suggest exposes
   the project class cache + plugin hooks). CSS GETs, loader scripts, `/health`,
   plugin routes, `OPTIONS` stay open. Timing-safe compare. 401 `UNAUTHORIZED`.
   Document that this is deployment-level access control, not tenant auth, and that
   plugin routes must enforce their own access policy when they expose sensitive
   data or mutations.
3. Middleware placement: limiter and auth mount AFTER the CORS/preflight handler and
   BEFORE `express.json` (cheap rejection, preflight unbroken);
   `pluginRunner.runGuard` stays after core auth/limiter as an extension layer, not
   the implementation.
4. Compile insurance: `RW_MAX_CONCURRENT_COMPILES` (default 8), with no wait queue;
   shed immediately with 503 `SERVER_BUSY` + `Retry-After` when all slots are in use.
5. `UNSAFE_CLASS_CHAR_RE` gains `{` and `}`. Regression tests: brace-expansion bomb
   via classes and via html; prose-noise html asserting `rejected: []`.
6. Threat model section in `runtime-spec.md`: defended (compile abuse: caps +
   concurrency cap + benchmark rationale; cache exhaustion: LRU caps; `@source
   inline` breakout: validate-before-inline + char filter), delegated (tenant auth,
   plugin-route access control, multi-replica coordinated limiting). Clarify that
   public CSS GETs are an intentional delivery surface and the optional API key is
   not tenant isolation. Security headers: audit-only (nosniff, Referrer-Policy,
   X-Frame-Options, CORP already present). Also state two known limits: a client
   that controls many addresses (an IPv6 /48 holds 65,536 /64 prefixes) can fill the
   10,000-bucket cap and lock out unseen clients for one window; and per-IP limiting
   is only as good as the `trustProxy` setting (2.7). Deployments behind a CDN or
   proxy rely on it as the outer limiter.
7. Client identity behind proxies (lands with or before 2.1). Today `RW_TRUST_PROXY`
   is boolean-only (`parseBoolean`), and `true` makes Express take the leftmost
   `X-Forwarded-For` entry, which the client controls: once the limiter is on,
   rotating that header bypasses it and fills the bucket cap (verified 2026-09-27,
   Appendix B). `trustProxy` / `RW_TRUST_PROXY` also accepts a hop count or a
   comma-separated list of trusted addresses/subnets (Express `trust proxy`
   semantics; typed in 3.4). `runtime-spec.md` documents `true` as unsafe on the open
   internet and explains how to derive the hop count for a Cloudflare Tunnel + nginx
   chain (confirmed on the VM in 6.0). IPv6 clients are keyed by their /64 prefix.
   Tests: under a hop count, a spoofed leftmost `X-Forwarded-For` does not change the
   key; the bucket cap holds under many unique keys.

## Phase 3 — Packaging (npm only)

1. `files: ["services/", "plugins/"]` PLUS explicit exports subpaths:
   `./plugins/auto-promote` and `./plugins/cache-store-fs` (explicit entries over a
   `./plugins/*` pattern, per Node guidance for small public APIs).
2. Remove the Dockerfile in V1 (git history preserves it; Docker distribution is
   post-V1; a services-only Dockerfile would ship broken plugin support).
3. `pack-smoke`: install the packed tarball, import both exported plugin subpaths,
   instantiate each factory, verify unexported paths fail.
4. Align `services/index.d.ts` with post-Phase-1/2 reality (rateLimit* real, `guard`
   hook typed, `ctx.compile` shape, removed aliases).
5. Dependency hygiene: `npm audit fix` without `--force` (the Phase 0 snapshot,
   `evidence/npm-audit-2026-09-26.txt`, shows all 8 advisories fixable that way;
   production: `qs` and `body-parser` via express, which the VM installs from the
   lockfile). Delete the stale `lexical-demo/package-lock.json` before Dependabot
   (5.4) starts opening PRs against it: the workspace install uses only the root
   lockfile, and the nested one has drifted (vite 8.0.10 against the root's 7.3.2).
   Full tests, pack smoke and demo build after. Gate for 6.1: `npm audit --omit=dev`
   clean.
6. Supported Node versions: Node 20 reached end-of-life on 2026-04-30, yet
   `engines.node` is `>=20` and CI tests only Node 20. Raise `engines.node` to
   `>=22`; `test-before-merge.yml` runs a matrix of Node 22 and 24, plus one job that
   installs without the lockfile so tests run against what a fresh
   `npm install rich-wind` resolves (the lockfile tests Tailwind 4.1.18; a fresh
   install gets 4.3.3); `release-npm.yml` moves off Node 20.
7. Release pipeline readiness (prerequisite for 6.1):
   - Version input: from `0.0.1-alpha.0` the workflow's options produce `0.0.1-rc.0`
     (prerelease) or `1.0.0` (major); `1.0.0-rc.1` is unreachable. Add an explicit
     `version` input (`npm version <version>`), keeping the guard that prerelease
     versions never publish to `latest`.
   - npm credentials: the `NPM_TOKEN` secret the workflow reads does not exist (the
     repo's only secrets are two unused Render deploy hooks). Owner step: create the
     npm credential. Per npm's documentation (confirm on npmjs.com when executing),
     trusted publishing needs npm CLI 11.5.1 or later (Node 20 and 22 bundle npm 10)
     and is configured on an existing package, so the first publish may need a
     short-lived granular token; `--provenance` requires a public repository, which
     5.5 provides.
   - Back-merge: the workflow pushes its version commit and tag straight to `main`,
     so every release ends with `main` merged back into `dev`, or the next dev->main
     PR conflicts on `package.json`. Branch protection (5.4) must allow that push, or
     the workflow switches to opening a PR.
   - Confirm the npm name `rich-wind` is still unclaimed (it was on 2026-09-27).

## Phase 4 — Docs repositioning (while private)

1. README + `docs/index.md` lead with AI-guided UI while preserving the core/wrapper
   boundary; `ai-runtime-styling.md` promoted to the core story; CMS/editors as
   "also fits". State plainly that V1 uses Tailwind's default design system.
2. New agent quickstart: model emits HTML plus an explicit class list ->
   `POST /api/compile` -> feed explicit-input `rejected` values back to the model ->
   recompile -> serve `GET /api/css`. Explain that wrappers may parse HTML into the
   explicit class list, while core does not own that workflow. Node example + curl
   transcript, wired into `docs-examples.test.js`.
3. Divergence doc fixes not already absorbed by Phase 1/2 PRs (Appendix A): design
   system loads lazily on first use (not "once at startup"); `GET /api/css`
   materializes a missing bundle from cached classes (document as behavior);
   `maxCssChars` applies to `transformCss`/resolve output too; auto-promote returns
   `[]` not `undefined` + fix test path in docs; plugin-system export examples match
   the new exports map; api-reference gains query `bundle` on CSS routes;
   suggest/invalidate alias rows dropped. Also drop the empty `<claude-mem-context>`
   block at the end of `AGENTS.md` (tool residue that would go public).
4. api-reference: error enum, `rejected` field, auth, rate limits. Verify
   `docs/_config.yml` renders for Pages (flip in Phase 5).

## Phase 5 — Go-public gate

0. OWNER DECISIONS, needed before 5.1:
   - D1, pull-request refs: GitHub keeps a read-only `refs/pull/<n>/head` for every
     pull request (44 today), and a force-push cannot change them. From PR #32 on,
     they reach commits containing the deployment notes that 0.1 untracked, so after
     a filter-repo force-push those commits stay fetchable once the repo is public.
     Choose: (a) force-push, then ask GitHub Support to remove the PR refs and cached
     views (GitHub's documented procedure; Support decides whether to act on data
     that is not a rotatable credential); or (b) rename this repo, create a new
     `rich-wind` repository, push the purged history there, transfer the issues,
     recreate milestone V1 and the repo settings/secrets (issue numbers change; PR
     history stays in the renamed private repo). Recommendation: (b), because it
     does not depend on Support and 5.2 can verify it directly.
   - D2, author metadata: 119 commits carry the owner's personal email address as
     author, and 78 commit messages carry `Co-Authored-By` trailers naming AI tools.
     gitleaks flags neither. 5.2 is the only planned history rewrite, so any change
     to either (a mailmap to the GitHub noreply address, trailer removal) must be in
     that run. Owner's call.
   - D3, public demo hostname: `EXECUTION.md` bans hostnames in tracked files, but
     the tracked `lexical-demo/.env.production` holds the public demo hostname (also
     the planned repo homepage, 5.5). Choose: allow public demo URLs explicitly in
     the rule (recommended), or move the value out of tracked files.
1. gitleaks scan: full history, all branches and tags (including `archive/parked-demos`).
2. `git filter-repo` purge of `.claude/CLAUDE.md` + any gitleaks findings, plus
   whatever D2 decides; force-push (or push to the new repository, per D1); fresh
   clone. (VM deploys use rsync, unaffected; no forks exist.) Verify before 5.5: no
   commit reachable from a fresh clone, or from any `refs/pull/*` ref of the
   repository that will go public, contains a `.claude/` path. The rewrite changes
   every commit hash, including the one `archive/parked-demos` points to; update the
   hashes quoted in `PROGRESS.md` and in issues.
3. Execute the `parked-demos` decision (tag created in Phase 0; see `PROGRESS.md`).
4. `SECURITY.md`, `CONTRIBUTING.md`, issue templates, branch protection on main,
   Dependabot. Branch protection returns HTTP 403 while the repo is private on
   GitHub Free, so it is applied right after 5.5; it must leave the release
   workflow's push to `main` possible (3.7).
5. Flip public (only after the 5.2 verification passes); enable Pages (main
   `/docs`); set repo description/topics/homepage.

## Phase 6 — Release and go-live

0. Restore the deploy target (owner-only steps marked; may start any time, must be
   DONE before 6.2). On 2026-09-27 the public health URL returned HTTP 530 (Cloudflare
   tunnel down) and SSH to the VM failed with a changed host key.
   - Owner: find out why the host key changed (rebuilt instance, or an address now
     serving a different machine) before accepting any new key; restore the tunnel;
     confirm `/health` publicly.
   - Add `deploy/` to the repo: the release script, a systemd unit template, an nginx
     template with the rate-limit zones, and an env example. Placeholders only: no
     addresses, users, key names or hostnames (EXECUTION.md). Today these exist only
     in the owner's untracked notes and on the VM.
   - The release script keeps the previous release: switch the symlink, restart,
     poll `/health`; on failure switch back and restart; prune old releases only
     after a healthy start. Today it deletes every previous release before
     restarting, so a bad release has nothing to roll back to.
   - Settle the VM configuration for V1 features: `RW_TRUST_PROXY` as the hop count
     from 2.7 (today `1`, which means trust everything); verify that nginx's
     `limit_req` zones key on the real client address, not the tunnel's local
     address; `RW_API_KEY` stays unset because the public browser demo cannot hold a
     key (the open compile endpoint is intentional for the demo); in-core limiter on
     with the nginx numbers; concurrency cap at its default.
1. Merge dev -> main (the release workflow only runs from main); `release-npm.yml`
   -> `1.0.0-rc.1` on dist-tag `next` via the explicit version input (3.7); gate:
   `npm audit --omit=dev` clean (3.5); then merge `main` back into `dev`.
2. Deploy the rc to the VM with the `deploy/` release script from 6.0 (owner picks
   the moment).
3. Soak behind demo traffic; `npm run test:load`. Pass criteria: the soak spans at
   least one full `RuntimeMaxSec` restart cycle; no 5xx other than intentional 503
   `SERVER_BUSY`; heap stays under the 512 MB cap; normal typing in one demo editor
   never draws a 429; `test:load` passes.
4. Promote `1.0.0` to `latest`; CHANGELOG; GitHub Release telling the AI-guided-UI
   story.

## Out of V1

- Custom compiler theme input (`@theme`), whether process-scoped or per-request (a
  v1.x headliner).
- MCP server wrapper (cheap to build later against the frozen contract).
- Agent orchestration, prompts, style-context manifests, correction suggestions,
  draft/revision/publish workflows, agent policy, and agent telemetry.
- Redis/S3 cacheStore adapters (interface + fs reference + cookbook recipe suffice).
- Multi-tenant auth (host wrapper's job).
- Splitting `services/index.js` into modules (post-V1 refactor).
- Docker/GHCR distribution.

## Appendix A — Docs-vs-code divergence inventory

Scheduled locations in parentheses.

1. `rateLimit*` config in `index.d.ts` + `runtime-spec.md` + `api-reference.md` +
   openapi 429s: not implemented in core (Phase 2.1 implements; Phase 1.2 openapi).
2. `guard` hook implemented but absent from public types/docs (Phase 1.5).
3. `onRequestStart`/`onResponseSent` docs overpromise scope and `source` (Phase 1.5).
4. `ctx.compile()` documented shape differs from actual internal return (Phase 1.5).
5. Reader miss documented 404, actual 200 empty text/css (Phase 1.4).
6. `plugins/rate-limit` docs show a subpath import the exports map blocks;
   plugin-system says built-in plugin exports are not public (Phase 3.1 + Phase 4.3).
7. invalidate snake_case implemented but undocumented; suggest `project_id` in
   openapi but not api-reference (resolved by removal, Phase 1.3).
8. `mode` alias implemented on compile + CSS GETs, inconsistently documented
   (resolved by removal, Phase 1.3).
9. `maxCssChars` documented as cacheStore-only, also applies to
   `transformCss`/resolve output (Phase 4.3).
10. auto-promote docs: stale return value (`undefined` vs `[]`) and wrong test path
    (Phase 4.3).
11. runtime-spec "design system loaded once at startup" vs lazy first-use load
    (Phase 4.3).
12. `GET /api/css` documented cache-read-only, actually materializes a missing
    bundle from cached classes (Phase 4.3 — document as behavior).

## Appendix B — Gap review 2026-09-27

Checked against the code, git history, GitHub, npm and the live deployment, with an
independent codex review whose claims were re-verified before use. Scheduled
locations in parentheses.

1. `refs/pull/*` keep purged commits reachable: 44 PR refs, and from PR #32 on they
   reach the deployment notes that 0.1 untracked (5.0 D1, 5.2).
2. The release workflow cannot reach `1.0.0-rc.1` from `0.0.1-alpha.0` (checked with
   `npm version`: prerelease gives `0.0.1-rc.0`, major gives `1.0.0`); no
   `NPM_TOKEN` secret exists; the version commit lands on `main` only (3.7, 6.1).
3. With `trust proxy` = true, Express takes the client-supplied leftmost
   `X-Forwarded-For` entry. Checked with a local Express app and a
   `spoofed, real, proxy` chain: two requests with different spoofed values got two
   different `req.ip` values; a hop count of 2 returned the real address (2.7).
4. Deploy target down (HTTP 530, changed SSH host key); the release script deletes
   the previous release before restarting; deploy config lives only in untracked
   notes and on the VM (6.0).
5. The owner's personal email address is the author of 119 commits; 78 commit
   messages carry AI `Co-Authored-By` trailers (5.0 D2).
6. The 8 npm advisories from the Phase 0 snapshot had no phase; the nested
   `lexical-demo/package-lock.json` is stale (3.5).
7. Node 20 reached end-of-life on 2026-04-30 while `engines` says `>=20` and CI
   tests only Node 20 (3.6).
8. The range `^4.1.18` resolves Tailwind 4.3.3 on a fresh install. The full suite
   passes 277/277 on 4.3.3 and `__unstable__loadDesignSystem` is still exported, but
   CI only tests the lockfile (3.6, 1.7).
9. 1.4 reverses 9e157d8 (ORB); the loader's theme stylesheet misses on a first visit
   to a new project, checked against a local core (1.4).
10. The tracked `lexical-demo/.env.production` holds the public demo hostname,
    against the EXECUTION.md rule (5.0 D3).
11. `docs/openapi.json` `info.version` is `0.0.1` (1.7).
12. `AGENTS.md` ends with an empty `<claude-mem-context>` block (4.3).
13. The rewrite changes every hash quoted in `PROGRESS.md` and in issues (5.2).
14. The 6.3 soak had no pass criteria (6.3).
