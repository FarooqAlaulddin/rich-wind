import React, { useState, useCallback, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $createStyledHeadingNode, $isStyledHeadingNode } from '../nodes/StyledHeadingNode';

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
        $setBlocksType(selection, () => $createStyledParagraphNode());
      } else {
        $setBlocksType(selection, () => $createStyledHeadingNode(value));
      }
    });
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
          <button className="page-tab-add" onClick={onAddPage} title="Add page">+</button>
        </div>
      )}
      <select value={blockType} onChange={handleBlockFormat}>
        {BLOCK_FORMATS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}
