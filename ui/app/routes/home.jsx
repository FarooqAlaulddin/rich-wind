import { useEffect, useState } from "react";
import MonacoField from "../components/MonacoField.jsx";

export function meta() {
  return [
    { title: "Rich Wind - Stateless Tailwind Runtime" },
    {
      name: "description",
      content:
        "Compile Tailwind CSS from live HTML or class lists with an in-memory cache.",
    },
  ];
}

const sampleHtml = `<section class="rounded-3xl border border-white/20 bg-slate-950/85 p-6 text-slate-100 shadow-2xl">
  <div class="flex items-center gap-3">
    <span class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300 text-slate-900 font-bold">RW</span>
    <div>
      <h2 class="text-2xl font-semibold">Rich Wind Preview</h2>
      <p class="text-sm text-slate-300">Live compiled Tailwind from the editor.</p>
    </div>
  </div>
  <p class="mt-4 text-base leading-relaxed text-slate-200">
    Treat HTML as data. Tailwind classes are extracted on the fly, compiled,
    and returned as CSS without a database.
  </p>
  <div class="mt-5 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-slate-300">
    <span class="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-200">Inline Classes</span>
    <span class="rounded-full bg-sky-400/20 px-3 py-1 text-sky-200">LRU Cache</span>
    <span class="rounded-full bg-amber-300/20 px-3 py-1 text-amber-200">Stateless</span>
  </div>
  <div class="mt-6 flex items-center gap-3">
    <button class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
      Publish Styles
    </button>
    <button class="rounded-full border border-white/30 px-4 py-2 text-sm text-white/80">
      View Tokens
    </button>
  </div>
</section>`;

const sampleClasses =
  "text-sm uppercase tracking-[0.18em] text-amber-600 bg-white/70 px-3 py-1 rounded-full shadow-md";

const sampleCustomCss = `/* Optional: add custom CSS on top of compiled output */
/* Example: @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap'); */
:root {
  --rw-preview-font: "Space Grotesk", system-ui, sans-serif;
  --rw-preview-bg: #0f172a;
  --rw-preview-fg: #e2e8f0;
  --rw-preview-pad: 28px;
}
body {
  margin: 0;
  font-family: var(--rw-preview-font);
  background: var(--rw-preview-bg);
  color: var(--rw-preview-fg);
  padding: var(--rw-preview-pad);
}
.preview-shell {
  border-radius: 24px;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.8));
  padding: 28px;
}
.rw-preview-empty {
  border: 1px dashed rgba(148, 163, 184, 0.4);
  padding: 24px;
  text-align: center;
  color: rgba(148, 163, 184, 0.9);
  border-radius: 16px;
}`;

export default function Home() {
  const [projectId, setProjectId] = useState("richwind-studio");
  const [pageId, setPageId] = useState("hero");
  const [html, setHtml] = useState(sampleHtml);
  const [classes, setClasses] = useState(sampleClasses);
  const [customCss, setCustomCss] = useState(sampleCustomCss);
  const [activeTab, setActiveTab] = useState("html");
  const [outputTab, setOutputTab] = useState("preview");

  const handleReset = () => {
    setProjectId("richwind-studio");
    setPageId("hero");
    setHtml(sampleHtml);
    setClasses(sampleClasses);
    setCustomCss(sampleCustomCss);
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rw-editor-state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.projectId) setProjectId(parsed.projectId);
        if (parsed.pageId) setPageId(parsed.pageId);
        if (parsed.html) setHtml(parsed.html);
        if (parsed.classes) setClasses(parsed.classes);
        if (parsed.customCss) setCustomCss(parsed.customCss);
      }
    } catch (error) {
      console.error("Failed to load editor state", error);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          "rw-editor-state",
          JSON.stringify({ projectId, pageId, html, classes, customCss })
        );
      } catch (error) {
        console.error("Failed to save editor state", error);
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [projectId, pageId, html, classes, customCss]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (error) {
        console.error("Failed to refresh layout", error);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, [activeTab]);

  return (
    <main className="play-shell">
      <header className="play-topbar hero-grid">
        <div className="flex items-center gap-3">
          <div className="animate-float flex h-14 w-14 items-center justify-center rounded-3xl shadow-lg">
            <img
              src="/rw-icon-128.png"
              alt="Rich Wind"
              className="h-12 w-12"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
              Stateless Tailwind Runtime
            </p>
            <p className="text-xl font-semibold">Rich Wind Studio</p>
          </div>
        </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <label className="topbar-toggle">
              <input
                id="auto-compile"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 accent-black"
              />
              <span>Auto-compile</span>
            </label>
            <label className="topbar-toggle">
              <input id="compact-mode" type="checkbox" className="h-4 w-4 accent-black" />
              <span>Compact</span>
            </label>
            <label className="topbar-toggle">
              <input id="theme-toggle" type="checkbox" className="h-4 w-4 accent-black" />
              <span>Dark mode</span>
            </label>
            <div className="topbar-group" suppressHydrationWarning>
              <button
                type="button"
                data-layout="split"
                className="layout-btn is-active"
                suppressHydrationWarning
              >
                Split
              </button>
              <button
                type="button"
                data-layout="editor"
                className="layout-btn"
                suppressHydrationWarning
              >
                Editor
              </button>
              <button
                type="button"
                data-layout="output"
                className="layout-btn"
                suppressHydrationWarning
              >
                Preview
              </button>
              <button
                type="button"
                data-layout="collapsed"
                className="layout-btn"
                suppressHydrationWarning
              >
                Collapse
              </button>
              <button type="button" id="reset-panes" className="layout-btn">
                Reset Size
              </button>
              <a href="/preview" target="_blank" rel="noreferrer" className="layout-btn">
                Open Preview
              </a>
            </div>
        </div>
      </header>

      <section className="play-body" suppressHydrationWarning>
        <div id="studio-grid" className="studio-grid" suppressHydrationWarning>
        <div className="editor-pane">
          <div className="editor-header">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                Editor
              </p>
              <p className="text-lg font-semibold text-slate-50">HTML + Classes</p>
            </div>
            <span
              id="status-pill"
              className="rounded-full bg-slate-200/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
            >
              Ready
            </span>
          </div>
          <div id="suggest-debug" className="suggest-debug">
            Suggestions: idle
          </div>

          <form
            id="compile-form"
            className="editor-form"
            hx-post="/htmx/compile"
            hx-target="#htmx-target"
            hx-swap="innerHTML"
            hx-indicator="#compile-indicator"
            hx-trigger="submit"
            hx-sync="this:replace"
          >
            <input type="hidden" name="_autoIntent" value="compile" />
            <input type="hidden" id="intent-field" name="intent" value="compile" />

            <div className="editor-identifiers">
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">
                Project
                <input
                  name="projectId"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="editor-input"
                  placeholder="project-id"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300">
                Page
                <input
                  name="pageId"
                  value={pageId}
                  onChange={(event) => setPageId(event.target.value)}
                  className="editor-input"
                  placeholder="page-id"
                />
              </label>
            </div>

            <div className="editor-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === "html" ? "is-active" : ""}`}
                onClick={() => setActiveTab("html")}
              >
                HTML
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === "classes" ? "is-active" : ""}`}
                onClick={() => setActiveTab("classes")}
              >
                Classes
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === "custom" ? "is-active" : ""}`}
                onClick={() => setActiveTab("custom")}
              >
                Custom CSS
              </button>
            </div>

            <div className="editor-body">
              <div className={`tab-panel ${activeTab === "html" ? "is-active" : ""}`}>
                <MonacoField
                  name="html"
                  label="HTML Editor"
                  value={html}
                  onChange={setHtml}
                  language="html"
                  height="100%"
                  rows={10}
                  placeholder="<section class='...'>...</section>"
                  ariaLabel="HTML editor"
                  hideLabel
                  enableSuggest
                  suggestMode="html"
                />
              </div>
              <div
                className={`tab-panel ${activeTab === "classes" ? "is-active" : ""}`}
              >
                <MonacoField
                  name="classes"
                  label="Tailwind Classes"
                  value={classes}
                  onChange={setClasses}
                  language="css"
                  height="100%"
                  rows={3}
                  placeholder="text-sm text-amber-600 bg-white/70 ..."
                  ariaLabel="Tailwind classes editor"
                  hideLabel
                  enableSuggest
                  suggestMode="classes"
                />
              </div>
              <div
                className={`tab-panel ${activeTab === "custom" ? "is-active" : ""}`}
              >
                <MonacoField
                  name="customCss"
                  label="Custom CSS"
                  value={customCss}
                  onChange={setCustomCss}
                  language="css"
                  height="100%"
                  rows={5}
                  placeholder=".btn { border-radius: 999px; }"
                  ariaLabel="Custom CSS editor"
                  hideLabel
                />
              </div>
            </div>

            <div className="editor-footer">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="action-btn rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900"
                  data-intent="compile"
                  type="submit"
                >
                  Compile
                </button>
                <button
                  className="action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                  data-intent="cache"
                  type="submit"
                >
                  Load Cache
                </button>
                <button
                  className="action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                  data-intent="project"
                  type="submit"
                >
                  Project CSS
                </button>
                <button
                  className="action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                  type="button"
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
              <span
                id="compile-indicator"
                className="rounded-full bg-amber-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900 opacity-0"
              >
                Working
              </span>
            </div>

            <div id="htmx-target" className="hidden" />
          </form>
          <div className="pane-resizer" data-pane-resizer="editor" aria-hidden="true" />
        </div>

        <div id="splitter" className="splitter" aria-hidden="true" />

        <div className="preview-pane">
          <div className="preview-header">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                Preview
              </p>
              <p className="text-lg font-semibold">Live Render</p>
            </div>
            <span
              id="preview-badge"
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
            >
              Awaiting compile
            </span>
          </div>
          <div className="preview-tabs">
            <button
              type="button"
              className={`preview-tab-btn ${outputTab === "preview" ? "is-active" : ""}`}
              onClick={() => setOutputTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`preview-tab-btn ${outputTab === "css" ? "is-active" : ""}`}
              onClick={() => setOutputTab("css")}
            >
              Generated CSS
            </button>
            <button
              type="button"
              className={`preview-tab-btn ${outputTab === "info" ? "is-active" : ""}`}
              onClick={() => setOutputTab("info")}
            >
              Info
            </button>
          </div>

          <div className="preview-body">
            <div
              className={`preview-panel ${outputTab === "preview" ? "is-active" : ""}`}
            >
              <div className="preview-canvas">
                <iframe
                  id="preview-frame"
                  title="Preview"
                  className="preview-frame"
                  sandbox="allow-same-origin allow-scripts"
                  srcDoc={`<!doctype html><html><body>Compile to render preview.</body></html>`}
                  suppressHydrationWarning
                />
                <div id="preview-data" className="hidden" />
              </div>
            </div>

            <div
              className={`preview-panel css-panel ${outputTab === "css" ? "is-active" : ""}`}
            >
              <div className="panel-header">
                <p className="panel-title text-xs uppercase tracking-[0.3em] text-slate-400">
                  CSS Output
                </p>
                <div className="panel-actions">
                  <span
                    id="cache-badge"
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Awaiting compile
                  </span>
                  <button type="button" id="copy-css-btn" className="copy-btn">
                    Copy CSS
                  </button>
                </div>
              </div>
              <div
                id="css-output"
                className="rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-xs text-slate-200"
              >
                <pre className="font-mono whitespace-pre-wrap break-words">
                  Compile to see CSS output.
                </pre>
              </div>
            </div>

            <div
              className={`preview-panel info-panel ${outputTab === "info" ? "is-active" : ""}`}
            >
              <div className="panel-header">
                <p className="panel-title text-xs uppercase tracking-[0.3em] text-slate-400">
                  Metrics + Classes
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Extracted Classes
                </p>
                <div id="class-list" className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                    No classes yet
                  </span>
                </div>
              </div>

              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Classes
                  </p>
                  <p
                    id="stat-class-count"
                    className="mt-2 text-lg font-semibold text-slate-900"
                  >
                    --
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    CSS size
                  </p>
                  <p
                    id="stat-css-size"
                    className="mt-2 text-lg font-semibold text-slate-900"
                  >
                    --
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Cache key
                  </p>
                  <p id="stat-hash" className="font-mono mt-2 text-xs text-slate-700">
                    --
                  </p>
                  <p id="stat-run" className="mt-1 text-xs text-slate-400">
                    Awaiting compile
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="pane-resizer" data-pane-resizer="preview" aria-hidden="true" />
        </div>
        </div>

        <section className="api-showcase">
          <div className="api-header">
            <div>
              <div className="api-title">Live API Telemetry</div>
              <div className="api-subtitle">
                Real-time request/response snapshots from the Rich Wind core.
              </div>
            </div>
            <span className="api-status api-live">
              <span className="api-live-dot" />
              Watching
            </span>
          </div>

          <div className="api-grid">
            <div>
              <div className="api-column-title">Requests</div>

              <div className="api-card" data-api-kind="compile" data-api-role="request">
                <div className="api-card-header">
                  <span className="api-endpoint">POST /api/compile</span>
                  <div className="api-card-actions">
                    <span id="api-compile-time" className="api-time">Idle</span>
                    <button type="button" className="api-action" data-api-action="curl" data-api-target="api-compile-request">Curl</button>
                    <button type="button" className="api-action" data-api-action="copy" data-api-target="api-compile-request">Copy</button>
                  </div>
                </div>
                <pre id="api-compile-request" className="api-code">
                  Awaiting compile request.
                </pre>
              </div>

              <div className="api-card" data-api-kind="cache" data-api-role="request">
                <div className="api-card-header">
                  <span className="api-endpoint">GET /api/css</span>
                  <div className="api-card-actions">
                    <span id="api-cache-time" className="api-time">Idle</span>
                    <button type="button" className="api-action" data-api-action="curl" data-api-target="api-cache-request">Curl</button>
                    <button type="button" className="api-action" data-api-action="copy" data-api-target="api-cache-request">Copy</button>
                  </div>
                </div>
                <pre id="api-cache-request" className="api-code">
                  Awaiting cache request.
                </pre>
              </div>

              <div className="api-card" data-api-kind="project" data-api-role="request">
                <div className="api-card-header">
                  <span className="api-endpoint">GET /api/projects/:id/css</span>
                  <div className="api-card-actions">
                    <span id="api-project-time" className="api-time">Idle</span>
                    <button type="button" className="api-action" data-api-action="curl" data-api-target="api-project-request">Curl</button>
                    <button type="button" className="api-action" data-api-action="copy" data-api-target="api-project-request">Copy</button>
                  </div>
                </div>
                <pre id="api-project-request" className="api-code">
                  Awaiting project request.
                </pre>
              </div>

              <div className="api-card" data-api-kind="suggest" data-api-role="request">
                <div className="api-card-header">
                  <span className="api-endpoint">POST /api/suggest</span>
                  <div className="api-card-actions">
                    <span id="api-suggest-time" className="api-time">Idle</span>
                    <button type="button" className="api-action" data-api-action="curl" data-api-target="api-suggest-request">Curl</button>
                    <button type="button" className="api-action" data-api-action="copy" data-api-target="api-suggest-request">Copy</button>
                  </div>
                </div>
                <pre id="api-suggest-request" className="api-code">
                  Awaiting suggest request.
                </pre>
              </div>
            </div>

            <div>
              <div className="api-column-title">Responses</div>

              <div className="api-card" data-api-kind="compile" data-api-role="response">
                <div className="api-card-header">
                  <span className="api-endpoint">/api/compile</span>
                  <div className="api-card-actions">
                    <span id="api-compile-status" className="api-status">—</span>
                  </div>
                </div>
                <pre id="api-compile-response" className="api-code">
                  Awaiting compile response.
                </pre>
              </div>

              <div className="api-card" data-api-kind="cache" data-api-role="response">
                <div className="api-card-header">
                  <span className="api-endpoint">/api/css</span>
                  <div className="api-card-actions">
                    <span id="api-cache-status" className="api-status">—</span>
                  </div>
                </div>
                <pre id="api-cache-response" className="api-code">
                  Awaiting cache response.
                </pre>
              </div>

              <div className="api-card" data-api-kind="project" data-api-role="response">
                <div className="api-card-header">
                  <span className="api-endpoint">/api/projects/:id/css</span>
                  <div className="api-card-actions">
                    <span id="api-project-status" className="api-status">—</span>
                  </div>
                </div>
                <pre id="api-project-response" className="api-code">
                  Awaiting project response.
                </pre>
              </div>

              <div className="api-card" data-api-kind="suggest" data-api-role="response">
                <div className="api-card-header">
                  <span className="api-endpoint">/api/suggest</span>
                  <div className="api-card-actions">
                    <span id="api-suggest-status" className="api-status">—</span>
                  </div>
                </div>
                <pre id="api-suggest-response" className="api-code">
                  Awaiting suggest response.
                </pre>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
