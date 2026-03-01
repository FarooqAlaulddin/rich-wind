import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

/**
 * Preserves a visual selection highlight when focus leaves the editor
 * (e.g. when the user clicks the inspector panel to add a class).
 * On focus return the real selection is restored and the overlays removed.
 */
export default function SelectionPreservePlugin() {
  const [editor] = useLexicalComposerContext();
  const overlaysRef = useRef([]);
  const savedRangeRef = useRef(null);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const scroller = root.closest('.editor-scroller');
    if (!scroller) return;

    function clearOverlays() {
      overlaysRef.current.forEach((el) => el.remove());
      overlaysRef.current = [];
    }

    function onBlur() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;

      savedRangeRef.current = range.cloneRange();

      const rects = range.getClientRects();
      const scrollerRect = scroller.getBoundingClientRect();

      for (const rect of rects) {
        if (rect.width === 0) continue;
        const el = document.createElement('div');
        el.className = 'selection-preserve-highlight';
        el.style.cssText = [
          'position:absolute',
          'pointer-events:none',
          'z-index:1',
          `left:${rect.left - scrollerRect.left + scroller.scrollLeft}px`,
          `top:${rect.top - scrollerRect.top + scroller.scrollTop}px`,
          `width:${rect.width}px`,
          `height:${rect.height}px`,
        ].join(';');
        scroller.appendChild(el);
        overlaysRef.current.push(el);
      }
    }

    function onFocus() {
      clearOverlays();
      if (savedRangeRef.current) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
        savedRangeRef.current = null;
      }
    }

    root.addEventListener('blur', onBlur);
    root.addEventListener('focus', onFocus);

    return () => {
      root.removeEventListener('blur', onBlur);
      root.removeEventListener('focus', onFocus);
      clearOverlays();
    };
  }, [editor]);

  return null;
}
