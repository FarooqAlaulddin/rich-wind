import { useCallback, useEffect } from 'react';
import { entryFor, groupOf, splitToken, DARK_VARIANT, normalizePrefix } from '../classCatalog';
import { synthEntry } from '../search/cssQuery';
import { showPreview, showHighlightPreview, revertPreview, canPreviewPrefix } from '../stylePreview';
import { selectionRange } from '../editorActions';

/**
 * The inline declarations that stand in for `token`, or null when it cannot be
 * drawn that way (unknown class, hover/focus variant, viewport too small, or a
 * dark: class of the same group would win in dark mode).
 */
export function previewDecls(token, classes) {
  const split = splitToken(token);
  const { base } = split;
  const prefix = normalizePrefix(split.prefix);
  const entry = entryFor(base) || synthEntry(base);
  if (!entry || !canPreviewPrefix(prefix)) return null;
  // In dark mode a dark: class of the same group wins over a plain class,
  // so previewing the plain one would show something that will not happen.
  if (!prefix && document.documentElement.classList.contains('theme-dark')) {
    const group = groupOf(base);
    const shadowed = classes.some((c) => {
      const s = splitToken(c);
      return s.prefix === DARK_VARIANT && groupOf(s.base) === group;
    });
    if (shadowed) return null;
  }
  return entry.d;
}

/** previewDecls for one token or a list; null when none of them can be drawn. */
export function previewDeclsOf(tokens, classes) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).flatMap((t) => previewDecls(t, classes) || []);
  return list.length ? list : null;
}

/**
 * Hover preview of a class on the current style target, drawn with inline
 * styles from the static catalog (see stylePreview.js). Returns
 * { preview(token), clear() }. `token` is one class or a list (the Layout
 * options set several). preview() reports whether anything was drawn. A
 * fresh text selection (no span yet) is painted with a highlight, which can
 * show color, background and decoration but not size or spacing.
 */
export function useClassPreview(target, editor) {
  const { spec, getEl, classes } = target;

  const clear = useCallback(() => revertPreview(), []);

  const preview = useCallback((token) => {
    const el = getEl();
    const decls = el || target.fresh ? previewDeclsOf(token, classes) : null;
    // A fresh selection has no element yet: paint the text with a highlight instead.
    if (decls && !el) {
      const drawn = showHighlightPreview(selectionRange(editor), decls);
      if (!drawn) revertPreview();
      return drawn;
    }
    if (!decls) {
      revertPreview();
      return false;
    }
    showPreview(el, decls);
    return true;
  }, [getEl, classes, target.fresh, editor]);

  // Drop any preview when the target changes or the panel goes away.
  useEffect(() => revertPreview, [spec]);
  useEffect(() => {
    const onBlur = () => revertPreview();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  return { preview, clear };
}
