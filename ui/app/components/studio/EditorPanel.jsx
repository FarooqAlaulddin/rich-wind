import MonacoField from "../MonacoField.jsx";

export default function EditorPanel({
  html, setHtml,
  classes, setClasses,
  customCss, setCustomCss,
  bundle, setBundle,
  activeTab, setActiveTab,
  onReset,
}) {
  return (
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
        <input type="hidden" name="projectId" value="demo" />
        <input type="hidden" name="pageId" value="playground" />

        <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 editor-bundle">
          Bundle
          <select
            name="bundle"
            value={bundle}
            onChange={(event) => setBundle(event.target.value)}
            className="editor-input bundle-select"
          >
            <option value="full">Full (preflight + theme + utilities)</option>
            <option value="base">Preflight only</option>
            <option value="theme">Theme tokens only</option>
            <option value="utilities">Utilities only (no theme)</option>
          </select>
        </label>

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
              onClick={onReset}
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
  );
}
