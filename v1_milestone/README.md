# Rich Wind — V1 Milestone Plan

Finalized 2026-08-18 after three adversarial review rounds (plan drafted and
cross-examined against the codebase; all findings folded in; final round approved
every phase). Evidence-backed decisions below are settled — do not re-litigate them
without new evidence.

Revised 2026-09-27 after a gap review against the repository, GitHub, npm and the
live deployment: new items 2.7, 3.5-3.7, 5.0 and 6.0; added detail to 1.4, 1.7, 2.1,
2.6, 4.3, 5.2, 5.4, 5.5 and 6.1-6.3. Findings and how each was checked: Appendix B.

Revised again 2026-09-27 by the owner: the positioning is library first, with AI-driven
UI as the vision behind it. Rate limiting and access keys stay out of the library (the
host app or the proxy in front decides who may call it and how often): 2.1 rewritten,
2.2 and 2.3 dropped, 2.6 and 2.7 reduced.

Revised a third time 2026-09-27 by the owner, after an independent second opinion: core
drops Express before the contract freeze. New item 1.8 (native transport) absorbs 2.7;
1.2, 1.5-1.7, 2.1, 2.4, 2.6, 3.4, 3.5 and 6.0 adjusted. Findings: Appendix C.

Tightened 2026-09-30 by the owner, after a readiness review: the 1.8 details that 1.7
freezes (what the functions return, `RichWindError`, one compile function for hosts
and plugins, `basePath` for `core.fetch`, the guard on HTTP requests only), 1.8 split
into two PRs, the slot rule for plugin compiles in 2.4, and the order around 1.8 (1.6
before it; 2.1, 2.4, 4.1, 4.2 and 4.4 after it).

**If you are executing this plan, read [`EXECUTION.md`](EXECUTION.md) first** — it
carries the working conventions, decision-authority boundaries, owner-only steps,
and hard sequencing constraints. Track progress in [`PROGRESS.md`](PROGRESS.md).
The measurements behind the settled decisions are reproducible via
[`evidence/compile-bench.mjs`](evidence/compile-bench.mjs).

## Positioning

Rich Wind has two visions, one inside the other.

**1. The library (what V1 ships).** Rich Wind is an open-source (MIT) npm library that
apps include to compile Tailwind CSS at runtime, for markup that did not exist when the
app was built. It is a project in its own right: CMS pages, editors, previews,
multi-tenant pages and AI output all use it the same way. An app includes it in one of
three ways: mount its request handler under any path prefix behind the host's own
middleware (`core.handler` for Node-style servers such as Express, Koa and
`node:http`; `core.fetch` for Fetch-style ones such as the Next.js App Router and
Hono), call its functions (`core.compile()` and the rest) from any Node framework, or
run the bundled server (`npm start`) as a separate service behind a proxy. Core depends
on no web framework (1.8). It needs Node 22 or later and cannot run on edge runtimes,
because Tailwind's scanner (`@tailwindcss/oxide`) is a native addon. The library owns
deterministic validation, compilation, caching, suggestions, CSS delivery, and
protection of its own resources (input caps, cache caps, compile concurrency). The host
app, or the proxy in front of the standalone server, owns the network edge: who may
call it, how often, and tenant identity.

**2. AI-driven UI (why it exists).** Apps increasingly render LLM-generated HTML and
class lists at runtime. Rich Wind is the styling layer for that: compile returns
`{ css, classes, rejected, hash, cached }`, and `rejected` gives a model enough
compiler feedback to correct itself and recompile. V1 makes the library
**agent-ready, not AI-aware**: agent wrappers and host apps own HTML-specific
diagnostics, prompts, design-system context, policy, drafts, publishing, and agent
protocols such as MCP. Those are separate projects built on the library and must not
enter the V1 core contract.

V1 compiles against Tailwind's default design system; custom compiler theme input is
post-V1.

## Constraints

- Repo stays **private** until most of V1 is done. Public flip + GitHub Pages is a
  late phase.
- The project's own deployment (the public demo) stays simple: Cloudflare Tunnel to
  the VM (nginx + node, rsync release script, systemd). Go-live happens near the end,
  when the milestone reaches a good spot. The release script and config templates move
  into the repo with placeholders only (6.0); addresses, users and keys stay in the
  owner's local notes.
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
- **Embedding works today, and host middleware runs first.** Checked 2026-09-27:
  `core.app` mounted under `/rw` in a host Express app served compile, the CSS GET and
  the loader (the loader derives its base URL from its own `src`), and host middleware
  answered 429 before core ran. One gap: an embedded core ignores the host's
  `trust proxy` setting (fixed in 1.8, which keeps both properties for
  `core.handler`).
- **Express goes before the freeze (owner decision 2026-09-27).** The compile engine
  never touches Express; it appears only in the HTTP layer and in the auto-promote
  plugin's route handlers. In `package-lock.json` Express brings 65 packages, against
  Tailwind's 16 plus 29 optional platform binaries, with none shared, and both
  production advisories come through it. Once 1.7 freezes `{ app }` and Express-shaped
  plugin route handlers, removing Express needs a major version. Checked by an
  independent second opinion and re-verified locally (Appendix C).

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
   (`INVALID_ID`, `MISSING_INPUT`, `INVALID_BODY`, `UNSUPPORTED_MEDIA_TYPE`,
   `PAYLOAD_TOO_LARGE`, `READ_ONLY_REPLICA`, `RATE_LIMITED`, `SERVER_BUSY`,
   `UNAUTHORIZED`, `FORBIDDEN`, `REQUEST_BLOCKED`, `NOT_FOUND`, `INTERNAL`). Plugin
   guard responses map 401 to `UNAUTHORIZED`, 403 to `FORBIDDEN`, 429 to
   `RATE_LIMITED`, and every other blocking status to `REQUEST_BLOCKED` (core has no
   limiter or key check of its own, so these four come only from guards). The
   envelope covers the failures Express answers today (checked 2026-09-27, Appendix
   C): malformed JSON (today 400 `text/html`, with a stack trace in the body when
   `NODE_ENV` is not `production`) and a body that is not a JSON object (today read
   as empty) become 400 `INVALID_BODY`; a POST body that is not `application/json`,
   or has a `Content-Encoding`, becomes 415 `UNSUPPORTED_MEDIA_TYPE` (today a
   `text/plain` body is ignored and a gzip one inflated); unknown paths and methods
   (today an HTML 404) become 404 `NOT_FOUND`; any other error becomes 500
   `INTERNAL`, never an HTML page. `openapi.json`: `code` becomes required on the
   error schema; guarded-route errors are documented on every affected route (today
   only compile lists 429).
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
   knowingly reverses commit 64e2093 (2026-05-03), which moved misses to 200 empty
   `text/css` because browsers ORB-block a JSON body loaded by a cross-origin
   `<link>`. The page result is the same either way (no stylesheet applied, no
   retry); the difference is a console message. The loader adds the project theme
   stylesheet before its first compile, so a first visit to a new project hits that
   404 (today: 200 empty). The 404 body is the 1.2 JSON envelope like every other
   non-2xx; api-reference notes the console message. Cite 64e2093 in the PR.
5. Plugin contract truth-up (types + docs match code):
   - Add `guard` to `PluginHookName`/`RichWindPlugin` types and `plugin-system.md`.
   - Fix `onRequestStart`/`onResponseSent` docs: they fire for built-in route
     handlers only (not preflight, rejected request bodies, 404s, plugin custom
     routes); `source` is present only where actually provided. Document reality; no
     behavior change (1.8 keeps the hooks firing at the same points).
   - `ctx.compile()`: the docs show the compile route's response (with `success`,
     `projectId` and `pageId`), while the code returns an internal shape and reports
     failures as a returned `{ error, status }`. The first 1.8 PR makes `ctx.compile`
     return what `core.compile` returns and throw its `RichWindError`, so the
     documented shape becomes the real one; document the error too. This part lands
     with the first 1.8 PR.
   - `addRoute`: document the handler contract from 1.8 (a neutral request in,
     `{ status, headers, body }` out); `plugin-system.md` stops calling it an Express
     route. This part lands with the second 1.8 PR.
6. Contract validation for real: add `ajv` as devDependency; extend
   `tests/contracts.test.js` to validate live route responses against
   `openapi.json`, including the 400, 404, 413 and 415 envelope cases. Lands after 1.2
   and 1.3 and before 1.8, so the schema checks guard the transport rewrite; 1.8
   moves these tests onto `core.handler` with the rest of the suite.
7. Contract freeze is the LAST PR of Phases 1+2 combined (after the native transport
   (1.8), the embedding contract (2.1) and the concurrency shed (2.4)); then the 1.x
   compatibility policy goes in the docs. Within 1.x, existing fields do not change
   type or meaning, successful status codes and endpoint side effects remain stable,
   existing error codes keep their meaning, and response objects may gain optional
   fields. The embedding contract is part of 1.x: `createCore()` returns
   `{ handler, fetch, compile, getCss, getProjectCss, invalidate, suggest, close }`
   (the object may gain members); `handler` and `fetch` work mounted under any path
   prefix behind host middleware (`fetch` through its `basePath` option); the
   functions accept the same input as the routes, return what the routes send on
   success (the CSS functions return `{ css, etag }`), and fail with a
   `RichWindError` carrying the same status and code; `ctx.compile` behaves like
   `core.compile`; the plugin `addRoute` contract and the HTTP surface rules from 1.8
   hold (exact, case-sensitive paths; HEAD on every GET route; the error envelope on
   every non-2xx); and the standalone server stays. New error codes are reserved for
   the next major version; new failure cases in 1.x map to the frozen enum. The
   policy also states that generated CSS and the contents of `rejected`
   track the installed Tailwind CSS 4.x release (a Tailwind minor can add utilities,
   turning a rejected class into a valid one), and that Rich Wind depends on
   Tailwind's `__unstable__loadDesignSystem` and `candidatesToCss`, so a Tailwind
   release that breaks them is answered by a Rich Wind release that narrows the
   dependency range. Set `docs/openapi.json` `info.version` to `1.0.0` (today
   `0.0.1`); it is the API contract version and carries no package prerelease tag.
8. Native transport: core drops Express before the freeze (owner decision 2026-09-27;
   evidence in Appendix C). Lands after 1.3, 1.2 and 1.6, so the functions never
   learn the aliases and the envelope and schema tests already pin the behavior;
   absorbs 2.7. The compile engine does not change; the HTTP layer is rewritten on
   `node:http` and the Web `Request`/`Response` globals (Node 22 or later, 3.6).
   Two PRs: first the functions (additive: the Express routes start calling them and
   `express` stays), then the transport (everything else in this item; `addRoute`
   and client identity depend on Express until it goes, so they cannot land apart
   from its removal).
   - Functions (first PR): `core.compile`, `core.getCss`, `core.getProjectCss`,
     `core.invalidate` and `core.suggest`. Input validation moves out of the route
     handlers into them, so a direct call and an HTTP call accept the same input and
     fail the same way. On success each returns what its route sends: the JSON body
     of the 200 response, or for the two CSS functions `{ css, etag }` (a miss throws
     `NOT_FOUND`, 1.4; `If-None-Match` and the 304 stay in the HTTP layer). On failure
     they throw a `RichWindError`, exported by the package: an `Error` with `status`,
     `code` from the 1.2 enum, and `message` equal to the envelope's `error`. The
     plugin guard runs on HTTP requests only; a direct caller is the host, which has
     already decided who may call. `index.d.ts` gains the five functions and
     `RichWindError`. Fastify and the Next.js Pages Router call these functions (the
     Pages Router consumes the body before a handler runs).
   - One compile function for hosts and plugins (first PR): `ctx.compile` keeps its
     plugin bookkeeping (`source: 'plugin'`, hook suppression inside hooks, the
     chain-depth limit) but takes `core.compile`'s input, return value and error.
     Exceeding the chain depth becomes 500 `INTERNAL`, since it is a plugin recursion
     bug (today a 429 with no code; `onError` keeps `PLUGIN_COMPILE_CHAIN_LIMIT` in its
     context). Auto-promote's `ctx.compile` call moves from checking `result.error` to
     a try/catch.
   - Adapters over one internal router: `core.handler(req, res)` for Node-style
     servers (plain `node:http`; Express via `app.use('/rw', core.handler)`; Koa;
     Nest), and `core.fetch(request, { ip, basePath })` returning a `Response`, for
     the Next.js App Router, Hono and other Fetch-style hosts. A `Request` carries no
     client address, so the host passes `ip` (without it, `request.ip` is undefined in
     plugin hooks); `trustProxy` applies to it as to a socket address. Express
     rewrites `req.url` under a mount, so `core.handler` resolves paths relative to
     the prefix as today. A `Request` keeps its full URL (a Next.js route at
     `/rw/[...path]` receives `/rw/api/compile`), so `core.fetch` strips `basePath`
     before routing and answers 404 `NOT_FOUND` for a path outside it; a host that
     already strips the prefix leaves `basePath` unset. A Node-style host that does
     not rewrite `req.url` rewrites it before calling `core.handler` (2.1 shows how).
     Bun and Deno are not promised; edge runtimes cannot load `@tailwindcss/oxide` (a
     native addon), and the docs say so.
   - HTTP surface rules, frozen in 1.7: exact, case-sensitive paths with no trailing
     slash (Express today also matches `/API/CSS` and `/api/css/`); HEAD answered on
     every GET route; the 1.2 envelope on every non-2xx, unknown paths and methods
     included (404 `NOT_FOUND`); `:projectId` decoded inside a try/catch (bad
     percent-encoding is 400 `INVALID_ID`); a repeated query parameter stays rejected
     (today `?projectId=a&projectId=b` is a 400; `URLSearchParams.get` would quietly
     take `a`); security headers and CORS, preflight included, unchanged; explicit
     ETags on the two loader scripts, which carry `max-age=3600` (Express adds weak
     ETags to every response today; the CSS routes already set their own).
   - Request bodies: the plugin guard runs before the body is read (it receives only
     the address, method and path, as today). A POST body must be `application/json`
     with no `Content-Encoding` (else 415 `UNSUPPORTED_MEDIA_TYPE`). A
     `Content-Length` over `maxBodyBytes` is refused before reading, a chunked body is
     capped while reading, and a 413 response sends `Connection: close`. A length
     mismatch, invalid UTF-8 (`TextDecoder` with `fatal`) or a body that is not a JSON
     object is 400 `INVALID_BODY`.
   - Failures: every handler runs inside a try/catch; an unexpected error is 500
     `INTERNAL`, reaches `onError`, and never sends a stack trace or HTML. Writes
     check `headersSent`, and response stream errors are handled. Plugin hooks fire at
     the same points as today (1.5 documents them).
   - Plugin routes: `addRoute(method, path, handler)` keeps its methods, path rules
     and `:param` syntax, mounted under `/plugins/<name>/`. The handler receives a
     neutral request (`method`, `path`, `params`, `query` as `URLSearchParams`,
     `headers.get()`, `ip`, and `json()`/`text()` capped at `maxBodyBytes`) and
     returns `{ status, headers, body }` (an object body is sent as JSON). The same
     handler runs under both adapters and is testable without a socket. Port
     auto-promote's two routes (its ETag/304 becomes a returned 304) in the second
     PR.
   - Client identity (was 2.7). `RW_TRUST_PROXY` is boolean-only today
     (`parseBoolean`), and `true` takes the leftmost `X-Forwarded-For` entry, which
     the client controls (verified 2026-09-27, Appendix B). Resolve the address with
     `proxy-addr`; `trustProxy` / `RW_TRUST_PROXY` also accepts a hop count or a
     comma-separated list of trusted addresses/subnets (Express `trust proxy`
     semantics). `runtime-spec.md` documents `true` as unsafe on the open internet
     and explains how to derive the hop count for a Cloudflare Tunnel + nginx chain
     (confirmed on the VM in 6.0). When `trustProxy` is not configured and the host
     already resolved `req.ip` (an Express host with `trust proxy` set), core uses
     that, so a mounted core no longer ignores the host's setting (Appendix B item
     15). The address still reaches plugin hooks only (`request.ip`).
   - Standalone server: `npm start` runs `http.createServer(core.handler)`.
   - Dependencies: remove `express` from `dependencies` and add `proxy-addr`; keep
     `express` as a devDependency for the mount tests and the demo dev server
     (`lexical-demo/scripts/dev-server.js` uses `express.static`). `index.d.ts` stops
     importing its types from `express` (full alignment in 3.4).
   - Tests, first PR: each function's return value against its route's response;
     `RichWindError` status, code and message against the HTTP envelope for the same
     input; `ctx.compile` against `core.compile`, including the chain-depth
     `INTERNAL`; a guard that blocks every HTTP request does not block a direct call.
   - Tests, second PR: `library-import.test.js` (today asserts
     `app.get/post/use/listen`) checks the new members; the 42 `app.listen(0)` calls
     in 8 test files and `tests/helpers/createTestServer.js` move to
     `http.createServer(core.handler)`. New tests for each surface and body rule
     above, for `core.fetch` with and without `basePath`, for Express mounting, for
     plugin routes under both adapters, and for client identity: under a hop count, a
     spoofed leftmost `X-Forwarded-For` does not change `request.ip`; mounted in an
     Express host with `trust proxy` set, plugin hooks see the host-resolved address.
   - Docs whose examples use `{ app }` or `app.listen` change in the second PR so
     none breaks: `README.md`, `docs/index.md`, `api-reference.md`,
     `plugin-system.md` and `integration-cookbook.md`. Phase 4 rewrites them further.

## Phase 2 — Core hardening

Principle: embedded or standalone, core bounds its own resources (input caps, cache
caps, compile concurrency, compile-input filtering) so no request can exhaust the
process. Who may call it and how often is decided by the host app, or by the proxy in
front of the standalone server; core provides the embedding contract and a documented
recipe, not the policy (owner decision 2026-09-27). This does not make the
auth-agnostic core a tenant-isolation boundary.

1. Embedding contract, replacing the in-core rate limiter. Lands after 1.8, whose
   members it documents and tests. The docs promise a per-IP rate limiter core never
   had (Appendix A item 1). Remove the promise instead of building it: delete
   `rateLimit*` from `index.d.ts`, `runtime-spec.md` and `api-reference.md`, drop
   "rate limits" from the options sentence in `docs/index.md`, and delete
   `plugins/rate-limit` (never published). Add a `runtime-spec.md` section on
   including Rich Wind in an app: mount `core.handler` under a path prefix behind
   host middleware (an Express example, `app.use('/rw', limiter, auth,
   core.handler)`; a plain `node:http` host that routes a prefix to core strips it
   from `req.url` first), serve `core.fetch` from a Next.js App Router route handler
   with `basePath` set to the route's prefix, call the functions from Fastify and
   catch `RichWindError`, or run the standalone server behind a proxy (the nginx
   template from 6.0, with the field-tested zones of 120/min for compile and 600/min
   for the rest; the demo makes about 4 requests per keystroke). State that plugin
   routes must enforce their own access policy when they expose sensitive data or
   mutations. Tests: `core.handler` mounted under a prefix in a host Express app
   serves compile, the CSS GETs and the loader; host middleware answers before core
   runs; `core.fetch` with `basePath` serves the same routes under a prefix.
2. DROPPED 2026-09-27 (owner decision): the optional `RW_API_KEY` on the three POST
   endpoints. Access control belongs to the host app or the proxy in front (2.1
   documents how); the public browser demo could not hold a key anyway.
3. DROPPED 2026-09-27 (owner decision): middleware placement for the in-core limiter
   and API key, since neither is built. `pluginRunner.runGuard` keeps its place.
4. Compile insurance: `RW_MAX_CONCURRENT_COMPILES` (default 8), with no wait queue;
   shed immediately with 503 `SERVER_BUSY` + `Retry-After` when all slots are in use.
   Lands after 1.8: the slot check lives in `core.compile`, so direct calls are
   bounded too. A `ctx.compile` made from a hook that its parent compile awaits runs
   inside the parent's slot and takes no second one; otherwise it would be shed
   whenever its parent holds the last slot. One made from a deferred hook or a plugin
   route takes its own slot and can be shed like any other call: auto-promote defers
   its `onCompileResult`, so under full load its promotion compile gets
   `SERVER_BUSY`, which it treats as a skipped promotion. Tests for both cases.
5. `UNSAFE_CLASS_CHAR_RE` gains `{` and `}`. Regression tests: brace-expansion bomb
   via classes and via html; prose-noise html asserting `rejected: []`.
6. Threat model section in `runtime-spec.md`: defended by core (compile abuse: caps +
   concurrency cap + benchmark rationale; cache exhaustion: LRU caps; `@source
   inline` breakout: validate-before-inline + char filter; oversized, slow or
   malformed request bodies: the 1.8 body rules), delegated to the host app
   or proxy (who may call and how often, tenant auth, plugin-route access control).
   Clarify that public CSS GETs are an intentional delivery surface, and that without
   host controls anyone who can reach core can compile into and invalidate any
   project's cache. Security headers: audit-only (nosniff, Referrer-Policy,
   X-Frame-Options, CORP already present). State the known limit plainly: a
   standalone server exposed with nothing in front stays up (its resources are
   bounded) but is not fair; one client can hold every compile slot while the rest
   get 503 `SERVER_BUSY`.
7. MOVED 2026-09-27 into 1.8 (native transport): the client-identity fixes (a hop
   count or subnet list for `trustProxy`, and a mounted core using the host's
   resolved address) are built on `proxy-addr` there, with the same tests.

## Phase 3 — Packaging (npm only)

1. `files: ["services/", "plugins/"]` PLUS explicit exports subpaths:
   `./plugins/auto-promote` and `./plugins/cache-store-fs` (explicit entries over a
   `./plugins/*` pattern, per Node guidance for small public APIs).
2. Remove the Dockerfile in V1 (git history preserves it; Docker distribution is
   post-V1; a services-only Dockerfile would ship broken plugin support).
3. `pack-smoke`: install the packed tarball, import both exported plugin subpaths,
   instantiate each factory, verify unexported paths fail.
4. Align `services/index.d.ts` with post-Phase-1/2 reality (`rateLimit*` removed,
   `trustProxy` accepts a boolean, hop count or address list, `guard` hook typed,
   `ctx.compile` shape, removed aliases, the 1.8 members: `handler`, `fetch` and its
   `basePath` option, the five functions and `RichWindError`, the plugin route
   request and response; no type import from `express`).
5. Dependency hygiene: `npm audit fix` without `--force` (the Phase 0 snapshot,
   `evidence/npm-audit-2026-09-26.txt`, shows all 8 advisories fixable that way;
   production: `qs` and `body-parser` via Express, not reachable (Appendix C) and gone
   from production dependencies once 1.8 removes Express; re-snapshot the audit after
   1.8). Delete the stale `lexical-demo/package-lock.json` before Dependabot
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

1. README + `docs/index.md` follow the two visions: first what the library is and how
   to include it in an app (mounted, or standalone behind a proxy; link the 2.1
   embedding section), then AI-driven UI as the vision and flagship use case
   (`ai-runtime-styling.md` promoted to that story), with CMS, editors and previews as
   other uses. Preserve the core/wrapper boundary. State plainly that V1 uses
   Tailwind's default design system. `package.json` `description` and `keywords`
   describe a library (today: "A stateless Tailwind CSS runtime service", keywords
   `api` and `service`). Lands after 1.8, so the docs are written once against
   `core.handler`, `core.fetch` and the functions.
2. New agent quickstart: model emits HTML plus an explicit class list ->
   `POST /api/compile` -> feed explicit-input `rejected` values back to the model ->
   recompile -> serve `GET /api/css`. Explain that wrappers may parse HTML into the
   explicit class list, while core does not own that workflow. Node example + curl
   transcript, wired into `docs-examples.test.js`. Lands after 1.8 (and 1.1, which
   adds `rejected`).
3. Divergence doc fixes not already absorbed by Phase 1/2 PRs (Appendix A): design
   system loads lazily on first use (not "once at startup"); `GET /api/css`
   materializes a missing bundle from cached classes (document as behavior);
   `maxCssChars` applies to `transformCss`/resolve output too; auto-promote returns
   `[]` not `undefined` + fix test path in docs; plugin-system export examples match
   the new exports map; api-reference gains query `bundle` on CSS routes;
   suggest/invalidate alias rows dropped. Also drop the empty `<claude-mem-context>`
   block at the end of `AGENTS.md` (tool residue that would go public).
4. api-reference: error enum, `rejected` field, the functions and `RichWindError`,
   and what core enforces versus what the host enforces (no in-core rate limits or
   keys). Lands after 1.8. Verify `docs/_config.yml` renders for Pages (flip in
   Phase 5).

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
   `/docs`); set repo description/topics/homepage (library wording, matching 4.1).

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
   - The VM's startup script lives outside the repo and imports the active release;
     if it starts the server through `core.app`, the first post-1.8 release breaks it.
     Check it here; the `deploy/` template starts the server with `npm start`
     (`http.createServer(core.handler)`).
   - Settle the VM configuration for V1 features: `RW_TRUST_PROXY` as the hop count
     from 1.8 (today `1`, which means trust everything); nginx stays the demo's only
     rate limiter, so verify that its `limit_req` zones key on the real client
     address, not the tunnel's local address (the open compile endpoint is
     intentional for the demo); concurrency cap at its default.
1. Merge dev -> main (the release workflow only runs from main); `release-npm.yml`
   -> `1.0.0-rc.1` on dist-tag `next` via the explicit version input (3.7); gate:
   `npm audit --omit=dev` clean (3.5); then merge `main` back into `dev`.
2. Deploy the rc to the VM with the `deploy/` release script from 6.0 (owner picks
   the moment).

## Out of V1

- Custom compiler theme input (`@theme`), whether process-scoped or per-request (a
  v1.x headliner).
- MCP server wrapper (a separate AI-driven UI project, cheap to build later against
  the frozen contract).
- Agent orchestration, prompts, style-context manifests, correction suggestions,
  draft/revision/publish workflows, agent policy, and agent telemetry.
- Redis/S3 cacheStore adapters (interface + fs reference + cookbook recipe suffice).
- Multi-tenant auth (host wrapper's job).
- In-core rate limiting and access keys (owner decision 2026-09-27: the host app or
  the proxy in front decides who may call and how often; 2.1 documents the recipe).
- Bun and Deno support (untested; edge runtimes are impossible, see 1.8).
- Splitting `services/index.js` into modules (post-V1 refactor).
- Docker/GHCR distribution.

## Appendix A — Docs-vs-code divergence inventory

Scheduled locations in parentheses.

1. `rateLimit*` config in `index.d.ts` + `runtime-spec.md` + `api-reference.md` +
   openapi 429s: not implemented in core (Phase 2.1 removes the promise; Phase 1.2
   openapi).
2. `guard` hook implemented but absent from public types/docs (Phase 1.5).
3. `onRequestStart`/`onResponseSent` docs overpromise scope and `source` (Phase 1.5).
4. `ctx.compile()` documented shape differs from actual internal return (Phase 1.5).
5. Reader miss documented 404, actual 200 empty text/css (Phase 1.4).
6. `plugins/rate-limit` docs show a subpath import the exports map blocks;
   plugin-system says built-in plugin exports are not public (Phase 2.1 deletes the
   plugin; Phase 3.1 + Phase 4.3).
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
   different `req.ip` values; a hop count of 2 returned the real address (1.8, was
   2.7).
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
9. 1.4 reverses 64e2093 (ORB); the loader's theme stylesheet misses on a first visit
   to a new project, checked against a local core (1.4).
10. The tracked `lexical-demo/.env.production` holds the public demo hostname,
    against the EXECUTION.md rule (5.0 D3).
11. `docs/openapi.json` `info.version` is `0.0.1` (1.7).
12. `AGENTS.md` ends with an empty `<claude-mem-context>` block (4.3).
13. The rewrite changes every hash quoted in `PROGRESS.md` and in issues (5.2).
14. The 6.3 soak had no pass criteria (6.3).
15. Core always calls `app.set('trust proxy', ...)`, so a core mounted in a host app
    ignores the host's setting. Checked with a host Express app at `trust proxy` = 1:
    core's plugin hooks saw the socket address while a plain sub-app saw the
    forwarded client (1.8, was 2.7).

## Appendix C — Transport review 2026-09-27

An independent second opinion on replacing Express. Each claim was re-checked before
use, against a local core (`createCore()` listening on a random port) or against
`package-lock.json`. Scheduled locations in parentheses.

1. The compile engine never touches Express. Express appears only in the HTTP layer of
   `services/index.js` and in the auto-promote plugin's two route handlers (1.8).
2. In `package-lock.json`, Express's dependency closure is 65 packages and Tailwind's
   is 16 plus 29 optional platform binaries; they share none. An earlier figure of 41
   came from `npm ls`, which deduplicates (1.8).
3. The two production advisories (`qs`, `body-parser`) come through Express and are
   not reachable: `maxBodyBytes` is always an integer, so the `body-parser`
   invalid-limit case cannot occur, and Express 5's default query parser does not use
   `qs`. They still fail the `npm audit --omit=dev` gate (3.5, 6.1).
4. Malformed JSON on `POST /api/compile` returns 400 `text/html` (Express's error
   page), with the stack trace in the body when `NODE_ENV` is not `production`. An
   unknown path, or a GET on `/api/compile`, returns an HTML 404 (1.2, 1.8).
5. A `text/plain` body is ignored and a JSON array body is read as empty (both answer
   400 "projectId is required."); a gzip-encoded body is inflated and compiled (1.2,
   1.8).
6. Routing ignores case and a trailing slash: `/API/CSS` and `/api/css/` both return
   200 (1.8).
7. `?projectId=a&projectId=b` is rejected with a 400 today; a native parser using
   `URLSearchParams.get` would accept `a` (1.8).
8. Express answers HEAD on every GET route and adds weak ETags to the responses it
   sends, the loader scripts and JSON included; the CSS routes set explicit ETags
   (1.8).
9. `index.d.ts` imports its types from `express` (1.8, 3.4).
10. Once 1.7 freezes `{ app }` and Express-shaped `addRoute` handlers, dropping
    Express is a breaking change; the functions alone would have been additive (1.7,
    1.8).
