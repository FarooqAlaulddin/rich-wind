import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { $getSelection, $isRangeSelection, $getNodeByKey } from 'lexical';
import { $isStyledParagraphNode } from '../nodes/StyledParagraphNode';
import { $isStyledHeadingNode } from '../nodes/StyledHeadingNode';
import { $isTailwindSpanNode } from '../nodes/TailwindSpanNode';
import { inspectStore } from '../inspect/inspectStore';
import { classesOf, describe } from '../inspect/inspectDom';
import { splitClasses } from '../classEdit';

const BLOCK_LABELS = {
  p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4', h5: 'Heading 5', h6: 'Heading 6',
};

const EMPTY = { block: null, inline: null, selSeq: 0 };

// Orders "the Selected element was picked" against "text was selected", so
// whichever happened last wins. Shared by every consumer of the hook.
let seqCounter = 0;
const nextSeq = () => ++seqCounter;

function readEditor() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const focus = selection.focus.getNode();
  const top = anchor.getTopLevelElement();

  let block = null;
  if ($isStyledParagraphNode(top) || $isStyledHeadingNode(top)) {
    block = {
      key: top.getKey(),
      tag: $isStyledHeadingNode(top) ? top.getTag() : 'p',
      classes: top.getTailwindClasses() || '',
    };
  }

  let inline = null;
  if (!selection.isCollapsed()) {
    const text = selection.getTextContent();
    const focusTop = focus.getTopLevelElement();
    // Inline styling wraps text in one span, so it stays within one block.
    if (text.length > 0 && top && focusTop && focusTop.getKey() === top.getKey()) {
      const span = $isTailwindSpanNode(anchor) ? anchor : $isTailwindSpanNode(focus) ? focus : null;
      inline = {
        words: text.split(/\s+/).filter(Boolean).length,
        spanKey: span ? span.getKey() : null,
        classes: span ? span.getTailwindClasses() || '' : '',
        sig: `${anchor.getKey()}:${selection.anchor.offset}-${focus.getKey()}:${selection.focus.offset}`,
      };
    }
  }
  return { block, inline };
}

/**
 * Resolves what the style picker and the class input act on:
 *   1. the Selected element from Inspect, unless text was selected after it;
 *   2. a text selection (an inline span, created on the first class);
 *   3. the block at the caret.
 * `id` names the target, so a consumer can tell "the same thing" from "something else".
 * Everything React sees here is a plain string or number, so typing in the
 * editor does not re-render consumers unless a class list or selection changed.
 */
export function useStyleTarget(editor) {
  const [sel, setSel] = useState(EMPTY);
  const lastInlineSig = useRef('');

  useEffect(() => {
    if (!editor) return undefined;
    return editor.registerUpdateListener(({ editorState }) => {
      const next = editorState.read(readEditor);
      if (!next) {
        // No selection (a new document was loaded): drop a target whose node is gone.
        setSel((prev) => {
          const gone = (key) => key && !editorState.read(() => $getNodeByKey(key));
          if (!gone(prev.block?.key) && !gone(prev.inline?.spanKey)) return prev;
          lastInlineSig.current = '';
          return { ...EMPTY, selSeq: prev.selSeq };
        });
        return;
      }
      setSel((prev) => {
        let selSeq = prev.selSeq;
        if (next.inline) {
          if (next.inline.sig !== lastInlineSig.current) selSeq = nextSeq();
          lastInlineSig.current = next.inline.sig;
        } else {
          lastInlineSig.current = '';
        }
        const same = prev.selSeq === selSeq
          && JSON.stringify(prev.block) === JSON.stringify(next.block)
          && JSON.stringify(prev.inline) === JSON.stringify(next.inline);
        return same ? prev : { ...next, selSeq };
      });
    });
  }, [editor]);

  const pinnedEl = useSyncExternalStore(
    inspectStore.subscribe,
    () => {
      const p = inspectStore.getSnapshot().pinned;
      return p && p.el.isConnected ? p.el : null;
    },
  );
  const rev = useSyncExternalStore(inspectStore.subscribe, () => inspectStore.getSnapshot().rev);

  const pin = useRef({ el: null, seq: 0 });
  if (pin.current.el !== pinnedEl) pin.current = { el: pinnedEl, seq: pinnedEl ? nextSeq() : 0 };
  const pinSeq = pin.current.seq;

  return useMemo(() => {
    const inlineWins = sel.inline && (!pinnedEl || sel.selSeq > pinSeq);

    if (pinnedEl && !inlineWins) {
      const info = describe(pinnedEl);
      return {
        id: `e${pinSeq}`,
        kind: 'element',
        source: 'selected',
        tag: info.tag,
        label: info.box ? 'Selected container' : info.kind === 'block' ? 'Selected block' : 'Selected span',
        text: info.text,
        classes: classesOf(pinnedEl),
        spec: { kind: 'element', el: pinnedEl },
        getEl: () => (pinnedEl.isConnected ? pinnedEl : null),
      };
    }
    if (sel.inline) {
      const { spanKey, words, classes } = sel.inline;
      return {
        id: `i${sel.selSeq}`,
        kind: 'inline',
        source: 'selection',
        tag: 'span',
        label: `Selection (${words} word${words !== 1 ? 's' : ''})`,
        text: '',
        fresh: !spanKey,
        classes: splitClasses(classes),
        spec: { kind: 'inline', key: spanKey },
        getEl: () => (spanKey && editor ? editor.getElementByKey(spanKey) : null),
      };
    }
    if (sel.block) {
      const { key, tag, classes } = sel.block;
      return {
        id: `b${key}`,
        kind: 'block',
        source: 'caret',
        tag,
        label: BLOCK_LABELS[tag] || 'Paragraph',
        text: '',
        classes: splitClasses(classes),
        spec: { kind: 'block', key },
        getEl: () => (editor ? editor.getElementByKey(key) : null),
      };
    }
    return { id: '', kind: 'none', source: null, tag: '', label: '', text: '', classes: [], spec: null, getEl: () => null };
    // `rev` re-reads DOM classes of a picked element after a class edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, pinnedEl, pinSeq, rev, editor]);
}
