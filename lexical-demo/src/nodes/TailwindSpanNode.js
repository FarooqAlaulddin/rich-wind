import { TextNode, $applyNodeReplacement } from 'lexical';

export class TailwindSpanNode extends TextNode {
  __tailwindClasses = '';

  static getType() {
    return 'tailwind-span';
  }

  static clone(node) {
    const clone = new TailwindSpanNode(node.__text, node.__key);
    clone.__tailwindClasses = node.__tailwindClasses;
    return clone;
  }

  constructor(text, key) {
    super(text, key);
  }

  getTailwindClasses() {
    return this.getLatest().__tailwindClasses;
  }

  setTailwindClasses(classes) {
    const self = this.getWritable();
    self.__tailwindClasses = classes;
  }

  createDOM(config) {
    const dom = document.createElement('span');
    const innerDOM = super.createDOM(config);
    if (this.__tailwindClasses) {
      dom.className = this.__tailwindClasses;
    }
    dom.appendChild(innerDOM);
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    if (prevNode.__tailwindClasses !== this.__tailwindClasses) {
      dom.className = this.__tailwindClasses || '';
    }
    const inner = dom.firstChild;
    if (inner) {
      super.updateDOM(prevNode, inner, config);
    }
    return false;
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tailwind-span',
      tailwindClasses: this.__tailwindClasses,
    };
  }

  static importJSON(json) {
    const node = $createTailwindSpanNode(json.text || '');
    node.setTailwindClasses(json.tailwindClasses || '');
    if (json.format) node.setFormat(json.format);
    if (json.detail) node.setDetail(json.detail);
    if (json.mode) node.setMode(json.mode);
    if (json.style) node.setStyle(json.style);
    return node;
  }

  isSimpleText() {
    return false;
  }
}

export function $createTailwindSpanNode(text) {
  return $applyNodeReplacement(new TailwindSpanNode(text));
}

export function $isTailwindSpanNode(node) {
  return node instanceof TailwindSpanNode;
}
