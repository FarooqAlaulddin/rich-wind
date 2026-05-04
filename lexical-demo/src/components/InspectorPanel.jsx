import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
} from 'lexical';
import { $isStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from '../nodes/StyledHeadingNode';
import { $isTailwindSpanNode, $createTailwindSpanNode } from '../nodes/TailwindSpanNode';
import AutocompletePlugin from '../plugins/AutocompletePlugin';
import { CORE_BASE } from '../api';

const BLOCK_TYPE_LABELS = {
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
};

function formatKB(bytes) {
  if (!bytes) return '0 KB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function AnimatedSize({ bytes }) {
  const ref = useRef(null);
  const prevRef = useRef(bytes);

  useEffect(() => {
    if (prevRef.current === bytes) return;
    const el = ref.current;
    if (!el) return;
    el.classList.remove('size-bump');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('size-bump');
    prevRef.current = bytes;
  }, [bytes]);

  return <span ref={ref} className="bundle-size">{formatKB(bytes)}</span>;
}

function BundleRow({ name, bytes, cssText, className }) {
  const [open, setOpen] = useState(false);
  const hasCss = cssText && cssText.length > 0;

  return (
    <div className={className}>
      <button className="bundle-row-toggle" onClick={() => hasCss && setOpen(v => !v)}>
        <span className="bundle-name">{name}</span>
        <span className="bundle-row-right">
          <AnimatedSize bytes={bytes} />
          {hasCss && <span className="bundle-chevron">{open ? '\u25B4' : '\u25BE'}</span>}
        </span>
      </button>
      {open && hasCss && (
        <pre className="bundle-css-preview">{cssText}</pre>
      )}
    </div>
  );
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getExportCoreBase() {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(CORE_BASE)) return CORE_BASE;
  if (typeof window === 'undefined') return CORE_BASE;
  return new URL(CORE_BASE || '/', window.location.origin).href.replace(/\/+$/, '');
}

function buildExportHtml(html, projectId, activePage) {
  const coreBase = getExportCoreBase();
  const loaderSrc = `${coreBase}/richwind-loader.js`;
  const reloadSrc = `${coreBase}/richwind-reload.js`;
  const loaderScript = `<script
    defer
    src="${escapeAttr(loaderSrc)}"
    data-project-id="${escapeAttr(projectId || '')}"
    data-page-id="${escapeAttr(activePage || '')}"
  ></script>`;
  const reloadScript = `<script
    defer
    src="${escapeAttr(reloadSrc)}"
  ></script>`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${loaderScript}
  ${reloadScript}
</head>
<body>
${(html || '').trim().split('\n').map(l => '  ' + l).join('\n')}
</body>
</html>`;
}

export default function InspectorPanel({
  editor,
  html,
  css,
  baseCss,
  themeCss,
  utilitiesCss,
  sharedSizes,
  promotedClasses,
  loading,
  cached,
  projectId,
  activePage,
  pages,
  pageOrder,
}) {
  const [blockType, setBlockType] = useState('paragraph');
  const [blockClasses, setBlockClasses] = useState([]);
  const [isInlineMode, setIsInlineMode] = useState(false);
  const [inlineClasses, setInlineClasses] = useState([]);
  const [selectionText, setSelectionText] = useState('');
  const [targetNodeKey, setTargetNodeKey] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!editor) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor.getNode();
        const focus = selection.focus.getNode();
        const parent = anchor.getTopLevelElement();

        if ($isStyledHeadingNode(parent)) {
          setBlockType(parent.getTag());
        } else {
          setBlockType('paragraph');
        }

        if ($isStyledParagraphNode(parent) || $isStyledHeadingNode(parent)) {
          const cls = parent.getTailwindClasses() || '';
          setBlockClasses(cls ? cls.split(/\s+/).filter(Boolean) : []);
        } else {
          setBlockClasses([]);
        }

        const isCollapsed = selection.isCollapsed();
        const selectedText = selection.getTextContent();

        if (!isCollapsed && selectedText.length > 0) {
          setIsInlineMode(true);
          setSelectionText(selectedText);

          const spanNode = $isTailwindSpanNode(anchor) ? anchor
            : $isTailwindSpanNode(focus) ? focus : null;

          if (spanNode) {
            setTargetNodeKey(spanNode.getKey());
            const cls = spanNode.getTailwindClasses() || '';
            setInlineClasses(cls ? cls.split(/\s+/).filter(Boolean) : []);
          } else {
            setTargetNodeKey(null);
            setInlineClasses([]);
          }
        } else {
          setIsInlineMode(false);
          setSelectionText('');
          setTargetNodeKey(null);
          setInlineClasses([]);
        }
      });
    });
  }, [editor]);

  const currentClasses = isInlineMode ? inlineClasses : blockClasses;

  const wordCount = selectionText ? selectionText.split(/\s+/).filter(Boolean).length : 0;
  const contextLabel = isInlineMode
    ? `Selection (${wordCount} word${wordCount !== 1 ? 's' : ''})`
    : BLOCK_TYPE_LABELS[blockType] || 'Paragraph';

  const handleAddClass = useCallback((cls) => {
    if (!cls || !editor) return;

    if (isInlineMode) {
      editor.update(() => {
        if (targetNodeKey) {
          const node = $getNodeByKey(targetNodeKey);
          if ($isTailwindSpanNode(node)) {
            const existing = node.getTailwindClasses() || '';
            const classes = existing ? existing.split(/\s+/).filter(Boolean) : [];
            if (!classes.includes(cls)) {
              classes.push(cls);
              node.setTailwindClasses(classes.join(' '));
            }
          }
        } else {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed()) {
            const text = selection.getTextContent();
            const span = $createTailwindSpanNode(text);
            span.setTailwindClasses(cls);
            selection.insertNodes([span]);
          }
        }
      });
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const anchor = selection.anchor.getNode();
        const parent = anchor.getTopLevelElement();
        if ($isStyledParagraphNode(parent) || $isStyledHeadingNode(parent)) {
          const existing = parent.getTailwindClasses() || '';
          const classes = existing ? existing.split(/\s+/).filter(Boolean) : [];
          if (!classes.includes(cls)) {
            classes.push(cls);
            parent.setTailwindClasses(classes.join(' '));
          }
        }
      });
    }

    setAddValue('');
  }, [editor, isInlineMode, targetNodeKey]);

  const handleRemoveClass = useCallback((classToRemove) => {
    if (!editor) return;

    if (isInlineMode && targetNodeKey) {
      editor.update(() => {
        const node = $getNodeByKey(targetNodeKey);
        if ($isTailwindSpanNode(node)) {
          const existing = node.getTailwindClasses() || '';
          const classes = existing.split(/\s+/).filter(c => c && c !== classToRemove);
          node.setTailwindClasses(classes.join(' '));
        }
      });
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const anchor = selection.anchor.getNode();
        const parent = anchor.getTopLevelElement();
        if ($isStyledParagraphNode(parent) || $isStyledHeadingNode(parent)) {
          const existing = parent.getTailwindClasses() || '';
          const classes = existing.split(/\s+/).filter(c => c && c !== classToRemove);
          parent.setTailwindClasses(classes.join(' '));
        }
      });
    }
  }, [editor, isInlineMode, targetNodeKey]);

  const promotedSet = new Set(promotedClasses || []);
  const pageUtilitiesTotal = (pageOrder || []).reduce((sum, id) => sum + (pages?.[id]?.cssSize || 0), 0);
  const sharedTotal = (sharedSizes?.base || 0) + (sharedSizes?.theme || 0);
  const total = sharedTotal + pageUtilitiesTotal;
  const exportHtml = buildExportHtml(html, projectId, activePage);

  return (
    <div className="inspector-panel">
      <div className="inspector-section">
        <div className="inspector-header">
          <span className="inspector-label">STYLING</span>
          <span className="inspector-separator">&mdash;</span>
          <span className="inspector-context">{contextLabel}</span>
          <div className="compile-status">
            {loading && <span className="status-dot status-loading" title="Compiling..." />}
            {!loading && cached && <span className="status-dot status-cached" title="Cached" />}
            {!loading && !cached && css && <span className="status-dot status-fresh" title="Compiled" />}
          </div>
        </div>

        <div className="class-chips">
          {currentClasses.map(cls => (
            <span key={cls} className={`class-chip${promotedSet.has(cls) ? ' class-chip-promoted' : ''}`}>
              {cls}
              <button className="chip-remove" onClick={() => handleRemoveClass(cls)}>&times;</button>
            </span>
          ))}
          {currentClasses.length === 0 && (
            <span className="no-classes">No classes applied</span>
          )}
        </div>

        <div className="add-class-row">
          <AutocompletePlugin
            value={addValue}
            onChange={setAddValue}
            onAdd={handleAddClass}
            placeholder="Add class..."
          />
        </div>
      </div>

      <div className="inspector-section bundle-section">
        <div className="inspector-subheader">BUNDLES</div>
        <div className="bundle-sizes">
          <BundleRow
            name="Base (shared)"
            bytes={sharedSizes?.base || 0}
            cssText={baseCss}
            className="bundle-row"
          />
          <BundleRow
            name="Theme (shared)"
            bytes={sharedSizes?.theme || 0}
            cssText={themeCss}
            className="bundle-row"
          />
          {(pageOrder || []).map(id => {
            const page = pages?.[id];
            if (!page) return null;
            const isActive = id === activePage;
            return (
              <BundleRow
                key={id}
                name={`${page.label} (utilities)`}
                bytes={page.cssSize || 0}
                cssText={isActive ? utilitiesCss : null}
                className={`bundle-row${isActive ? ' bundle-active' : ''}`}
              />
            );
          })}
          <div className="bundle-row bundle-total">
            <span className="bundle-name">Total</span>
            <AnimatedSize bytes={total} />
          </div>
        </div>
      </div>

      <div className="inspector-section export-section">
        <button className="export-toggle" onClick={() => setExportOpen(v => !v)}>
          <span className="inspector-subheader" style={{ marginBottom: 0 }}>EXPORT</span>
          <span className="export-chevron">{exportOpen ? '\u25B4' : '\u25BE'}</span>
        </button>
        {exportOpen && (
          <div className="export-content">
            <pre className="export-code">{exportHtml}</pre>
            <div className="export-actions">
              <button
                className="export-btn"
                onClick={() => {
                  navigator.clipboard.writeText(exportHtml);
                  setCopied('html');
                  setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === 'html' ? 'Copied!' : 'Copy HTML'}
              </button>
              <button
                className="export-btn"
                onClick={() => {
                  navigator.clipboard.writeText(css || '');
                  setCopied('css');
                  setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === 'css' ? 'Copied!' : 'Copy CSS'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
