export function TopBar({ autoCompile, onAutoCompileChange, compact, onCompactChange, dark, onDarkChange, layout, onLayoutChange }) {
  return (
    <header class="play-topbar hero-grid">
      <div class="topbar-brand flex items-center gap-3">
        <div class="animate-float flex h-14 w-14 items-center justify-center rounded-3xl shadow-lg">
          <img src="/rich-wind/demo/rw-icon-128.png" alt="Rich Wind" class="h-12 w-12" />
        </div>
        <div>
          <p class="text-xs uppercase tracking-[0.4em] text-slate-500">Stateless Tailwind Runtime</p>
          <p class="text-xl font-semibold">Rich Wind Studio</p>
          <div class="topbar-links text-xs uppercase tracking-[0.4em] text-slate-500 flex flex-wrap items-center gap-4 mt-1">
            <a href="/rich-wind/demo/docs" class="text-amber-400/80 hover:text-amber-400">DOCS</a>
            <a href="https://github.com/FarooqAlaulddin/rich-wind" class="text-amber-400/80 hover:text-amber-400">GITHUB</a>
          </div>
        </div>
      </div>
      <div class="topbar-actions flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <label class="topbar-toggle">
          <input type="checkbox" checked={autoCompile} onChange={(e) => onAutoCompileChange(e.target.checked)} class="h-4 w-4 accent-black" />
          <span>Auto-compile</span>
        </label>
        <label class="topbar-toggle">
          <input type="checkbox" checked={compact} onChange={(e) => onCompactChange(e.target.checked)} class="h-4 w-4 accent-black" />
          <span>Compact</span>
        </label>
        <label class="topbar-toggle">
          <input type="checkbox" checked={dark} onChange={(e) => onDarkChange(e.target.checked)} class="h-4 w-4 accent-black" />
          <span>Dark mode</span>
        </label>
        <div class="topbar-group">
          {['split', 'editor', 'output', 'collapsed'].map((mode) => (
            <button
              key={mode}
              type="button"
              class={`layout-btn${layout === mode ? ' is-active' : ''}`}
              onClick={() => onLayoutChange(mode)}
            >
              {mode === 'split' ? 'Split' : mode === 'editor' ? 'Editor' : mode === 'output' ? 'Preview' : 'Collapse'}
            </button>
          ))}
          <button
            type="button"
            class="layout-btn"
            onClick={() => {
              document.querySelectorAll('.editor-pane, .preview-pane').forEach((p) => { p.style.height = ''; });
              document.body.classList.remove('pane-resized');
              try { localStorage.removeItem('rw-editor-height'); localStorage.removeItem('rw-preview-height'); } catch { /* ignore */ }
            }}
          >
            Reset Size
          </button>
        </div>
      </div>
    </header>
  );
}
