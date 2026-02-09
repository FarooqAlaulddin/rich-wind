import { useEffect, useRef, useState } from "react";

const baseOptions = {
  minimap: { enabled: false },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
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
      <div className="mb-2">{label}</div>
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
