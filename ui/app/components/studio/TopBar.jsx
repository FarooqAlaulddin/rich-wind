export default function TopBar() {
  return (
    <header className="play-topbar hero-grid">
      <div className="topbar-brand flex items-center gap-3">
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
          <div className="topbar-links text-xs uppercase tracking-[0.4em] text-slate-500 flex flex-wrap items-center gap-4 mt-1">
            <a href="/docs" className="text-amber-400/80 hover:text-amber-400">DOCS</a>
            <a href="https://github.com/FarooqAlaulddin/rich-wind" className="text-amber-400/80 hover:text-amber-400">GITHUB</a>
          </div>
        </div>
      </div>
        <div className="topbar-actions flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
  );
}
