import React, { useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ParagraphNode } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { StyledParagraphNode } from '../nodes/StyledParagraphNode';
import { StyledHeadingNode } from '../nodes/StyledHeadingNode';
import { TailwindSpanNode } from '../nodes/TailwindSpanNode';
import FormatBarPlugin from '../plugins/FormatBarPlugin';
import TailwindClassPlugin from '../plugins/TailwindClassPlugin';
import SelectionPreservePlugin from '../plugins/SelectionPreservePlugin';
import InspectPlugin from '../plugins/InspectPlugin';

const EDITOR_THEME = {
  paragraph: 'editor-paragraph',
  heading: {
    h1: 'editor-h1',
    h2: 'editor-h2',
    h3: 'editor-h3',
    h4: 'editor-h4',
    h5: 'editor-h5',
    h6: 'editor-h6',
  },
  text: {
    bold: 'editor-bold',
    italic: 'editor-italic',
    underline: 'editor-underline',
  },
};

function onError(error) {
  console.error('Lexical error:', error);
}

const EMPTY_STATE = JSON.stringify({
  root: {
    children: [{ type: 'styled-paragraph', tailwindClasses: '', children: [], direction: 'ltr', format: '', indent: 0, version: 1 }],
    direction: 'ltr', format: '', indent: 0, type: 'root', version: 1,
  },
});

function EditorBridge({ onEditor }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);
  return null;
}

export default function Editor({
  onContentChange,
  onEditor,
  initialEditorState,
  pages,
  pageOrder,
  activePage,
  onPageSwitch,
  onAddPage,
  onDeletePage,
}) {
  const initialConfig = {
    namespace: 'RichWindLexical',
    theme: EDITOR_THEME,
    onError,
    editorState: initialEditorState || EMPTY_STATE,
    nodes: [
      StyledParagraphNode,
      StyledHeadingNode,
      TailwindSpanNode,
      {
        replace: ParagraphNode,
        with: () => new StyledParagraphNode(),
      },
      {
        replace: HeadingNode,
        with: (node) => new StyledHeadingNode(node.getTag()),
      },
    ],
  };

  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={initialConfig}>
        <FormatBarPlugin
          pages={pages}
          pageOrder={pageOrder}
          activePage={activePage}
          onPageSwitch={onPageSwitch}
          onAddPage={onAddPage}
          onDeletePage={onDeletePage}
        />
        <div className="editor-scroller">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<div className="editor-placeholder">Click any text, then use Make it on the right. Styles compile as you go.</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <InspectPlugin />
        </div>
        <HistoryPlugin />
        <SelectionPreservePlugin />
        <TailwindClassPlugin onContentChange={onContentChange} />
        <EditorBridge onEditor={onEditor} />
      </LexicalComposer>
    </div>
  );
}
