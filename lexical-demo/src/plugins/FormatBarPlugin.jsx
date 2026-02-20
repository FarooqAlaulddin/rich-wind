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

export default function FormatBarPlugin() {
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

  return (
    <div className="format-bar">
      <select value={blockType} onChange={handleBlockFormat}>
        {BLOCK_FORMATS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}
