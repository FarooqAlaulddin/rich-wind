import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $isElementNode,
  $isRootNode,
  $parseSerializedNode,
} from 'lexical';
import { $createTailwindSpanNode } from './nodes/TailwindSpanNode';
import { splitClasses } from './classEdit';
import { $isStyledParagraphNode, $createStyledParagraphNode } from './nodes/StyledParagraphNode';
import { $isStyledBoxNode, $createStyledBoxNode } from './nodes/StyledBoxNode';
import { inspectStore } from './inspect/inspectStore';
import { pathOf } from './inspect/inspectDom';
import { WRAP_CLASSES } from './blocks';
import { $isStyledHeadingNode } from './nodes/StyledHeadingNode';
import { $isTailwindSpanNode } from './nodes/TailwindSpanNode';
import { captureStyle, animateFrom } from './animateStyle';

function hasClasses(node) {
  return $isStyledParagraphNode(node) || $isStyledHeadingNode(node) || $isTailwindSpanNode(node) || $isStyledBoxNode(node);
}

const isBlockNode = (node) => $isStyledParagraphNode(node) || $isStyledHeadingNode(node) || $isStyledBoxNode(node);

/**
 * Removes every class in `rejected` from all styled nodes in the editor.
 * This is the demo's stand-in for what an agent does after reading
 * rejected[] from a compile response: fix the output and resubmit.
 */
export function removeRejectedClasses(editor, rejected) {
  const drop = new Set(rejected || []);
  if (!editor || drop.size === 0) return;

  editor.update(() => {
    const visit = (node) => {
      if (hasClasses(node)) {
        const existing = node.getTailwindClasses() || '';
        const kept = existing.split(/\s+/).filter(c => c && !drop.has(c));
        if (kept.length !== existing.split(/\s+/).filter(Boolean).length) {
          node.setTailwindClasses(kept.join(' '));
        }
      }
      if (typeof node.getChildren === 'function') {
        node.getChildren().forEach(visit);
      }
    };
    $getRoot().getChildren().forEach(visit);
  });
}

/** Replaces the whole document with a serialized editor state. */
export function loadEditorState(editor, stateJson) {
  if (!editor || !stateJson) return;
  const parsed = editor.parseEditorState(JSON.stringify(stateJson));
  editor.setEditorState(parsed);
}

/**
 * A style target says which node a class edit applies to:
 *   { kind: 'element', el }   a DOM element picked with Inspect
 *   { kind: 'inline', key }   a styled span; key is null for a plain text
 *                             selection that has no span yet
 *   { kind: 'block', key }    the block at the caret
 */
function $nodeForTarget(spec) {
  if (spec.kind === 'element') {
    const node = $getNearestNodeFromDOMNode(spec.el);
    return hasClasses(node) ? node : null;
  }
  if (spec.key) {
    const node = $getNodeByKey(spec.key);
    return hasClasses(node) ? node : null;
  }
  if (spec.kind === 'block') {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const top = selection.anchor.getNode().getTopLevelElement();
    return hasClasses(top) ? top : null;
  }
  return null;
}

/**
 * Rewrites the class list of the target. `transform` maps the current array of
 * class tokens to the new one. A text selection with no span yet is wrapped in
 * a new styled span (and stays selected, so the next edit finds it). `onKey`
 * receives the edited node's key once the update has been committed.
 */
export function editTargetClasses(editor, spec, transform, onKey, { from } = {}) {
  if (!editor || !spec) return;
  let editedKey = null;
  let created = false;
  // How the element looked before the change (the DOM is not reconciled yet inside update()).
  let look = from || null;
  editor.update(() => {
    const node = $nodeForTarget(spec);
    if (node) {
      if (!look) look = captureStyle(editor.getElementByKey(node.getKey()));
      const before = splitClasses(node.getTailwindClasses());
      const after = transform(before);
      if (after.join(' ') !== before.join(' ')) node.setTailwindClasses(after.join(' '));
      editedKey = node.getKey();
      return;
    }
    if (spec.kind !== 'inline') return;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    const after = transform([]);
    if (after.length === 0) return;
    const text = selection.getTextContent();
    // A new span starts out looking like the text it wraps.
    if (!look) look = captureStyle(editor.getElementByKey(selection.anchor.getNode().getKey()));
    const span = $createTailwindSpanNode(text);
    span.setTailwindClasses(after.join(' '));
    selection.insertNodes([span]);
    span.select(0, text.length);
    editedKey = span.getKey();
    created = true;
  }, {
    onUpdate: () => {
      if (onKey) onKey(editedKey);
      if (editedKey) animateFrom(look, editor.getElementByKey(editedKey));
      // Replacing the text node makes the browser collapse its selection once
      // the editor is not focused (the shelf has it); select the new span again.
      if (created) requestAnimationFrame(() => reselectSpan(editor, editedKey));
    },
  });
}

/** Selects the whole text of the span with `key` unless the selection already is inside it. */
function reselectSpan(editor, key) {
  editor.update(() => {
    const span = $getNodeByKey(key);
    if (!span) return;
    const selection = $getSelection();
    if ($isRangeSelection(selection) && !selection.isCollapsed()) return;
    span.select(0, span.getTextContentSize());
  });
}

/** DOM Range over the editor's current non-collapsed text selection, or null. */
export function selectionRange(editor) {
  if (!editor) return null;
  const ends = editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
    const [a, b] = selection.isBackward() ? [selection.focus, selection.anchor] : [selection.anchor, selection.focus];
    return [{ key: a.key, offset: a.offset }, { key: b.key, offset: b.offset }];
  });
  if (!ends) return null;
  const textOf = (key) => {
    const el = editor.getElementByKey(key);
    return el && (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : el);
  };
  const start = textOf(ends[0].key);
  const end = textOf(ends[1].key);
  if (!start || !end) return null;
  try {
    const range = document.createRange();
    range.setStart(start, ends[0].offset);
    range.setEnd(end, ends[1].offset);
    return range;
  } catch { return null; }
}

// ---- Blocks and containers -------------------------------------------------

/** The node with its children, as JSON that $parseSerializedNode reads back. */
export function $exportTree(node) {
  const json = node.exportJSON();
  if ($isElementNode(node)) json.children = node.getChildren().map($exportTree);
  return json;
}

/** The block or container a style target names; null for an inline span. */
function $blockForTarget(spec) {
  if (!spec) return null;
  const node = spec.kind === 'element' ? $getNearestNodeFromDOMNode(spec.el) : $nodeForTarget(spec);
  return isBlockNode(node) ? node : null;
}

/** Selects the element of `key` in the panel, as if it was clicked with Inspect. */
function pinKey(editor, key) {
  const root = editor.getRootElement();
  const el = key && editor.getElementByKey(key);
  inspectStore.set({ pinned: el && root ? { el, path: pathOf(root, el) } : null });
}

/**
 * Adds a preset (serialized node, see blocks.js PRESETS) after the block at the
 * caret, inside the same container. An empty unstyled paragraph at the caret is
 * replaced. A container at the end of the document gets an empty paragraph
 * after it, so there is somewhere to keep typing. One update, so one undo.
 */
export function insertBlock(editor, json, onKey) {
  if (!editor || !json) return;
  let key = null;
  editor.update(() => {
    const node = $parseSerializedNode(json);
    const selection = $getSelection();
    const anchor = $isRangeSelection(selection) ? selection.anchor.getNode() : null;
    const at = anchor && !$isRootNode(anchor) ? anchor.getTopLevelElement() : null;
    if (at) {
      at.insertAfter(node);
      const blank = $isStyledParagraphNode(at) && at.getTextContentSize() === 0 && !at.getTailwindClasses();
      if (blank) at.remove();
    } else {
      $getRoot().append(node);
    }
    if ($isStyledBoxNode(node) && !node.getNextSibling()) node.insertAfter($createStyledParagraphNode());
    node.selectStart();
    key = node.getKey();
  }, { onUpdate: () => onKey && onKey(key) });
}

/** Inserts a copy of the target block or container right after it. */
export function duplicateTarget(editor, spec) {
  if (!editor) return;
  editor.update(() => {
    const node = $blockForTarget(spec);
    if (node) node.insertAfter($parseSerializedNode($exportTree(node)));
  });
}

/**
 * Removes the target block or container. A container left empty goes too, and
 * an empty document keeps one paragraph. The panel selection is cleared.
 */
export function deleteTarget(editor, spec) {
  if (!editor) return;
  editor.update(() => {
    const node = $blockForTarget(spec);
    if (!node) return;
    let parent = node.getParent();
    node.remove();
    while ($isStyledBoxNode(parent) && parent.getChildrenSize() === 0) {
      const up = parent.getParent();
      parent.remove();
      parent = up;
    }
    const root = $getRoot();
    if (root.getChildrenSize() === 0) root.append($createStyledParagraphNode());
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) root.getFirstChild()?.selectStart();
  }, { onUpdate: () => inspectStore.set({ pinned: null }) });
}

/** Puts the target block or container inside a new container and selects that container. */
export function wrapTarget(editor, spec) {
  if (!editor) return;
  let key = null;
  editor.update(() => {
    const node = $blockForTarget(spec);
    if (!node) return;
    const wrap = $createStyledBoxNode(WRAP_CLASSES);
    node.insertBefore(wrap);
    wrap.append(node);
    key = wrap.getKey();
  }, { onUpdate: () => key && pinKey(editor, key) });
}

/** The container the element sits in (its DOM parent when that is a container), or null. */
export function parentBox(el) {
  const parent = el && el.parentElement;
  return parent && parent.hasAttribute('data-rw-box') ? parent : null;
}

/** Selects the container around `el` in the panel. */
export function selectParent(editor, el) {
  const box = parentBox(el);
  const root = editor && editor.getRootElement();
  if (box && root) inspectStore.set({ pinned: { el: box, path: pathOf(root, box) } });
}
