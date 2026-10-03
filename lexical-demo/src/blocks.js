// Serialized Lexical nodes for the demo's content: the examples, the sample
// pages and the Insert menu all build editor content from these, and the
// editor turns them into nodes with $parseSerializedNode.

const DARK = '[.theme-dark_&]:';

export function textNode(text) {
  return { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '' };
}

export function spanNode(text, classes) {
  return { type: 'tailwind-span', text, tailwindClasses: classes, format: 0, detail: 0, mode: 'normal', style: '' };
}

export function heading(tag, classes, children) {
  return { type: 'styled-heading', tag, tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

export function para(classes, children) {
  return { type: 'styled-paragraph', tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

/** A container (styled-box): a div holding blocks and other containers. */
export function box(classes, children) {
  return { type: 'styled-box', tailwindClasses: classes, children, direction: 'ltr', format: '', indent: 0, version: 1 };
}

export function editorState(children) {
  return { root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 } };
}

export const CARD = `rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${DARK}border-slate-700 ${DARK}bg-slate-800`;
const COLUMN = `rounded-lg bg-slate-50 p-4 ${DARK}bg-slate-800`;
const NUMBER = `text-3xl font-bold tracking-tight text-slate-900 ${DARK}text-white`;
const LABEL = `text-sm text-slate-500 ${DARK}text-slate-400`;
export const WRAP_CLASSES = `rounded-xl border border-slate-200 p-4 ${DARK}border-slate-700`;

/** A card with a big number over a small label. */
export function metric(value, label, extra = []) {
  return box(CARD, [para(NUMBER, [textNode(value), ...extra]), para(LABEL, [textNode(label)])]);
}

function columns(n) {
  const cols = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }[n];
  return box(`grid grid-cols-1 gap-4 ${cols}`, Array.from({ length: n }, (_, i) => box(COLUMN, [para('', [textNode(`Column ${i + 1}`)])])));
}

/** What the Insert menu adds. `node()` returns a fresh serialized node each time. */
export const PRESETS = [
  {
    id: 'container',
    label: 'Container',
    hint: 'A box around text; style it like any block',
    node: () => box(WRAP_CLASSES, [para('', [textNode('Text in a container')])]),
  },
  {
    id: 'card',
    label: 'Card',
    hint: 'Title and text in a bordered card',
    node: () => box(CARD, [
      heading('h3', `text-lg font-semibold text-slate-900 ${DARK}text-white`, [textNode('Card title')]),
      para(`mt-1 text-slate-600 ${DARK}text-slate-300`, [textNode('A short description.')]),
    ]),
  },
  { id: 'columns-2', label: '2 columns', hint: 'Side by side, stacked on small screens', node: () => columns(2) },
  { id: 'columns-3', label: '3 columns', hint: 'Three equal columns', node: () => columns(3) },
  {
    id: 'metrics',
    label: 'Metrics row',
    hint: 'Four cards, a number over a label',
    node: () => box('grid grid-cols-2 gap-4 md:grid-cols-4', [
      metric('12.4k', 'Visitors'),
      metric('3.2%', 'Conversion'),
      metric('$8,140', 'Revenue'),
      metric('214', 'Orders'),
    ]),
  },
];
