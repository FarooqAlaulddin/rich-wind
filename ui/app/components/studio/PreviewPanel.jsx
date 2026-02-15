export default function PreviewPanel({ outputTab, setOutputTab }) {
  return (
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
  );
}
