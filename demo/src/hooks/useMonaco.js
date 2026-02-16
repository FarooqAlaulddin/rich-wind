import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { fetchSuggestions } from '../api';

const MONACO_VERSION = '0.49.0';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}`;
const SUGGEST_TRIGGER_CHARS = ['-', ':', '/', '[', '.', '"', "'", '!'];

let monacoPromise = null;
let suggestProvidersRegistered = false;
const suggestCache = {};

function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    if (window.monaco) { resolve(window.monaco); return; }

    function loadEditor() {
      window.require.config({ paths: { vs: `${CDN_BASE}/min/vs` } });
      window.require(['vs/editor/editor.main'], () => {
        resolve(window.monaco);
      });
    }

    if (window.require?.config) { loadEditor(); return; }

    const script = document.createElement('script');
    script.src = `${CDN_BASE}/min/vs/loader.js`;
    script.onload = loadEditor;
    script.onerror = () => reject(new Error('Monaco loader failed'));
    document.head.appendChild(script);
  });
  return monacoPromise;
}

function extractClassPrefix(model, position, mode) {
  const line = model.getLineContent(position.lineNumber);
  const col = position.column - 1;
  if (mode === 'html') {
    const before = line.slice(0, col);
    const attrMatch = before.match(/(?:class|className)\s*=\s*["']([^"']*)$/i);
    if (!attrMatch) return null;
    const inside = attrMatch[1];
    const tokens = inside.split(/\s+/);
    return tokens[tokens.length - 1] || '';
  }
  const textBefore = line.slice(0, col);
  const parts = textBefore.split(/\s+/);
  return parts[parts.length - 1] || '';
}

function registerSuggestProviders(monaco, getProjectId, getClasses) {
  if (suggestProvidersRegistered) return;
  suggestProvidersRegistered = true;

  function register(language, mode) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: SUGGEST_TRIGGER_CHARS,
      provideCompletionItems: async (model, position) => {
        const prefix = extractClassPrefix(model, position, mode);
        if (prefix === null || !prefix) return { suggestions: [] };

        const projectId = getProjectId() || 'demo';
        const classes = getClasses() || '';
        const cacheKey = `${projectId}|${prefix}|${classes.length}`;

        let items = suggestCache[cacheKey];
        if (!items) {
          items = await fetchSuggestions({ projectId, prefix, classes }).catch(() => []);
          suggestCache[cacheKey] = items;
        }

        return {
          incomplete: true,
          suggestions: items.map((item, i) => ({
            label: item,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: item,
            sortText: String(i).padStart(5, '0'),
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column - prefix.length,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          })),
        };
      },
    });
  }

  register('html', 'html');
  register('plaintext', 'classes');
}

export function clearSuggestCache() {
  Object.keys(suggestCache).forEach((k) => delete suggestCache[k]);
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 8,
  glyphMargin: false,
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  fontSize: 13,
  lineHeight: 20,
  fontFamily: 'DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  wordWrap: 'on',
  smoothScrolling: true,
  padding: { top: 16, bottom: 16 },
  overviewRulerBorder: false,
  renderLineHighlight: 'gutter',
  renderValidationDecorations: 'off',
  automaticLayout: true,
};

export function useMonacoEditor(containerRef, { language, value, onChange }) {
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    loadMonaco().then((monaco) => {
      if (disposed || !containerRef.current) return;

      const editor = monaco.editor.create(containerRef.current, {
        ...EDITOR_OPTIONS,
        value,
        language,
        theme: 'vs-dark',
      });

      editor.onDidChangeModelContent(() => {
        const next = editor.getValue();
        onChangeRef.current?.(next);
      });

      editorRef.current = editor;
      setReady(true);
    });

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [containerRef, language]);

  const setValue = useCallback((val) => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== val) {
      editor.setValue(val);
    }
  }, []);

  const layout = useCallback(() => {
    editorRef.current?.layout();
  }, []);

  return { editor: editorRef, ready, setValue, layout };
}

export { loadMonaco, registerSuggestProviders };
