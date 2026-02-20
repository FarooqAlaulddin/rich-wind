import React, { useState, useCallback, useEffect } from 'react';
import Editor from './components/Editor';
import InspectorPanel from './components/InspectorPanel';
import { useMultiPageCompile } from './hooks/useMultiPageCompile';

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

export default function App() {
  const {
    projectId,
    baseCss, themeCss, utilitiesCss, fullCss,
    sharedSizes, promotedClasses,
    html, loading, cached,
    activePage, pages, pageOrder,
    initialEditorState, setEditor: hookSetEditor,
    switchPage, doCompile, addPage, deletePage, resetDemo,
  } = useMultiPageCompile();
  const [editor, setEditor] = useState(null);

  const handleEditorReady = useCallback((ed) => {
    setEditor(ed);
    hookSetEditor(ed);
  }, [hookSetEditor]);

  // Inject compiled CSS into the document head for WYSIWYG
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Lexical + Rich Wind</h1>
        <button className="reset-btn" onClick={resetDemo} title="Reset demo to defaults">Reset</button>
      </header>
      <main className="split-layout">
        <section className="editor-pane">
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
        <section className="inspector-pane">
          <InspectorPanel
            editor={editor}
            html={html}
            css={fullCss}
            baseCss={baseCss}
            themeCss={themeCss}
            utilitiesCss={utilitiesCss}
            sharedSizes={sharedSizes}
            promotedClasses={promotedClasses}
            loading={loading}
            cached={cached}
            projectId={projectId}
            activePage={activePage}
            pages={pages}
            pageOrder={pageOrder}
          />
        </section>
      </main>
    </div>
  );
}
