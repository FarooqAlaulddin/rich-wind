import { useState, useCallback } from 'preact/hooks';
import { MonacoEditor } from './MonacoEditor';
import { PaneResizer } from './PaneResizer';

export function EditorPane({
  html, classes, customCss, bundle,
  onHtmlChange, onClassesChange, onCustomCssChange, onBundleChange,
  onCompile, onCache, onProject, onReset,
  status, loading, paneResizeProps,
}) {
  const [activeTab, setActiveTab] = useState('html');
  const [activeIntent, setActiveIntent] = useState('compile');

  const handleSubmit = useCallback((intent) => {
    setActiveIntent(intent);
    if (intent === 'cache') onCache();
    else if (intent === 'project') onProject();
    else onCompile();
  }, [onCompile, onCache, onProject]);

  return (
    <div class="editor-pane" ref={paneResizeProps?.paneRef}>
      <div class="editor-header">
        <div>
          <p class="text-xs uppercase tracking-[0.4em] text-slate-400">Editor</p>
          <p class="text-lg font-semibold text-slate-50">HTML + Classes</p>
        </div>
        <span class={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${status.tone || 'bg-slate-200/10 text-slate-200'}`}>
          {status.message}
        </span>
      </div>

      <div class="editor-form">
        <label class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 editor-bundle">
          Bundle
          <select class="editor-input bundle-select" value={bundle} onChange={(e) => onBundleChange(e.target.value)}>
            <option value="full">Full (preflight + theme + utilities)</option>
            <option value="base">Preflight only</option>
            <option value="theme">Theme tokens only</option>
            <option value="utilities">Utilities only (no theme)</option>
          </select>
        </label>

        <div class="editor-tabs">
          {['html', 'classes', 'custom'].map((tab) => (
            <button
              key={tab}
              type="button"
              class={`tab-btn${activeTab === tab ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'html' ? 'HTML' : tab === 'classes' ? 'Classes' : 'Custom CSS'}
            </button>
          ))}
        </div>

        <div class="editor-body">
          <div class={`tab-panel${activeTab === 'html' ? ' is-active' : ''}`}>
            <MonacoEditor language="html" value={html} onChange={onHtmlChange} visible={activeTab === 'html'} />
          </div>
          <div class={`tab-panel${activeTab === 'classes' ? ' is-active' : ''}`}>
            <MonacoEditor language="plaintext" value={classes} onChange={onClassesChange} visible={activeTab === 'classes'} />
          </div>
          <div class={`tab-panel${activeTab === 'custom' ? ' is-active' : ''}`}>
            <MonacoEditor language="css" value={customCss} onChange={onCustomCssChange} visible={activeTab === 'custom'} />
          </div>
        </div>

        <div class="editor-footer">
          <div class="flex flex-wrap items-center gap-2">
            <button
              class={`action-btn rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900${activeIntent === 'compile' ? ' is-active' : ''}`}
              onClick={() => handleSubmit('compile')}
            >Compile</button>
            <button
              class={`action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200${activeIntent === 'cache' ? ' is-active' : ''}`}
              onClick={() => handleSubmit('cache')}
            >Load Cache</button>
            <button
              class={`action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200${activeIntent === 'project' ? ' is-active' : ''}`}
              onClick={() => handleSubmit('project')}
            >Project CSS</button>
            <button
              class="action-btn rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
              onClick={onReset}
            >Reset</button>
          </div>
          {loading && (
            <span class="rounded-full bg-amber-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900">Working</span>
          )}
        </div>
      </div>
      <PaneResizer onPointerDown={paneResizeProps?.onPointerDown} />
    </div>
  );
}
