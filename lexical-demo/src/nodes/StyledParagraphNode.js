import { ParagraphNode, $applyNodeReplacement } from 'lexical';

export class StyledParagraphNode extends ParagraphNode {
  __tailwindClasses = '';

  static getType() {
    return 'styled-paragraph';
  }

  static clone(node) {
    const clone = new StyledParagraphNode(node.__key);
    clone.__tailwindClasses = node.__tailwindClasses;
    return clone;
  }

  constructor(key) {
    super(key);
  }

  getTailwindClasses() {
    return this.getLatest().__tailwindClasses;
  }

  setTailwindClasses(classes) {
    const self = this.getWritable();
    self.__tailwindClasses = classes;
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    if (this.__tailwindClasses) {
      dom.className = this.__tailwindClasses;
    }
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    const updated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__tailwindClasses !== this.__tailwindClasses) {
      dom.className = this.__tailwindClasses || '';
      return true;
    }
    return updated;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'styled-paragraph',
      tailwindClasses: this.__tailwindClasses,
    };
  }

  static importJSON(json) {
    const node = $createStyledParagraphNode();
    node.setTailwindClasses(json.tailwindClasses || '');
    return node;
  }
}

export function $createStyledParagraphNode() {
  return $applyNodeReplacement(new StyledParagraphNode());
}

export function $isStyledParagraphNode(node) {
  return node instanceof StyledParagraphNode;
}
