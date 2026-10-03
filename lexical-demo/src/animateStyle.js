// Animates an element from the look it had to the look it has now, so adding,
// removing or previewing a class eases into place instead of jumping. Works
// when Lexical re-creates the element on a class change: the snapshot is taken
// from the old element and played on the new one. Only properties that can
// interpolate are animated; the rest (display, gradients) change at once.

import { inspectStore } from './inspect/inspectStore';

export const DURATION_MS = 220;
const EASING = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export const ANIMATED_PROPS = [
  'color', 'background-color', 'opacity', 'box-shadow', 'text-decoration-color', 'outline-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
  'row-gap', 'column-gap', 'max-width',
];

const camel = (prop) => prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** The from/to keyframes for the properties that changed, or null when nothing did. */
export function styleDelta(before, after) {
  const from = {};
  const to = {};
  for (const prop of ANIMATED_PROPS) {
    if (before[prop] === undefined || after[prop] === undefined || before[prop] === after[prop]) continue;
    from[camel(prop)] = before[prop];
    to[camel(prop)] = after[prop];
  }
  return Object.keys(from).length ? [from, to] : null;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function read(el) {
  const cs = getComputedStyle(el);
  const values = {};
  for (const prop of ANIMATED_PROPS) values[prop] = cs.getPropertyValue(prop);
  return values;
}

const running = new WeakMap();

/** What `el` looks like right now (mid-animation values included), or null when nothing should animate. */
export function captureStyle(el) {
  if (!el || !el.isConnected || typeof el.animate !== 'function' || reducedMotion()) return null;
  return read(el);
}

/** Plays `el` from the captured look to its current one. */
export function animateFrom(before, el) {
  if (!before || !el || !el.isConnected || typeof el.animate !== 'function') return;
  // A change during a running animation restarts from where it was (`before` was read mid-flight).
  running.get(el)?.cancel();
  const frames = styleDelta(before, read(el));
  if (!frames) return;
  const anim = el.animate(frames, { duration: DURATION_MS, easing: EASING });
  running.set(el, anim);
  // The selection outline follows the element while it changes size.
  const follow = () => {
    inspectStore.layout();
    if (anim.playState === 'running') requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  anim.finished.then(() => {
    if (running.get(el) === anim) running.delete(el);
    inspectStore.layout();
  }, () => {});
}

/** Runs `change` and animates `el` (or the element `change` returns) into its result. */
export function animateChange(el, change) {
  const before = captureStyle(el);
  const next = change();
  animateFrom(before, next || el);
}
