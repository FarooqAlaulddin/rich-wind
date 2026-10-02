// Tiny external store for selection state. Hover changes at pointer speed, so
// it lives outside React state: only the overlay and the style panel
// subscribe, and the Lexical editor never re-renders.
//
// A target is { el, path }. `path` (child indices from the editor root) lets a
// pinned target be found again when Lexical replaces its DOM node.

// Tracking is always on: hover, the picked element and the caret block are
// always followed, so the panel always knows what it is styling.
let state = { enabled: true, typing: false, hover: null, pinned: null, caret: null, rev: 0 };
const listeners = new Set();
const layoutListeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export const inspectStore = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => state,

  /** Merge a patch; no-op (and no notification) when nothing changed. */
  set(patch) {
    let changed = false;
    for (const key of Object.keys(patch)) {
      const a = state[key];
      const b = patch[key];
      const same = a === b || (a && b && a.el !== undefined && a.el === b.el);
      if (!same) { changed = true; break; }
    }
    if (!changed) return;
    state = { ...state, ...patch };
    emit();
    layoutListeners.forEach((fn) => fn());
  },

  /** Force subscribers to re-read DOM-derived data (class list changed). */
  touch() {
    state = { ...state, rev: state.rev + 1 };
    emit();
  },

  /** Layout listeners reposition overlays without a React render. */
  subscribeLayout(fn) {
    layoutListeners.add(fn);
    return () => layoutListeners.delete(fn);
  },
  layout() {
    layoutListeners.forEach((fn) => fn());
  },
};

/** What the style panel should show: selected > hover > caret. A selection
 *  stays put while the pointer moves; the strip still shows the hover. */
export function activeTarget(s) {
  if (s.pinned) return { target: s.pinned, source: 'pinned' };
  if (s.enabled && !s.typing && s.hover) return { target: s.hover, source: 'hover' };
  if (s.caret) return { target: s.caret, source: 'caret' };
  return { target: null, source: null };
}
