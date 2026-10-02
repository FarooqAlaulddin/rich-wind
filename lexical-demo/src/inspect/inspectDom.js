// DOM helpers for the inspect mode. The editor tree is flat: top-level blocks
// (paragraph, heading) that may contain tailwind-span elements. Lexical wraps
// plain text in span[data-lexical-text]; those are not user elements.

const THEME_CLASS = /^(editor-|selection-preserve)/;

export function isUserElement(el, root) {
  if (!el || el === root || el.nodeType !== 1) return false;
  if (el.parentElement === root) return true;
  // A styled inline span renders its classes on Lexical's text span itself, so a
  // text span counts when it carries classes; bare text spans are only noise.
  return el.tagName === 'SPAN' && (!el.hasAttribute('data-lexical-text') || classesOf(el).length > 0);
}

/** Ancestor chain from the outermost block down to `el` (inclusive). */
export function chainOf(root, el) {
  const chain = [];
  let node = el && el.nodeType === 1 ? el : el?.parentElement;
  while (node && node !== root) {
    if (!root.contains(node)) return [];
    if (isUserElement(node, root)) chain.unshift(node);
    node = node.parentElement;
  }
  return chain;
}

export function pathOf(root, el) {
  const path = [];
  let node = el;
  while (node && node !== root) {
    const parent = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return path;
}

export function resolvePath(root, path) {
  let node = root;
  for (const index of path) {
    node = node?.children[index];
    if (!node) return null;
  }
  return node === root ? null : node;
}

export function classesOf(el) {
  return (el?.className || '')
    .toString()
    .split(/\s+/)
    .filter((c) => c && !THEME_CLASS.test(c));
}

export function describe(el) {
  if (!el) return null;
  const isBlock = el.parentElement?.getAttribute('contenteditable') === 'true';
  // innerText keeps the breaks between laid-out items (a flex row of links); jsdom has only textContent.
  const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    tag: el.tagName.toLowerCase(),
    kind: isBlock ? 'block' : 'span',
    classes: classesOf(el),
    text: text.length > 48 ? `${text.slice(0, 48)}...` : text,
  };
}

/**
 * The element an inspect gesture should target: the nearest ancestor (or self)
 * that carries user classes, falling back to the top-level block. This skips
 * Lexical's bare text spans and classless spans, which are only noise.
 */
export function targetFor(root, node) {
  const chain = chainOf(root, node);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (classesOf(chain[i]).length > 0) return chain[i];
  }
  return chain[0] || null;
}
