import { useEffect, useRef, useState } from "react";

const baseOptions = {
  minimap: { enabled: false },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 8,
  glyphMargin: false,
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on",
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
  wordWrap: "on",
  smoothScrolling: true,
  padding: { top: 16, bottom: 16 },
  overviewRulerBorder: false,
  renderLineHighlight: "gutter",
  renderValidationDecorations: "off",
  automaticLayout: true,
  readOnly: false,
  domReadOnly: false,
};

export default function MonacoField({
  name,
  label,
  value,
  onChange,
  language,
  height,
  rows = 10,
  placeholder,
  ariaLabel,
  hideLabel = false,
  enableSuggest = false,
  suggestMode = "classes",
}) {
  const [Editor, setEditor] = useState(null);
  const hiddenRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    import("@monaco-editor/react").then((mod) => {
      if (mounted) setEditor(() => mod.default);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleMount = (editor, monaco) => {
    if (!enableSuggest || !monaco) return;
    const key = `rw-suggest:${language}:${suggestMode}`;
    if (!window.__rwSuggestProviders) {
      window.__rwSuggestProviders = {};
    }
    const providerRegistered = Boolean(window.__rwSuggestProviders[key]);
    if (!providerRegistered) {
      window.__rwSuggestProviders[key] = true;
    }

    function extractPrefix(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const upto = line.slice(0, position.column - 1);
      if (suggestMode === "html") {
        const classIndex = Math.max(
          upto.lastIndexOf("class="),
          upto.lastIndexOf("className=")
        );
        if (classIndex === -1) return "";
        const slice = upto.slice(classIndex);
        const quoteMatch = slice.match(/class(Name)?=\s*["']/);
        if (!quoteMatch) return "";
        const quote = quoteMatch[0].includes('"') ? '"' : "'";
        const value = slice.slice(quoteMatch[0].length);
        if (value.includes(quote)) return "";
        const parts = value.split(/\s+/);
        return parts[parts.length - 1] || "";
      }
      const parts = upto.split(/\s+/);
      return parts[parts.length - 1] || "";
    }

    function isLikelyClassContext(model, position) {
      if (suggestMode !== "html") return true;
      const line = model.getLineContent(position.lineNumber);
      const upto = line.slice(0, position.column - 1);
      const classIndex = Math.max(upto.lastIndexOf("class="), upto.lastIndexOf("className="));
      if (classIndex === -1) return false;
      const slice = upto.slice(classIndex);
      const quoteMatch = slice.match(/class(Name)?=\s*["']/);
      if (!quoteMatch) return false;
      const quote = quoteMatch[0].includes('"') ? '"' : "'";
      const after = slice.slice(quoteMatch[0].length);
      return !after.includes(quote);
    }

    function setDebug(message) {
      const node = document.getElementById("suggest-debug");
      if (node) node.textContent = message;
    }

    setDebug("Suggestions: mounted");

    async function fetchSuggestions(prefix) {
      try {
        const form = document.getElementById("compile-form");
        if (!form) return [];
        const data = new FormData(form);
        const projectId = data.get("projectId") || "";
        const classes = data.get("classes") || "";
        const cacheKey = `${projectId}|${prefix}|${String(classes).length}`;
        if (!window.__rwSuggestCache) {
          window.__rwSuggestCache = new Map();
        }
        if (window.__rwSuggestCache.has(cacheKey)) {
          return window.__rwSuggestCache.get(cacheKey);
        }
        setDebug(`Suggestions: fetching "${prefix}"`);
        const response = await fetch("/api/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            prefix,
            classes,
            limit: 50,
          }),
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const suggestions = Array.isArray(payload?.suggestions)
          ? payload.suggestions
          : [];
        window.__rwSuggestCache.set(cacheKey, suggestions);
        setDebug(`Suggestions: "${prefix}" → ${suggestions.length}`);
        return suggestions;
      } catch (error) {
        setDebug("Suggestions: error");
        return [];
      }
    }

    if (!window.__rwSuggestState) {
      window.__rwSuggestState = { prefix: "", items: [] };
    }

    let suggestTimer = null;
    let lastPrefix = "";
    let lastCount = -1;
    async function requestSuggestions() {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;
      if (!isLikelyClassContext(model, position)) return;
      const prefix = extractPrefix(model, position);
      if (!prefix || prefix.length < 1) {
        setDebug(`Suggestions: prefix ""`);
        return;
      }
      if (prefix === lastPrefix && lastCount >= 0) {
        return;
      }
      setDebug(`Suggestions: prefix "${prefix}"`);
      const list = await fetchSuggestions(prefix);
      lastPrefix = prefix;
      lastCount = list.length;
      window.__rwSuggestState = { prefix, items: list };
      if (list.length) {
        editor.trigger("keyboard", "editor.action.triggerSuggest", {});
      }
    }

    editor.onDidChangeModelContent(() => {
      if (!enableSuggest) return;
      setDebug("Suggestions: typing");
      clearTimeout(suggestTimer);
      suggestTimer = setTimeout(() => {
        requestSuggestions();
      }, 120);
    });

    if (!providerRegistered) {
      monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: ["-", ":", "/", "[", ".", '"', "'", "!"],
        provideCompletionItems: async (model, position) => {
          if (!isLikelyClassContext(model, position)) {
            return { suggestions: [] };
          }
          const prefix = extractPrefix(model, position);
          if (!prefix || prefix.length < 1) {
            return { suggestions: [] };
          }
          const state = window.__rwSuggestState || { prefix: "", items: [] };
          const list =
            state.prefix === prefix
              ? state.items
              : (await fetchSuggestions(prefix));
          if (!list.length) return { suggestions: [] };
          const startColumn = position.column - (prefix ? prefix.length : 0);
          const range = new monaco.Range(
            position.lineNumber,
            startColumn,
            position.lineNumber,
            position.column
          );
          return {
            suggestions: list.map((item) => ({
              label: item,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: item,
              range,
            })),
            incomplete: true,
          };
        },
      });
    }
  };

  const handleChange = (next) => {
    const safeValue = next ?? "";
    onChange(safeValue);
    requestAnimationFrame(() => {
      if (hiddenRef.current) {
        hiddenRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  };

  return (
    <div className="block text-sm font-medium text-slate-600">
      {!hideLabel && label ? <div className="mb-2">{label}</div> : null}
      <input ref={hiddenRef} type="hidden" name={name} value={value} readOnly />
      <div className="editor-shell">
        {Editor ? (
          <Editor
            height={height}
            language={language}
            value={value}
            onChange={handleChange}
            options={baseOptions}
            theme="vs-dark"
            onMount={handleMount}
          />
        ) : (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            className="font-mono w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 shadow-sm"
            placeholder={placeholder}
            aria-label={ariaLabel}
          />
        )}
      </div>
    </div>
  );
}
