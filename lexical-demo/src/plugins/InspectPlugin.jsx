import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { inspectStore } from '../inspect/inspectStore';
import { blockFor, pathOf, resolvePath, targetFor } from '../inspect/inspectDom';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape']);
const EDIT_SHORTCUTS = new Set(['v', 'x', 'z', 'y']);
const RESUME_IDLE_MS = 350;
const RESUME_MOVE_PX = 4;

function makeTarget(root, el) {
  return el ? { el, path: pathOf(root, el) } : null;
}

/**
 * Wires pointer, keyboard and selection events to the inspect store and draws
 * the overlay boxes. Nothing here sets React state on hover: events are
 * coalesced with requestAnimationFrame and written to the external store.
 */
export default function InspectPlugin() {
  const [editor] = useLexicalComposerContext();
  const [root, setRoot] = useState(() => editor.getRootElement());

  useEffect(() => editor.registerRootListener(setRoot), [editor]);

  useEffect(() => {
    if (!root) return;
    const scroller = root.closest('.editor-scroller') || root;
    let pointer = null;
    let pointerRaf = 0;
    let caretRaf = 0;
    let updateRaf = 0;
    let lastKeyAt = 0;
    let typingAt = null;
    let lastSig = '';

    const applyPointer = () => {
      pointerRaf = 0;
      const s = inspectStore.getSnapshot();
      if (!s.enabled || s.typing || !pointer) return;
      const el = root.contains(pointer.target) ? targetFor(root, pointer.target) : null;
      if (el === (s.hover && s.hover.el)) return;
      inspectStore.set({ hover: makeTarget(root, el) });
    };

    const applyCaret = () => {
      caretRaf = 0;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !root.contains(sel.anchorNode)) return;
      const el = targetFor(root, sel.anchorNode);
      const current = inspectStore.getSnapshot().caret;
      if (el === (current && current.el)) return;
      inspectStore.set({ caret: makeTarget(root, el) });
    };

    // After a Lexical update: find pinned/caret again if their DOM node was
    // replaced, tell the panel when a class list changed, and re-measure.
    const applyUpdate = () => {
      updateRaf = 0;
      const s = inspectStore.getSnapshot();
      const patch = {};
      for (const key of ['hover', 'pinned', 'caret']) {
        const t = s[key];
        if (t && !t.el.isConnected) {
          const el = t.path ? resolvePath(root, t.path) : null;
          patch[key] = el ? { el, path: t.path } : null;
        }
      }
      inspectStore.set(patch);
      const next = inspectStore.getSnapshot();
      const sig = ['hover', 'pinned', 'caret']
        .map((key) => (next[key] ? `${next[key].el.tagName}.${next[key].el.className}` : ''))
        .join('|');
      if (sig !== lastSig) {
        lastSig = sig;
        inspectStore.touch();
      }
      inspectStore.layout();
    };

    const onPointerMove = (e) => {
      const s = inspectStore.getSnapshot();
      if (!s.enabled) return;
      if (s.typing) {
        const moved = typingAt
          ? Math.hypot(e.clientX - typingAt.x, e.clientY - typingAt.y) > RESUME_MOVE_PX
          : true;
        if (!moved || performance.now() - lastKeyAt < RESUME_IDLE_MS) {
          if (!typingAt) typingAt = { x: e.clientX, y: e.clientY };
          return;
        }
        typingAt = null;
        inspectStore.set({ typing: false });
      }
      pointer = { target: e.target };
      if (!pointerRaf) pointerRaf = requestAnimationFrame(applyPointer);
    };

    const onPointerLeave = () => {
      pointer = null;
      inspectStore.set({ hover: null });
    };

    const onPointerDown = (e) => {
      const s = inspectStore.getSnapshot();
      if (!s.enabled) return;
      const el = targetFor(root, e.target);
      pointer = { target: e.target };
      inspectStore.set({ typing: false, pinned: makeTarget(root, el) });
    };

    const onRootKeyDown = (e) => {
      if (MODIFIER_KEYS.has(e.key)) return;
      if ((e.ctrlKey || e.metaKey) && !EDIT_SHORTCUTS.has(e.key.toLowerCase())) return;
      const s = inspectStore.getSnapshot();
      if (!s.enabled) return;
      lastKeyAt = performance.now();
      typingAt = null;
      inspectStore.set({ typing: true, hover: null });
    };

    const onDocKeyDown = (e) => {
      if (e.key === 'Escape' && inspectStore.getSnapshot().pinned) {
        inspectStore.set({ pinned: null });
      }
    };

    const onSelectionChange = () => {
      if (!caretRaf) caretRaf = requestAnimationFrame(applyCaret);
    };

    const removeUpdateListener = editor.registerUpdateListener(() => {
      if (!updateRaf) updateRaf = requestAnimationFrame(applyUpdate);
    });

    scroller.addEventListener('pointermove', onPointerMove, { passive: true });
    scroller.addEventListener('pointerleave', onPointerLeave);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onRootKeyDown);
    document.addEventListener('keydown', onDocKeyDown);
    document.addEventListener('selectionchange', onSelectionChange);

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => inspectStore.layout())
      : null;
    resizeObserver?.observe(root);

    // Compiled CSS is injected into a <style> tag; new rules can move blocks.
    const styleTag = document.getElementById('rw-editor-css');
    const styleObserver = styleTag && typeof MutationObserver === 'function'
      ? new MutationObserver(() => inspectStore.layout())
      : null;
    styleObserver?.observe(styleTag, { childList: true, characterData: true, subtree: true });

    return () => {
      cancelAnimationFrame(pointerRaf);
      cancelAnimationFrame(caretRaf);
      cancelAnimationFrame(updateRaf);
      removeUpdateListener();
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('keydown', onRootKeyDown);
      document.removeEventListener('keydown', onDocKeyDown);
      document.removeEventListener('selectionchange', onSelectionChange);
      resizeObserver?.disconnect();
      styleObserver?.disconnect();
    };
  }, [root, editor]);

  return <InspectOverlay root={root} />;
}

function InspectOverlay({ root }) {
  const hoverRef = useRef(null);
  const selectedRef = useRef(null);
  const caretRef = useRef(null);

  const position = useCallback(() => {
    if (!root) return;
    const s = inspectStore.getSnapshot();
    const scroller = root.closest('.editor-scroller');
    if (!scroller) return;
    const origin = scroller.getBoundingClientRect();
    const place = (node, el, visible) => {
      if (!node) return;
      if (!visible || !el || !el.isConnected) {
        node.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      node.style.display = 'block';
      node.style.transform = `translate(${r.left - origin.left + scroller.scrollLeft}px, ${r.top - origin.top + scroller.scrollTop}px)`;
      node.style.width = `${r.width}px`;
      node.style.height = `${r.height}px`;
    };
    // Typing clears the editor: every overlay hides until the pointer moves again.
    const live = s.enabled && !s.typing;
    const selectedEl = s.pinned && s.pinned.el;
    // The selected style wins when the hovered element is the selected one.
    const hoverEl = s.hover && s.hover.el !== selectedEl ? s.hover.el : null;
    place(hoverRef.current, hoverEl, live && !!hoverEl);
    place(selectedRef.current, selectedEl, live && !!selectedEl);
    // The caret block is the target when nothing was picked; skip it when it is the picked one.
    const caretBlock = s.caret ? blockFor(root, s.caret.el) : null;
    place(caretRef.current, caretBlock !== selectedEl ? caretBlock : null, live && !!caretBlock);
  }, [root]);

  useLayoutEffect(position);
  useEffect(() => inspectStore.subscribeLayout(position), [position]);

  return (
    <div className="inspect-layer" aria-hidden="true">
      <div ref={caretRef} className="inspect-box inspect-box-caret" />
      <div ref={hoverRef} className="inspect-box inspect-box-hover" />
      <div ref={selectedRef} className="inspect-box inspect-box-selected" />
    </div>
  );
}
