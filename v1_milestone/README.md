# Rich Wind — V1 Milestone Plan

Finalized 2026-08-18 after three adversarial review rounds (plan drafted and
cross-examined against the codebase; all findings folded in; final round approved
every phase). Evidence-backed decisions below are settled — do not re-litigate them
without new evidence.

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
  spot.
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
3. OWNER DECISION: `parked-demos` branch — delete at Phase 5, or scrub and keep.
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
   enum.

## Phase 2 — Core hardening

Principle: a bare deployment with no nginx in front must remain resource-bounded on
the open internet. This does not make the auth-agnostic core a tenant-isolation
boundary.

1. Implement the already-documented in-core fixed-window per-IP rate limiter, as two
   buckets: compile 120/min, all other API + plugin routes 600/min (field-tested
   production numbers; a single 60/min would throttle one active demo editor at ~4
   requests per keystroke). Shared `rateLimitWindowMs`; config
   `rateLimitCompileMax`/`rateLimitApiMax` (+ `RW_` envs); `rateLimitDisabled`.
   Default ON (embedded and standalone; embedders can disable). Skip `OPTIONS` and
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
   X-Frame-Options, CORP already present).

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
   suggest/invalidate alias rows dropped.
4. api-reference: error enum, `rejected` field, auth, rate limits. Verify
   `docs/_config.yml` renders for Pages (flip in Phase 5).

## Phase 5 — Go-public gate

1. gitleaks scan: full history, all branches (including `parked-demos`).
2. `git filter-repo` purge of `.claude/CLAUDE.md` + any gitleaks findings;
   force-push; fresh clone. (VM deploys use rsync, unaffected; no forks exist.)
3. Execute the `parked-demos` decision.
4. `SECURITY.md`, `CONTRIBUTING.md`, issue templates, branch protection on main,
   Dependabot.
5. Flip public; enable Pages (main `/docs`); set repo description/topics/homepage.

## Phase 6 — Release and go-live

1. Merge dev -> main (the release workflow only runs from main); `release-npm.yml`
   -> `1.0.0-rc.1` on dist-tag `next`.
2. Deploy the rc to the VM via the existing rsync release script (owner picks the
   moment).
3. Soak behind demo traffic; `npm run test:load`.
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
