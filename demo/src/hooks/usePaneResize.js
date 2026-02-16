import { useRef, useCallback } from 'preact/hooks';

const MIN_HEIGHT = 520;
const MAX_HEIGHT = 2200;
const clamp = (v) => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, v));

export function usePaneResize(storageKey) {
  const paneRef = useRef(null);

  const restoreHeight = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    try {
      if (window.matchMedia?.('(max-width: 1100px)').matches) return;
      const saved = localStorage.getItem(storageKey);
      const h = parseInt(saved, 10);
      if (Number.isFinite(h)) {
        pane.style.height = clamp(h) + 'px';
        document.body.classList.add('pane-resized');
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  const onPointerDown = useCallback((e) => {
    if (window.matchMedia?.('(max-width: 1100px)').matches) return;
    const pane = paneRef.current;
    if (!pane) return;
    e.preventDefault();
    const paneTop = pane.getBoundingClientRect().top + window.scrollY;
    let lastY = e.clientY;
    let active = true;
    e.target.setPointerCapture(e.pointerId);
    document.body.classList.add('pane-resizing', 'pane-resized');

    function apply() {
      pane.style.height = clamp(lastY + window.scrollY - paneTop) + 'px';
    }

    function onMove(ev) {
      if (!active) return;
      lastY = ev.clientY;
      apply();
    }

    function finish() {
      if (!active) return;
      active = false;
      document.body.classList.remove('pane-resizing');
      try {
        localStorage.setItem(storageKey, Math.round(pane.getBoundingClientRect().height));
      } catch { /* ignore */ }
    }

    e.target.addEventListener('pointermove', onMove);
    e.target.addEventListener('pointerup', () => {
      e.target.removeEventListener('pointermove', onMove);
      finish();
    }, { once: true });
    e.target.addEventListener('pointercancel', () => {
      e.target.removeEventListener('pointermove', onMove);
      finish();
    }, { once: true });

    apply();
  }, [storageKey]);

  return { paneRef, onPointerDown, restoreHeight };
}
