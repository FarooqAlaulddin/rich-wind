import { describe, it, expect, afterAll } from 'vitest';
import { createEditor, $getRoot, ParagraphNode } from 'lexical';
import { StyledParagraphNode, $isStyledParagraphNode } from '../lexical-demo/src/nodes/StyledParagraphNode.js';
import { StyledHeadingNode } from '../lexical-demo/src/nodes/StyledHeadingNode.js';
import { TailwindSpanNode } from '../lexical-demo/src/nodes/TailwindSpanNode.js';
import { StyledBoxNode, $isStyledBoxNode } from '../lexical-demo/src/nodes/StyledBoxNode.js';
import { serializeEditor } from '../lexical-demo/src/serialize.js';
import { PRESETS, box, para, heading, textNode, spanNode, editorState, WRAP_CLASSES } from '../lexical-demo/src/blocks.js';
import { EXAMPLES } from '../lexical-demo/src/examples.js';
import {
  insertBlock, duplicateTarget, deleteTarget, wrapTarget, editTargetClasses, removeRejectedClasses, loadEditorState, $exportTree,
} from '../lexical-demo/src/editorActions.js';
import { createCore } from '../services/index.js';

function makeEditor(state) {
  const editor = createEditor({
    namespace: 'test',
    onError: (e) => { throw e; },
    nodes: [
      StyledParagraphNode, StyledHeadingNode, TailwindSpanNode, StyledBoxNode,
      { replace: ParagraphNode, with: () => new StyledParagraphNode(), withKlass: StyledParagraphNode },
    ],
  });
  if (state) editor.setEditorState(editor.parseEditorState(JSON.stringify(state)));
  return editor;
}

// Updates commit in a microtask; this flushes them.
const settle = () => new Promise((r) => setTimeout(r, 0));
const read = (editor, fn) => editor.getEditorState().read(fn);
const html = (editor) => read(editor, () => serializeEditor($getRoot()).html);
const types = (editor) => read(editor, () => {
  const walk = (n) => (n.getChildren ? { [n.getType()]: n.getChildren().filter((c) => c.getChildren).map(walk) } : n.getType());
  return $getRoot().getChildren().map(walk);
});
describe('StyledBoxNode', () => {
  it('round-trips nested containers and their classes through JSON', () => {
    const state = editorState([box('grid gap-4', [box('p-4', [para('text-xl', [textNode('42')])])])]);
    const editor = makeEditor(state);
    const json = editor.getEditorState().toJSON();
    const outer = json.root.children[0];
    expect(outer).toMatchObject({ type: 'styled-box', tailwindClasses: 'grid gap-4' });
    expect(outer.children[0]).toMatchObject({ type: 'styled-box', tailwindClasses: 'p-4' });
    expect(outer.children[0].children[0]).toMatchObject({ type: 'styled-paragraph', tailwindClasses: 'text-xl' });
  });

  it('is a shadow root: the top-level element of text in a card is its paragraph, not the card', () => {
    const editor = makeEditor(editorState([box('p-4', [para('', [textNode('inside')])])]));
    const top = read(editor, () => $getRoot().getAllTextNodes()[0].getTopLevelElement());
    expect($isStyledParagraphNode(top)).toBe(true);
  });
});

describe('serializeEditor', () => {
  it('emits containers as nested, indented divs and collects their classes', () => {
    const editor = makeEditor(editorState([
      heading('h2', 'text-2xl', [textNode('Stats')]),
      box('grid grid-cols-4', [box('rounded-xl p-4', [para('text-3xl', [textNode('12'), spanNode('%', 'text-sm')]), para('text-slate-500', [textNode('Rate')])])]),
    ]));
    expect(html(editor)).toBe([
      '<h2 class="text-2xl">Stats</h2>',
      '<div class="grid grid-cols-4">',
      '  <div class="rounded-xl p-4">',
      '    <p class="text-3xl">12<span class="text-sm">%</span></p>',
      '    <p class="text-slate-500">Rate</p>',
      '  </div>',
      '</div>',
      '',
    ].join('\n'));
    const classes = read(editor, () => serializeEditor($getRoot()).classes);
    expect(classes).toEqual(expect.arrayContaining(['grid', 'grid-cols-4', 'rounded-xl', 'p-4', 'text-3xl', 'text-sm', 'text-slate-500']));
  });

  it('a container without classes is a bare div', () => {
    const editor = makeEditor(editorState([box('', [para('', [textNode('a')])])]));
    expect(html(editor)).toBe('<div>\n  <p>a</p>\n</div>\n');
  });
});

describe('insertBlock', () => {
  it('the metrics preset is a grid of four cards, each a number over a label', () => {
    const json = PRESETS.find((p) => p.id === 'metrics').node();
    expect(json.type).toBe('styled-box');
    expect(json.tailwindClasses).toMatch(/\bgrid\b/);
    expect(json.children).toHaveLength(4);
    for (const card of json.children) {
      expect(card.type).toBe('styled-box');
      expect(card.children.map((c) => c.type)).toEqual(['styled-paragraph', 'styled-paragraph']);
    }
  });

  it('each preset returns a fresh copy', () => {
    for (const p of PRESETS) {
      const a = p.node();
      a.tailwindClasses = 'changed';
      expect(p.node().tailwindClasses).not.toBe('changed');
    }
  });

  it('replaces an empty paragraph at the caret and leaves a paragraph after it to keep typing', async () => {
    const editor = makeEditor();
    editor.update(() => { $getRoot().clear().append(new StyledParagraphNode()); $getRoot().getFirstChild().select(); });
    await settle();
    let key = null;
    insertBlock(editor, PRESETS.find((p) => p.id === 'columns-2').node(), (k) => { key = k; });
    await settle();
    expect(key).toBeTruthy();
    expect(types(editor)).toEqual([
      { 'styled-box': [{ 'styled-box': [{ 'styled-paragraph': [] }] }, { 'styled-box': [{ 'styled-paragraph': [] }] }] },
      { 'styled-paragraph': [] },
    ]);
    // The caret moved into the first column.
    const caretText = read(editor, () => editor.getEditorState()._selection.anchor.getNode().getTextContent());
    expect(caretText).toBe('Column 1');
  });

  it('inserts after the block at the caret, inside the same container', async () => {
    const editor = makeEditor(editorState([box('p-4', [para('', [textNode('first')]), para('', [textNode('last')])])]));
    editor.update(() => $getRoot().getAllTextNodes()[0].select(0, 0));
    await settle();
    insertBlock(editor, PRESETS.find((p) => p.id === 'card').node());
    await settle();
    const inner = read(editor, () => $getRoot().getFirstChild().getChildren().map((n) => n.getType()));
    expect(inner).toEqual(['styled-paragraph', 'styled-box', 'styled-paragraph']);
    expect(read(editor, () => $getRoot().getChildrenSize())).toBe(1);
  });

  it('is one update, so one undo step', async () => {
    const editor = makeEditor(editorState([para('', [textNode('x')])]));
    const updates = [];
    editor.registerUpdateListener(({ dirtyElements }) => updates.push(dirtyElements.size));
    insertBlock(editor, PRESETS.find((p) => p.id === 'metrics').node());
    await settle();
    expect(updates).toHaveLength(1);
  });
});

describe('class edits inside containers', () => {
  it('the caret block target is the paragraph in the card, so the card keeps its classes', async () => {
    const editor = makeEditor(editorState([box('rounded-xl p-4', [para('text-3xl', [textNode('42')])])]));
    editor.update(() => $getRoot().getAllTextNodes()[0].select(0, 0));
    await settle();
    editTargetClasses(editor, { kind: 'block', key: null }, (list) => [...list, 'font-bold']);
    await settle();
    expect(html(editor)).toContain('<div class="rounded-xl p-4">');
    expect(html(editor)).toContain('<p class="text-3xl font-bold">42</p>');
  });

  it('a container can be targeted by key and restyled', async () => {
    const editor = makeEditor(editorState([box('p-4', [para('', [textNode('a')])])]));
    const boxKey = read(editor, () => $getRoot().getFirstChild().getKey());
    editTargetClasses(editor, { kind: 'block', key: boxKey }, (list) => [...list, 'bg-white']);
    await settle();
    expect(html(editor)).toContain('<div class="p-4 bg-white">');
  });

  it('removeRejectedClasses reaches classes inside nested containers', async () => {
    const editor = makeEditor(editorState([box('p-4 p-huge', [box('shadow-glow', [para('text-danger', [textNode('a')])])])]));
    removeRejectedClasses(editor, ['p-huge', 'shadow-glow', 'text-danger']);
    await settle();
    expect(html(editor)).toBe('<div class="p-4">\n  <div>\n    <p>a</p>\n  </div>\n</div>\n');
  });
});

describe('block actions', () => {
  const cards = () => editorState([
    box('grid gap-4', [box('card-a', [para('', [textNode('A')])]), box('card-b', [para('', [textNode('B')])])]),
  ]);
  const boxKey = (editor, cls) => read(editor, () => {
    let key = null;
    const walk = (n) => { if ($isStyledBoxNode(n) && n.getTailwindClasses() === cls) key = n.getKey(); n.getChildren?.().forEach(walk); };
    walk($getRoot());
    return key;
  });

  it('duplicate copies a container with everything in it, as new nodes', async () => {
    const editor = makeEditor(cards());
    const key = boxKey(editor, 'card-a');
    duplicateTarget(editor, { kind: 'block', key });
    await settle();
    expect(html(editor).match(/class="card-a"/g)).toHaveLength(2);
    const keys = read(editor, () => $getRoot().getFirstChild().getChildren().map((n) => n.getKey()));
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe(key);
  });

  it('$exportTree keeps the children that exportJSON leaves out', () => {
    const editor = makeEditor(cards());
    const tree = read(editor, () => $exportTree($getRoot().getFirstChild()));
    expect(tree.children).toHaveLength(2);
    expect(tree.children[1].children[0].children[0]).toMatchObject({ type: 'text', text: 'B' });
  });

  it('delete removes the block, then any container it leaves empty', async () => {
    const editor = makeEditor(cards());
    const pKey = read(editor, () => $getRoot().getAllTextNodes()[0].getParent().getKey());
    deleteTarget(editor, { kind: 'block', key: pKey });
    await settle();
    expect(html(editor)).not.toContain('card-a');
    expect(html(editor)).toContain('card-b');
  });

  it('deleting the only content leaves one empty paragraph', async () => {
    const editor = makeEditor(editorState([box('p-4', [para('', [textNode('only')])])]));
    const key = read(editor, () => $getRoot().getFirstChild().getKey());
    deleteTarget(editor, { kind: 'block', key });
    await settle();
    expect(types(editor)).toEqual([{ 'styled-paragraph': [] }]);
  });

  it('wrap puts a block inside a new styled container in the same place', async () => {
    const editor = makeEditor(editorState([para('', [textNode('one')]), para('text-lg', [textNode('two')])]));
    const key = read(editor, () => $getRoot().getLastChild().getKey());
    wrapTarget(editor, { kind: 'block', key });
    await settle();
    expect(html(editor)).toBe(`<p>one</p>\n<div class="${WRAP_CLASSES.replace(/&/g, '&amp;')}">\n  <p class="text-lg">two</p>\n</div>\n`);
  });

  it('actions on an inline span do nothing', async () => {
    const editor = makeEditor(editorState([para('', [spanNode('s', 'font-bold')])]));
    const before = html(editor);
    const key = read(editor, () => $getRoot().getAllTextNodes()[0].getKey());
    for (const action of [duplicateTarget, deleteTarget, wrapTarget]) action(editor, { kind: 'inline', key });
    await settle();
    expect(html(editor)).toBe(before);
  });
});

describe('examples with containers', () => {
  let core;
  afterAll(() => core?.close?.());

  it('every example loads, and the container examples have nested markup', () => {
    for (const ex of EXAMPLES) {
      const editor = makeEditor();
      loadEditorState(editor, ex.state);
      expect(html(editor).length).toBeGreaterThan(0);
    }
    for (const id of ['metrics', 'features', 'tiers']) {
      const ex = EXAMPLES.find((e) => e.id === id);
      expect(ex, id).toBeTruthy();
      expect(html(makeEditor(ex.state))).toMatch(/<div class="[^"]*">\n {2}<div/);
    }
  });

  it('examples without hasRejected compile with nothing rejected', async () => {
    core = await createCore();
    for (const ex of EXAMPLES.filter((e) => !e.hasRejected)) {
      const res = await core.compile({ projectId: 'containers-test', pageId: ex.id, html: html(makeEditor(ex.state)) });
      expect(res.rejected, ex.id).toEqual([]);
    }
    for (const p of PRESETS) {
      const editor = makeEditor(editorState([p.node()]));
      const res = await core.compile({ projectId: 'containers-test', pageId: p.id, html: html(editor) });
      expect(res.rejected, p.id).toEqual([]);
    }
  });
});
