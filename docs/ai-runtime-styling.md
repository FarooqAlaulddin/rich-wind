# AI Runtime Styling

Rich Wind's 2026 positioning is narrow on purpose:

> Runtime Tailwind infrastructure for dynamic and AI-generated UI.

AI tools make interface creation faster. They do not remove the need to compile, cache, scope, and govern CSS when the final HTML or class list is created after deploy. Rich Wind is the runtime boundary for those generated surfaces.

## Research Snapshot

As of May 2026, primary docs support these observations:

- AI coding agents are now productized workflows. v0 describes itself as an AI agent for real code and full-stack apps, OpenAI Codex can read, edit, run code, and create pull requests, GitHub Copilot cloud agent can work in the background on repository tasks, and Claude Code is documented as an agentic terminal assistant.
- AI UI generation is converging around design-system context, not replacing it. v0 supports Tailwind configs, `globals.css`, custom utilities, CSS variables, and shadcn registries. shadcn documents registries and MCP tooling so AI assistants can browse, search, and install design-system items.
- Tailwind's best default path is still static and zero-runtime. Tailwind scans source files, generates the CSS for detected classes, and writes a static stylesheet. Tailwind v4 made that static path faster and simpler with automatic content detection, CSS-first config, theme variables, and a high-performance engine.
- Runtime class generation still has a gap. Tailwind detects tokens in source files as plain text and requires complete class names to exist in the scanned content. Classes created later by users, tenants, plugins, or agents are outside that build unless they are safelisted, rebuilt, or compiled at runtime.
- Browser-only runtime Tailwind is not the production answer for every product. Tailwind's Play CDN is explicitly for development, while browser runtimes such as Twind and UnoCSS show that runtime utility compilation is useful but move compilation and governance into the client.

## Tested Hypotheses

| Hypothesis | Evidence | Result for Rich Wind |
| --- | --- | --- |
| AI makes manual class writing less valuable. | v0, Codex, Copilot, and Claude Code all document prompt-to-code or autonomous coding workflows. | Do not position Rich Wind as a class-writing helper. Position it as the CSS delivery and control layer after classes are generated. |
| AI increases the amount of dynamic UI created outside normal deploys. | v0 supports live prototypes, high-fidelity UIs from mockups, production deployment, and PR handoff. Coding agents can update code, docs, tests, and branches in the background. | Rich Wind should serve previews, CMS pages, agent-created templates, and tenant-generated pages where classes appear after the app build. |
| Design systems become more important, not less. | v0 documents design-system registries for Tailwind and shadcn; shadcn theming is based on semantic CSS variables and tokens; shadcn MCP exposes registry items to AI assistants. | Rich Wind should compile against the host system's approved theme and use plugins/wrappers for allowlists, analytics, and publishing rules. |
| Static Tailwind is still the right path for committed app UI. | Tailwind v4 emphasizes fast static generation, automatic source detection, CSS-first config, and zero-runtime output. | Rich Wind should not compete with the normal Tailwind build for source-controlled React/Next/Vite apps. |
| Dynamic runtime styling needs a server-side boundary. | Tailwind docs require complete detected class names; Play CDN is development-only; client runtimes exist but run compilation in the browser. | Rich Wind's server API, cache, project/page scoping, bundle splitting, and plugin hooks are the product wedge. |

## What This Proves

The supported claim is not "AI needs Rich Wind." Static AI-generated code can use normal Tailwind.

The supported claim is: **AI-generated or user-generated HTML needs a production CSS boundary when the class list is not known at build time.** Rich Wind can be that boundary by turning runtime class strings into compiled, cached, scoped CSS artifacts.

## How Rich Wind Helps Teams Move Faster

- **No rebuild for every preview.** Editors and agents can call `POST /api/compile` and render the result immediately.
- **A stable API contract.** Host apps send HTML/classes and get `{ css, classes, cached, hash }`, so previews and publish flows do not need to shell out to Tailwind.
- **Project/page scoping.** A tenant page, email, document, or AI draft can be compiled independently without leaking classes into unrelated surfaces.
- **Cacheable output.** Repeat previews use cached CSS, and publish flows can store project or page artifacts in a CDN/object store.
- **Policy hooks.** Plugins can observe or transform class lists and CSS, collect usage data, enforce allowlists, or resolve CSS from persistence.
- **Autocomplete for generated editors.** `/api/suggest` can power human editors and agent-facing workflows that need Tailwind suggestions from the project cache and built-in design system.

## Best-Fit Products

- AI-enabled CMS or site builders where users generate landing pages after deploy.
- Rich text or document editors with Tailwind-powered block/inline styling.
- Template and email builders that need preview CSS before publishing.
- Multi-tenant SaaS tools that let customers author branded pages.
- Agent preview sandboxes where generated HTML needs to render before a pull request or publish action.

## Non-Goals

Rich Wind should not try to be:

- An AI UI generator.
- A component registry like shadcn.
- A design-token authoring system.
- A replacement for Tailwind's normal static build.
- A security or tenant-auth system. Auth belongs in the host wrapper that supplies a safe `projectId`.

## Source Notes

- [Tailwind CSS v4.0](https://tailwindcss.com/blog/tailwindcss-v4) documents the faster static engine, automatic content detection, CSS-first configuration, and theme variables.
- [Tailwind detecting classes](https://tailwindcss.com/docs/detecting-classes-in-source-files) explains how class detection works and why complete class names must exist in scanned content.
- [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn) documents the browser CDN as development-only.
- [v0 docs](https://v0.app/docs) and [v0 design systems](https://v0.app/docs/design-systems) show AI UI generation, Tailwind support, and registry-driven design-system context.
- [shadcn theming](https://ui.shadcn.com/docs/theming), [shadcn registry](https://ui.shadcn.com/docs/registry), and [shadcn MCP](https://ui.shadcn.com/docs/mcp) show token conventions, component distribution, and agent-accessible registries.
- [OpenAI Codex](https://developers.openai.com/codex/cloud), [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), and [Claude Code](https://code.claude.com/docs/en/how-claude-code-works) show that coding agents can edit, run, and hand off code.
- [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) explains how language models can discover and invoke external tools, which supports future agent-facing wrappers around Rich Wind's HTTP API.
- [Twind](https://twind.style/installation) and [UnoCSS runtime](https://unocss.dev/integrations/runtime.html) show that runtime utility compilation is a known need, while Rich Wind's stance is server-side compilation, caching, and project scoping.
