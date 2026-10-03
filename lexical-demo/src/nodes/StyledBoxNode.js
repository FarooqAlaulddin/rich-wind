import { ElementNode, $applyNodeReplacement } from 'lexical';

// A container: a <div> with Tailwind classes that holds blocks and other
// containers, so a layout (a grid of cards, a card holding a number over a
// label) is a tree instead of a flat list. It is a shadow root: the caret stays
// inside it, Enter adds a paragraph in it, and Backspace never merges its
// contents into the block before it.
export class StyledBoxNode extends ElementNode {
  __tailwindClasses = '';

  static getType() {
    return 'styled-box';
  }

  static clone(node) {
    const clone = new StyledBoxNode(node.__key);
    clone.__tailwindClasses = node.__tailwindClasses;
    return clone;
  }

  getTailwindClasses() {
    return this.getLatest().__tailwindClasses;
  }

  setTailwindClasses(classes) {
    const self = this.getWritable();
    self.__tailwindClasses = classes;
  }

  createDOM() {
    const dom = document.createElement('div');
    dom.setAttribute('data-rw-box', '');
    if (this.__tailwindClasses) dom.className = this.__tailwindClasses;
    return dom;
  }

  updateDOM(prevNode, dom) {
    if (prevNode.__tailwindClasses !== this.__tailwindClasses) {
      dom.className = this.__tailwindClasses || '';
    }
    return false;
  }

  isShadowRoot() {
    return true;
  }

  canBeEmpty() {
    return false;
  }

  canIndent() {
    return false;
  }

  exportDOM() {
    const element = document.createElement('div');
    if (this.__tailwindClasses) element.className = this.__tailwindClasses;
    return { element };
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'styled-box',
      tailwindClasses: this.__tailwindClasses,
    };
  }

  static importJSON(json) {
    const node = $createStyledBoxNode();
    node.setTailwindClasses(json.tailwindClasses || '');
    return node;
  }
}

export function $createStyledBoxNode(classes = '') {
  const node = $applyNodeReplacement(new StyledBoxNode());
  if (classes) node.setTailwindClasses(classes);
  return node;
}

export function $isStyledBoxNode(node) {
  return node instanceof StyledBoxNode;
}
