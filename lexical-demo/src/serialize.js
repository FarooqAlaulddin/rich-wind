// Turns the editor content into the HTML Rich Wind compiles (and the Export
// view shows), plus the set of classes in it. Call inside editor.read/update.
import { $isStyledParagraphNode } from './nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from './nodes/StyledHeadingNode';
import { $isTailwindSpanNode } from './nodes/TailwindSpanNode';
import { $isStyledBoxNode } from './nodes/StyledBoxNode';

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
      addClasses(cls, classSet);
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

function addClasses(cls, classSet) {
  if (cls) cls.split(/\s+/).forEach(c => c && classSet.add(c));
}

// Blocks in document order; a container becomes a <div> around its children,
// indented one step per level so the exported HTML stays readable.
function serializeBlocks(nodes, classSet, indent) {
  let html = '';
  for (const node of nodes) {
    if ($isStyledBoxNode(node)) {
      const cls = node.getTailwindClasses();
      addClasses(cls, classSet);
      const classAttr = cls ? ` class="${escapeHtml(cls)}"` : '';
      html += `${indent}<div${classAttr}>\n${serializeBlocks(node.getChildren(), classSet, `${indent}  `)}${indent}</div>\n`;
    } else if ($isStyledParagraphNode(node) || $isStyledHeadingNode(node)) {
      const tag = getTag(node);
      const cls = node.getTailwindClasses();
      addClasses(cls, classSet);
      const inner = serializeChildren(node.getChildren(), classSet);
      const classAttr = cls ? ` class="${escapeHtml(cls)}"` : '';
      html += `${indent}<${tag}${classAttr}>${inner}</${tag}>\n`;
    } else {
      html += `${indent}<div>${escapeHtml(node.getTextContent())}</div>\n`;
    }
  }
  return html;
}

export function serializeEditor(root) {
  const classSet = new Set();
  const html = serializeBlocks(root.getChildren(), classSet, '');
  return { html, classes: Array.from(classSet) };
}
