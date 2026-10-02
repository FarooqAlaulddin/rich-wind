import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * One Tab stop for a group of controls, arrows inside it. Mark each control
 * `data-nav`; controls that share `data-row` form a row (Left and Right move
 * along it, Up and Down jump to the same position in the next row). A control
 * marked `data-current` is where the Tab stop starts. Spread the result on the
 * group's container. Tab stops are set on the DOM after every render, so
 * children do not need to know about the hook.
 */
export function useRoving() {
  const ref = useRef(null);
  const active = useRef(null);

  const items = useCallback(() => (
    ref.current ? [...ref.current.querySelectorAll('[data-nav]')].filter((el) => !el.disabled) : []
  ), []);

  const sync = useCallback(() => {
    const list = items();
    if (list.length === 0) return;
    const keep = active.current && list.includes(active.current) ? active.current : list.find((el) => el.hasAttribute('data-current')) || list[0];
    for (const el of list) el.tabIndex = el === keep ? 0 : -1;
  }, [items]);

  useLayoutEffect(sync);

  const onFocus = useCallback((e) => {
    const el = e.target.closest('[data-nav]');
    if (el && ref.current?.contains(el)) {
      active.current = el;
      sync();
    }
  }, [sync]);

  const onKeyDown = useCallback((e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const here = e.target.closest('[data-nav]');
    if (!here) return;
    const list = items();
    const row = (el) => el.getAttribute('data-row') || '';
    const same = list.filter((el) => row(el) === row(here));
    const at = same.indexOf(here);
    let next = null;
    if (e.key === 'ArrowRight') next = same[at + 1];
    else if (e.key === 'ArrowLeft') next = same[at - 1];
    else if (e.key === 'Home') next = same[0];
    else if (e.key === 'End') next = same[same.length - 1];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rows = [...new Set(list.map(row))];
      const to = rows[rows.indexOf(row(here)) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (to !== undefined) {
        const target = list.filter((el) => row(el) === to);
        next = target[Math.min(at, target.length - 1)];
      }
    } else return;
    e.preventDefault();
    if (next) next.focus();
  }, [items]);

  return { ref, onFocus, onKeyDown };
}
