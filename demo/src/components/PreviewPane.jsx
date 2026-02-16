import { useState, useCallback } from 'preact/hooks';
import { PreviewFrame } from './PreviewFrame';
import { PaneResizer } from './PaneResizer';

export function PreviewPane({ preview, css, cacheBadge, classes, stats, paneResizeProps }) {
  const [activeTab, setActiveTab] = useState('preview');

  const copyCss = useCallback(async () => {
    if (!css) return;
    try {
      await navigator.clipboard.writeText(css);
    } catch { /* ignore */ }
  }, [css]);

  return (
    <div class="preview-pane" ref={paneResizeProps?.paneRef}>
      <div class="preview-header">
        <div>
          <p class="text-xs uppercase tracking-[0.4em] text-slate-500">Preview</p>
          <p class="text-lg font-semibold">Live Render</p>
        </div>
        <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          {preview ? 'Live preview' : 'Awaiting compile'}
        </span>
      </div>

      <div class="preview-tabs">
        {['preview', 'css', 'info'].map((tab) => (
          <button
            key={tab}
            type="button"
            class={`preview-tab-btn${activeTab === tab ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'preview' ? 'Preview' : tab === 'css' ? 'Generated CSS' : 'Info'}
          </button>
        ))}
      </div>

      <div class="preview-body">
        {/* Preview Panel */}
        <div class={`preview-panel${activeTab === 'preview' ? ' is-active' : ''}`}>
          <div class="preview-canvas">
            <PreviewFrame preview={preview} />
          </div>
        </div>

        {/* CSS Output Panel */}
        <div class={`preview-panel css-panel${activeTab === 'css' ? ' is-active' : ''}`}>
          <div class="panel-header">
            <p class="panel-title text-xs uppercase tracking-[0.3em] text-slate-400">CSS Output</p>
            <div class="panel-actions">
              <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {cacheBadge}
              </span>
              <button type="button" class="copy-btn" onClick={copyCss}>Copy CSS</button>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-xs text-slate-200">
            <pre class="font-mono whitespace-pre-wrap break-words">{css || 'Compile to see CSS output.'}</pre>
          </div>
        </div>

        {/* Info Panel */}
        <div class={`preview-panel info-panel${activeTab === 'info' ? ' is-active' : ''}`}>
          <div class="panel-header">
            <p class="panel-title text-xs uppercase tracking-[0.3em] text-slate-400">Metrics + Classes</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Extracted Classes</p>
            <div class="mt-3 flex flex-wrap gap-2">
              {(classes || []).length > 0
                ? classes.map((cls) => (
                    <span key={cls} class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">{cls}</span>
                  ))
                : <span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">No classes yet</span>}
            </div>
          </div>
          <div class="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Classes</p>
              <p class="mt-2 text-lg font-semibold text-slate-900">{stats.classCount}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-400">CSS size</p>
              <p class="mt-2 text-lg font-semibold text-slate-900">{stats.cssSize}</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Cache key</p>
              <p class="font-mono mt-2 text-xs text-slate-700">{stats.hash}</p>
              <p class="mt-1 text-xs text-slate-400">{stats.runLabel}</p>
            </div>
          </div>
        </div>
      </div>
      <PaneResizer onPointerDown={paneResizeProps?.onPointerDown} />
    </div>
  );
}
