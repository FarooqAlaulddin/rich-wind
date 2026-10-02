import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
} from 'lexical';
import { $createTailwindSpanNode } from './nodes/TailwindSpanNode';
import { splitClasses } from './classEdit';
import { $isStyledParagraphNode } from './nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from './nodes/StyledHeadingNode';
import { $isTailwindSpanNode } from './nodes/TailwindSpanNode';

function hasClasses(node) {
  return $isStyledParagraphNode(node) || $isStyledHeadingNode(node) || $isTailwindSpanNode(node);
}

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
export function editTargetClasses(editor, spec, transform, onKey) {
  if (!editor || !spec) return;
  let editedKey = null;
  let created = false;
  editor.update(() => {
    const node = $nodeForTarget(spec);
    if (node) {
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
    const span = $createTailwindSpanNode(text);
    span.setTailwindClasses(after.join(' '));
    selection.insertNodes([span]);
    span.select(0, text.length);
    editedKey = span.getKey();
    created = true;
  }, {
    onUpdate: () => {
      if (onKey) onKey(editedKey);
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
