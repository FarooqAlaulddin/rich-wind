import React, { useState, useCallback } from 'react';
import Editor from './components/Editor';
import InspectorPanel from './components/InspectorPanel';
import { useCompile } from './hooks/useCompile';

export default function App() {
  const { css, html, loading, cached, doCompile } = useCompile();
  const [editor, setEditor] = useState(null);

  const handleContentChange = useCallback(({ html: newHtml, classes }) => {
    doCompile({ html: newHtml, classes });
  }, [doCompile]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Lexical + Rich Wind</h1>
      </header>
      <main className="split-layout">
        <section className="editor-pane">
          <Editor onContentChange={handleContentChange} onEditor={setEditor} />
        </section>
        <section className="inspector-pane">
          <InspectorPanel
            editor={editor}
            html={html}
            css={css}
            loading={loading}
            cached={cached}
          />
        </section>
      </main>
    </div>
  );
}
