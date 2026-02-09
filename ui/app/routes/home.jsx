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
.preview-shell {
  border-radius: 24px;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.8));
  padding: 28px;
}`;

export default function Home() {
  const [projectId, setProjectId] = useState("richwind-studio");
  const [pageId, setPageId] = useState("hero");
  const [html, setHtml] = useState(sampleHtml);
  const [classes, setClasses] = useState(sampleClasses);
  const [customCss, setCustomCss] = useState(sampleCustomCss);

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

  return (
    <main className="min-h-screen pb-16">
      <header className="hero-grid border-b border-black/10">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-6 px-2 py-6">
          <div className="flex items-center gap-3">
            <div className="animate-float flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white shadow-lg">
              RW
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                Stateless Tailwind Runtime
              </p>
              <p className="text-2xl font-semibold">Rich Wind Studio</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="rounded-full border border-black/10 bg-white/70 px-4 py-2">
              HTMX-driven
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-4 py-2">
              No database
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-4 py-2">
              In-memory cache
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1680px] px-2 pt-5">
        <div className="glass-panel mb-3 flex flex-wrap items-center justify-between gap-4 rounded-3xl px-4 py-2 text-sm text-slate-600">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Workspace
            </p>
            <p className="text-lg font-semibold text-slate-800">
              Live Compile Studio
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2">
              <input
                id="auto-compile"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 accent-black"
              />
              <label htmlFor="auto-compile" className="text-xs font-semibold">
                Auto-compile
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2">
              <input
                id="compact-mode"
                type="checkbox"
                className="h-4 w-4 accent-black"
              />
              <label htmlFor="compact-mode" className="text-xs font-semibold">
                Compact
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1">
              <button
                type="button"
                data-layout="split"
                className="layout-btn is-active"
              >
                Split
              </button>
              <button type="button" data-layout="editor" className="layout-btn">
                Focus Editor
              </button>
              <button type="button" data-layout="output" className="layout-btn">
                Focus Output
              </button>
              <a
                href="/preview"
                target="_blank"
                rel="noreferrer"
                className="layout-btn"
              >
                Open Preview
              </a>
            </div>
          </div>
        </div>

        <div
          id="studio-grid"
          className="studio-grid gap-3"
          suppressHydrationWarning
        >
          <div className="studio-input glass-panel rounded-3xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                  Inputs
                </p>
                <p className="text-lg font-semibold">Editor + Controls</p>
              </div>
              <span
                id="status-pill"
                className="rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700"
              >
                Ready
              </span>
            </div>

            <form
              id="compile-form"
              className="mt-5 space-y-6"
              hx-post="/htmx/compile"
              hx-target="#htmx-target"
              hx-swap="innerHTML"
              hx-indicator="#compile-indicator"
              hx-trigger="submit"
              hx-sync="this:replace"
            >
              <input type="hidden" name="_autoIntent" value="compile" />
              <input type="hidden" id="intent-field" name="intent" value="compile" />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-600">
                  Project ID
                  <input
                    name="projectId"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                    placeholder="project-id"
                  />
                </label>
                <label className="text-sm font-medium text-slate-600">
                  Page ID
                  <input
                    name="pageId"
                    value={pageId}
                    onChange={(event) => setPageId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                    placeholder="page-id"
                  />
                </label>
              </div>

              <MonacoField
                name="html"
                label="HTML Editor"
                value={html}
                onChange={setHtml}
                language="html"
                height="420px"
                rows={10}
                placeholder="<section class='...'>...</section>"
                ariaLabel="HTML editor"
              />

              <MonacoField
                name="classes"
                label="Tailwind Classes"
                value={classes}
                onChange={setClasses}
                language="css"
                height="170px"
                rows={3}
                placeholder="text-sm text-amber-600 bg-white/70 ..."
                ariaLabel="Tailwind classes editor"
              />

              <MonacoField
                name="customCss"
                label="Custom CSS"
                value={customCss}
                onChange={setCustomCss}
                language="css"
                height="240px"
                rows={5}
                placeholder=".btn { border-radius: 999px; }"
                ariaLabel="Custom CSS editor"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="action-btn rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
                  data-intent="compile"
                  type="submit"
                >
                  Compile
                </button>
                <button
                  className="action-btn rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-semibold text-slate-700"
                  data-intent="cache"
                  type="submit"
                >
                  Load Cache
                </button>
                <button
                  className="action-btn rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-semibold text-slate-700"
                  data-intent="project"
                  type="submit"
                >
                  Project CSS
                </button>
                <button
                  className="action-btn rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-semibold text-slate-700"
                  type="button"
                  onClick={handleReset}
                >
                  Reset
                </button>
                <span
                  id="compile-indicator"
                  className="rounded-full bg-amber-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900 opacity-0"
                >
                  Working
                </span>
              </div>

              <div id="htmx-target" className="hidden" />
            </form>
          </div>

          <div id="splitter" className="splitter" aria-hidden="true" />

          <div className="studio-output space-y-4">
            <div className="glass-panel rounded-3xl p-4">
              <div className="flex items-center justify-between">
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
              <iframe
                id="preview-frame"
                title="Preview"
                className="mt-4 h-[480px] w-full rounded-2xl border border-slate-200 bg-white"
                sandbox="allow-same-origin"
                srcDoc={`<!doctype html><html><body style="font-family:Space Grotesk,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;background:#f8fafc;">Compile to render preview.</body></html>`}
                suppressHydrationWarning
              />
              <div id="preview-data" className="hidden" />
            </div>

            <div className="glass-panel rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                    Output
                  </p>
                  <p className="text-lg font-semibold">Generated CSS</p>
                </div>
                <span
                  id="cache-badge"
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  Awaiting compile
                </span>
              </div>
              <div
                id="css-output"
                className="mt-4 rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-xs text-slate-200"
              >
                <pre className="font-mono whitespace-pre-wrap break-words">
                  Compile to see CSS output.
                </pre>
              </div>
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Extracted Classes
                </p>
                <div id="class-list" className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                    No classes yet
                  </span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
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
                  <p
                    id="stat-hash"
                    className="font-mono mt-2 text-xs text-slate-700"
                  >
                    --
                  </p>
                  <p id="stat-run" className="mt-1 text-xs text-slate-400">
                    Awaiting compile
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
