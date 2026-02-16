import { useRef, useEffect, useCallback } from 'preact/hooks';

export function useSplitter(gridRef) {
  const dragging = useRef(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const saved = localStorage.getItem('rw-split');
      if (saved) grid.style.setProperty('--left-pane', saved + 'px');
    } catch { /* ignore */ }
  }, [gridRef]);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    e.target.setPointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!dragging.current || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const maxLeft = rect.width - 360 - 12;
      const next = Math.max(360, Math.min(maxLeft, e.clientX - rect.left));
      gridRef.current.style.setProperty('--left-pane', next + 'px');
    }

    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      const grid = gridRef.current;
      if (grid) {
        const value = grid.style.getPropertyValue('--left-pane');
        if (value) {
          try { localStorage.setItem('rw-split', parseInt(value, 10)); } catch { /* ignore */ }
        }
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gridRef]);

  return { onPointerDown };
}
