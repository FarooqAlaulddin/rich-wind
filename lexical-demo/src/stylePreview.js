// Hover preview for the style picker. The catalog knows what each class
// does, so a preview is a handful of inline style declarations written
// straight onto the target's DOM element. Nothing goes through Lexical: no
// editor update, no history entry, no React render of the editor, and no
// compile request. Reverting restores the element's original style attribute.
//
// After a click commits a class, the compiled CSS for it arrives a moment
// later. `hold` keeps the preview declarations on the (possibly re-created)
// element until that CSS shows up, so the element does not flash back to its
// old look in between.

import { inspectStore } from './inspect/inspectStore';
import { VARIANTS, DARK_VARIANT } from './classCatalog';

const HOLD_MAX_MS = 3000;
const STYLE_TAG_ID = 'rw-editor-css';

let preview = null; // { el, style }
let held = null;    // { el, style, cls, timer, observer }

function snapshot(el) {
  return el.getAttribute('style');
}

function restore(el, style) {
  if (!el || !el.isConnected) return;
  if (style === null || style === undefined) el.removeAttribute('style');
  else el.setAttribute('style', style);
}

function write(el, decls) {
  for (const [prop, value] of decls) el.style.setProperty(prop, value);
}

const HIGHLIGHT_NAME = 'rw-preview';
const HIGHLIGHT_TAG_ID = 'rw-preview-highlight';
// ::highlight() can only paint these; anything else (size, padding) cannot be previewed on loose text.
const HIGHLIGHT_PROPS = new Set(['color', 'background-color', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-shadow']);

function clearHighlight() {
  if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete(HIGHLIGHT_NAME);
  document.getElementById(HIGHLIGHT_TAG_ID)?.remove();
}

/**
 * Preview for text that has no element yet (a fresh selection): paints the
 * range with the CSS Custom Highlight API. Returns false when the browser or
 * the declarations cannot be drawn that way.
 */
export function showHighlightPreview(range, decls) {
  revertPreview();
  if (!range || typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights) return false;
  const paint = (decls || []).filter(([prop]) => HIGHLIGHT_PROPS.has(prop));
  if (paint.length === 0) return false;
  const tag = document.createElement('style');
  tag.id = HIGHLIGHT_TAG_ID;
  tag.textContent = `::highlight(${HIGHLIGHT_NAME}) { ${paint.map(([p, v]) => `${p}: ${v}`).join('; ')} }`;
  document.head.appendChild(tag);
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
  return true;
}

export function revertPreview() {
  clearHighlight();
  if (!preview) return;
  restore(preview.el, preview.style);
  preview = null;
  inspectStore.layout();
}

export function showPreview(el, decls) {
  if (preview && preview.el === el) {
    restore(el, preview.style);
  } else {
    revertPreview();
  }
  if (!el || !el.isConnected || !decls || decls.length === 0) return;
  preview = { el, style: snapshot(el) };
  write(el, decls);
  inspectStore.layout();
}

function releaseHold() {
  if (!held) return;
  held.observer?.disconnect();
  clearTimeout(held.timer);
  // A hover preview may be drawn over the held style: when it ends it must
  // restore the un-held original, not the held declarations.
  if (preview && preview.el === held.el) preview.style = held.style;
  restore(held.el, held.style);
  held = null;
  inspectStore.layout();
}

/** Keep `decls` on `el` until the compiled CSS contains `cls` (or a timeout). */
export function hold(el, decls, cls) {
  releaseHold();
  if (!el || !el.isConnected || !decls || decls.length === 0) return;
  const style = snapshot(el);
  write(el, decls);
  const tag = document.getElementById(STYLE_TAG_ID);
  const needle = typeof CSS !== 'undefined' && CSS.escape ? `.${CSS.escape(cls)}` : null;
  const check = () => {
    if (needle && tag && tag.textContent.includes(needle)) releaseHold();
  };
  const observer = tag && typeof MutationObserver === 'function' ? new MutationObserver(check) : null;
  observer?.observe(tag, { childList: true, characterData: true, subtree: true });
  held = { el, style, cls, observer, timer: setTimeout(releaseHold, HOLD_MAX_MS) };
}

/**
 * Whether a preview of a class under `prefix` can be drawn with inline
 * styles. State variants (hover, focus) cannot, breakpoints depend on the
 * viewport, and the dark variant only shows while the demo is in dark mode.
 */
export function canPreviewPrefix(prefix) {
  if (!prefix) return true;
  const segments = prefix.slice(0, -1).split(/:(?![^[]*\])/);
  for (const seg of segments) {
    if (seg === DARK_VARIANT.slice(0, -1)) {
      if (!document.documentElement.classList.contains('theme-dark')) return false;
      continue;
    }
    const v = VARIANTS.find((x) => x.id === seg && x.kind === 'breakpoint');
    if (v) {
      if (!window.matchMedia(`(min-width: ${v.minWidth}px)`).matches) return false;
      continue;
    }
    return false;
  }
  return true;
}
