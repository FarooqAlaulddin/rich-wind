import React, { useState, useCallback, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { $setBlocksType, $copyBlockFormatIndent } from '@lexical/selection';
import { $createStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $createStyledHeadingNode, $isStyledHeadingNode } from '../nodes/StyledHeadingNode';
import { PRESETS } from '../blocks';
import { insertBlock } from '../editorActions';

// Changing the block type replaces the node; carry its Tailwind classes over
// so a styled heading keeps its look when it becomes a paragraph, and back.
function $keepClasses(from, to) {
  $copyBlockFormatIndent(from, to);
  if (typeof from.getTailwindClasses === 'function' && typeof to.setTailwindClasses === 'function') {
    to.setTailwindClasses(from.getTailwindClasses());
  }
}

const BLOCK_FORMATS = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'h5', label: 'Heading 5' },
  { value: 'h6', label: 'Heading 6' },
];

export default function FormatBarPlugin({ pages, pageOrder, activePage, onPageSwitch, onAddPage, onDeletePage }) {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState('paragraph');

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const anchor = selection.anchor.getNode();
        const parent = anchor.getTopLevelElement();
        if ($isStyledHeadingNode(parent)) {
          setBlockType(parent.getTag());
        } else {
          setBlockType('paragraph');
        }
      });
    });
  }, [editor]);

  const handleBlockFormat = useCallback((e) => {
    const value = e.target.value;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (value === 'paragraph') {
        $setBlocksType(selection, () => $createStyledParagraphNode(), $keepClasses);
      } else {
        $setBlocksType(selection, () => $createStyledHeadingNode(value), $keepClasses);
      }
    });
  }, [editor]);

  const handleInsert = useCallback((e) => {
    const preset = PRESETS.find((p) => p.id === e.target.value);
    e.target.value = '';
    if (!preset) return;
    insertBlock(editor, preset.node());
    editor.focus();
  }, [editor]);

  const canDelete = pageOrder && pageOrder.length > 1;

  return (
    <div className="format-bar">
      {pages && pageOrder && (
        <div className="page-tabs">
          {pageOrder.map(id => {
            const page = pages[id];
            if (!page) return null;
            return (
              <div key={id} className={`page-tab${id === activePage ? ' active' : ''}`}>
                <button className="page-tab-label" onClick={() => onPageSwitch(id)}>
                  {page.label}
                  {page.cssSize > 0 && (
                    <span className="page-tab-kb" title={id === activePage ? 'Page CSS from the last compile' : 'Page CSS from this page\'s last compile'}>
                      {(page.cssSize / 1024).toFixed(1)} KB
                    </span>
                  )}
                </button>
                {canDelete && (
                  <button
                    className="page-tab-delete"
                    onClick={(e) => { e.stopPropagation(); onDeletePage(id); }}
                    title={`Delete ${page.label}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="page-tab-add" onClick={onAddPage} title="Add page" aria-label="Add page">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </div>
      )}
      <span className="block-select-wrap">
        <select className="block-select" value={blockType} onChange={handleBlockFormat} aria-label="Block format">
          {BLOCK_FORMATS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <svg className="block-select-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </span>
      <span className="block-select-wrap">
        <select className="block-select" value="" onChange={handleInsert} aria-label="Insert" title="Add a container, columns or cards after the block at the caret">
          <option value="" disabled>Insert</option>
          {PRESETS.map(p => (
            <option key={p.id} value={p.id} title={p.hint}>{p.label}</option>
          ))}
        </select>
        <svg className="block-select-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </span>
    </div>
  );
}
