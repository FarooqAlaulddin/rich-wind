import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Editor from './components/Editor';
import StylePanel from './components/StylePanel';
import RichWindStrip from './components/RichWindStrip';
import ExamplesMenu from './components/ExamplesMenu';
import { useMultiPageCompile } from './hooks/useMultiPageCompile';
import { useThemeMode } from './hooks/useThemeMode';
import { removeRejectedClasses, loadEditorState } from './editorActions';
import { collectUsedClasses } from './usedClasses';

const PAGE_STYLE_ID = 'rw-editor-css';

function ensureStyleTag(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

function WindMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 13h15a3 3 0 1 1-3 3" />
      <path d="M3 18h7a2 2 0 1 1-2 2" />
    </svg>
  );
}

export default function App() {
  const {
    projectId,
    baseCss, themeCss, utilitiesCss, fullCss,
    sharedSizes, promotedClasses, promoteStats,
    lastResult, error,
    html, loading,
    activePage, pages, pageOrder,
    initialEditorState, setEditor: hookSetEditor,
    switchPage, doCompile, addPage, deletePage, resetDemo,
  } = useMultiPageCompile();
  const [editor, setEditor] = useState(null);
  const [stripView, setStripView] = useState(null);
  const { isDark, toggle: toggleTheme } = useThemeMode();

  const handleEditorReady = useCallback((ed) => {
    setEditor(ed);
    hookSetEditor(ed);
  }, [hookSetEditor]);

  // Inject compiled CSS into the document head so the editor is WYSIWYG
  useEffect(() => {
    ensureStyleTag(PAGE_STYLE_ID).textContent = fullCss;
  }, [fullCss]);

  const handleContentChange = useCallback(({ html: newHtml, classes }) => {
    doCompile({ html: newHtml, classes });
  }, [doCompile]);

  const handlePageSwitch = useCallback((pageId) => {
    switchPage(pageId, editor);
  }, [switchPage, editor]);

  const handleAddPage = useCallback(() => {
    addPage(editor);
  }, [addPage, editor]);

  const handleDeletePage = useCallback((pageId) => {
    deletePage(pageId, editor);
  }, [deletePage, editor]);

  const handleExample = useCallback((example) => {
    loadEditorState(editor, example.state);
  }, [editor]);

  const used = useMemo(() => collectUsedClasses(html, pages), [html, pages]);

  const handleRemoveRejected = useCallback(() => {
    removeRejectedClasses(editor, lastResult.rejected);
  }, [editor, lastResult]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <WindMark />
          <div className="brand-text">
            <span className="brand-name">Rich Wind</span>
            <span className="brand-tagline">Tailwind compiled at runtime. No build step.</span>
          </div>
        </div>
        <div className="header-actions">
          <ExamplesMenu onPick={handleExample} />
          <button
            type="button"
            className={`btn btn-icon${stripView === 'export' ? ' is-on' : ''}`}
            onClick={() => setStripView((v) => (v === 'export' ? null : 'export'))}
            title="Standalone export, shown in the Rich Wind strip"
          >
            Export
          </button>
          <button type="button" className="btn btn-icon" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="btn btn-icon" onClick={resetDemo} title="Reset the demo to its sample pages">
            Reset
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="editor-pane" aria-label="Editor">
          <Editor
            onContentChange={handleContentChange}
            onEditor={handleEditorReady}
            initialEditorState={initialEditorState}
            pages={pages}
            pageOrder={pageOrder}
            activePage={activePage}
            onPageSwitch={handlePageSwitch}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
          />
        </section>
        <aside className="panel" aria-label="Style panel">
          <StylePanel editor={editor} used={used} css={fullCss} rejected={lastResult.rejected} promoted={promotedClasses} loading={loading} />
        </aside>
        <RichWindStrip
          view={stripView}
          onView={setStripView}
          html={html}
          projectId={projectId}
          activePage={activePage}
          baseCss={baseCss}
          themeCss={themeCss}
          utilitiesCss={utilitiesCss}
          fullCss={fullCss}
          promotedClasses={promotedClasses}
          lastResult={lastResult}
          error={error}
          loading={loading}
          onRemoveRejected={handleRemoveRejected}
        />
      </main>
    </div>
  );
}
