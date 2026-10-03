import { describe, it, expect } from 'vitest';
import { styleDelta, ANIMATED_PROPS } from '../lexical-demo/src/animateStyle.js';

const base = Object.fromEntries(ANIMATED_PROPS.map((p) => [p, '0px']));

describe('styleDelta', () => {
  it('returns null when nothing animatable changed', () => {
    expect(styleDelta(base, { ...base })).toBeNull();
  });

  it('keeps only the changed properties, camel-cased, as from/to keyframes', () => {
    const after = { ...base, 'padding-top': '32px', color: 'rgb(1, 2, 3)' };
    const before = { ...base, color: 'rgb(0, 0, 0)' };
    expect(styleDelta(before, after)).toEqual([
      { color: 'rgb(0, 0, 0)', paddingTop: '0px' },
      { color: 'rgb(1, 2, 3)', paddingTop: '32px' },
    ]);
  });

  it('ignores properties that are not animated, such as display', () => {
    expect(styleDelta({ ...base, display: 'block' }, { ...base, display: 'flex' })).toBeNull();
  });
});
