import React, { useState, useEffect, useCallback } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
} from 'lexical';
import { $isStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from '../nodes/StyledHeadingNode';
import { $isTailwindSpanNode, $createTailwindSpanNode } from '../nodes/TailwindSpanNode';
import AutocompletePlugin from '../plugins/AutocompletePlugin';
import PreviewFrame from './PreviewFrame';

const BLOCK_TYPE_LABELS = {
  paragraph: 'Paragraph',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
};

export default function InspectorPanel({ editor, html, css, loading, cached }) {
  const [blockType, setBlockType] = useState('paragraph');
  const [blockClasses, setBlockClasses] = useState([]);
  const [isInlineMode, setIsInlineMode] = useState(false);
  const [inlineClasses, setInlineClasses] = useState([]);
  const [selectionText, setSelectionText] = useState('');
  const [targetNodeKey, setTargetNodeKey] = useState(null);
  const [addValue, setAddValue] = useState('');

  useEffect(() => {
    if (!editor) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor.getNode();
        const focus = selection.focus.getNode();
        const parent = anchor.getTopLevelElement();

        // Block type
        if ($isStyledHeadingNode(parent)) {
          setBlockType(parent.getTag());
        } else {
          setBlockType('paragraph');
        }

        // Block classes
        if ($isStyledParagraphNode(parent) || $isStyledHeadingNode(parent)) {
          const cls = parent.getTailwindClasses() || '';
          setBlockClasses(cls ? cls.split(/\s+/).filter(Boolean) : []);
        } else {
          setBlockClasses([]);
        }

        // Inline mode detection
        const isCollapsed = selection.isCollapsed();
        const selectedText = selection.getTextContent();

        if (!isCollapsed && selectedText.length > 0) {
          setIsInlineMode(true);
          setSelectionText(selectedText);

          // Check if either end of selection is in a TailwindSpanNode
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
          // Modify existing TailwindSpanNode
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
          // Wrap selection in new TailwindSpanNode
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
            <span key={cls} className="class-chip">
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

      <div className="inspector-section preview-section">
        <div className="inspector-subheader">PREVIEW</div>
        <div className="preview-container">
          <PreviewFrame html={html} css={css} />
        </div>
      </div>
    </div>
  );
}
