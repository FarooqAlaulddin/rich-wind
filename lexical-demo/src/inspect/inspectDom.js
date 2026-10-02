// DOM helpers for the inspect mode. The editor holds blocks (paragraph,
// heading) that may contain tailwind-span elements, and containers
// (div[data-rw-box]) that hold blocks and other containers. Lexical wraps
// plain text in span[data-lexical-text]; those are not user elements.

const THEME_CLASS = /^(editor-|selection-preserve)/;

const isBox = (el) => !!el && el.nodeType === 1 && el.hasAttribute('data-rw-box');

export function isUserElement(el, root) {
  if (!el || el === root || el.nodeType !== 1) return false;
  const parent = el.parentElement;
  if (parent === root || isBox(el) || isBox(parent)) return true;
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
  const isBlock = el.parentElement?.getAttribute('contenteditable') === 'true' || isBox(el) || isBox(el.parentElement);
  // innerText keeps the breaks between laid-out items (a flex row of links); jsdom has only textContent.
  const text = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    tag: el.tagName.toLowerCase(),
    kind: isBlock ? 'block' : 'span',
    box: isBox(el),
    classes: classesOf(el),
    text: text.length > 48 ? `${text.slice(0, 48)}...` : text,
  };
}

/**
 * The element an inspect gesture should target: the innermost block or
 * container, or a styled span inside it. Lexical's bare text spans and
 * classless spans are skipped, as they are only noise.
 */
export function targetFor(root, node) {
  const chain = chainOf(root, node);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].tagName !== 'SPAN' || classesOf(chain[i]).length > 0) return chain[i];
  }
  return chain[0] || null;
}

/** The innermost block or container around `node` (never a span). */
export function blockFor(root, node) {
  const chain = chainOf(root, node);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].tagName !== 'SPAN') return chain[i];
  }
  return null;
}
