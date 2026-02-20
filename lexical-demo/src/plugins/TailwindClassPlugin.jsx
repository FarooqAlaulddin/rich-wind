import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { $isStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from '../nodes/StyledHeadingNode';
import { $isTailwindSpanNode } from '../nodes/TailwindSpanNode';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';

function getTag(node) {
  if ($isStyledHeadingNode(node)) return node.getTag();
  if ($isStyledParagraphNode(node)) return 'p';
  return 'div';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serializeChildren(children, classSet) {
  let html = '';
  for (const child of children) {
    if ($isTailwindSpanNode(child)) {
      const cls = child.getTailwindClasses();
      if (cls) cls.split(/\s+/).forEach(c => c && classSet.add(c));
      const text = escapeHtml(child.getTextContent());
      html += cls ? `<span class="${escapeHtml(cls)}">${text}</span>` : text;
    } else if (child.getType && child.getType() === 'linebreak') {
      html += '<br/>';
    } else {
      html += escapeHtml(child.getTextContent());
    }
  }
  return html;
}

function serializeEditor(root) {
  const classSet = new Set();
  let html = '';

  for (const node of root.getChildren()) {
    if ($isStyledParagraphNode(node) || $isStyledHeadingNode(node)) {
      const tag = getTag(node);
      const cls = node.getTailwindClasses();
      if (cls) cls.split(/\s+/).forEach(c => c && classSet.add(c));
      const inner = serializeChildren(node.getChildren(), classSet);
      const classAttr = cls ? ` class="${escapeHtml(cls)}"` : '';
      html += `<${tag}${classAttr}>${inner}</${tag}>\n`;
    } else {
      html += `<div>${escapeHtml(node.getTextContent())}</div>\n`;
    }
  }

  return { html, classes: Array.from(classSet) };
}

export default function TailwindClassPlugin({ onContentChange }) {
  const [editor] = useLexicalComposerContext();
  const debouncedChange = useDebouncedCallback(onContentChange, 400);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const { html, classes } = serializeEditor(root);
        debouncedChange({ html, classes });
      });
    });
  }, [editor, debouncedChange]);

  return null;
}
