import { $applyNodeReplacement } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';

export class StyledHeadingNode extends HeadingNode {
  __tailwindClasses = '';

  static getType() {
    return 'styled-heading';
  }

  static clone(node) {
    const clone = new StyledHeadingNode(node.__tag, node.__key);
    clone.__tailwindClasses = node.__tailwindClasses;
    return clone;
  }

  constructor(tag, key) {
    super(tag, key);
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
      type: 'styled-heading',
      tailwindClasses: this.__tailwindClasses,
    };
  }

  static importJSON(json) {
    const node = $createStyledHeadingNode(json.tag || 'h1');
    node.setTailwindClasses(json.tailwindClasses || '');
    return node;
  }
}

export function $createStyledHeadingNode(tag) {
  return $applyNodeReplacement(new StyledHeadingNode(tag));
}

export function $isStyledHeadingNode(node) {
  return node instanceof StyledHeadingNode;
}
