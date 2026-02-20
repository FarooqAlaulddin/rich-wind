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

function createSampleContent() {
  return JSON.stringify({
    root: {
      children: [
        {
          type: 'styled-heading',
          tag: 'h1',
          tailwindClasses: 'text-3xl font-bold text-blue-600',
          children: [{ type: 'text', text: 'Welcome to Rich Wind', format: 0, detail: 0, mode: 'normal', style: '' }],
          direction: 'ltr', format: '', indent: 0, version: 1,
        },
        {
          type: 'styled-paragraph',
          tailwindClasses: 'bg-gray-100 p-4 rounded-lg',
          children: [
            { type: 'text', text: 'This is a ', format: 0, detail: 0, mode: 'normal', style: '' },
            { type: 'tailwind-span', text: 'live-styled', tailwindClasses: 'text-emerald-600 font-semibold', format: 0, detail: 0, mode: 'normal', style: '' },
            { type: 'text', text: ' rich text editor. Edit text here, apply Tailwind classes, and see the preview update in real time.', format: 0, detail: 0, mode: 'normal', style: '' },
          ],
          direction: 'ltr', format: '', indent: 0, version: 1,
        },
        {
          type: 'styled-paragraph',
          tailwindClasses: '',
          children: [{ type: 'text', text: 'Try selecting some text and adding inline classes, or click a block and add classes using the inspector panel.', format: 0, detail: 0, mode: 'normal', style: '' }],
          direction: 'ltr', format: '', indent: 0, version: 1,
        },
      ],
      direction: 'ltr', format: '', indent: 0, type: 'root', version: 1,
    },
  });
}

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
    editorState: initialEditorState || createSampleContent(),
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
            placeholder={<div className="editor-placeholder">Start typing... then use the inspector panel to apply Tailwind classes.</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <TailwindClassPlugin onContentChange={onContentChange} />
        <EditorBridge onEditor={onEditor} />
      </LexicalComposer>
    </div>
  );
}
