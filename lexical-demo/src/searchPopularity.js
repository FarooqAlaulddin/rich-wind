// Popularity prior, 0 to 100: how likely a class is what someone wants when
// the query is vague. Common scale values and common utilities lead.

const STEM = {
  p: 100, px: 95, py: 85, pt: 60, pb: 60, pl: 55, pr: 55, m: 80, mx: 90, my: 70, mt: 75, mb: 75, ml: 55, mr: 55,
  gap: 90, 'gap-x': 50, 'gap-y': 50, 'space-x': 65, 'space-y': 70, text: 100, bg: 100, font: 95, rounded: 100,
  shadow: 100, border: 90, w: 95, h: 90, 'max-w': 85, 'min-h': 70, 'min-w': 45, flex: 100, grid: 85,
  'grid-cols': 85, items: 90, justify: 90, opacity: 80, leading: 70, tracking: 65, ring: 70, size: 60, z: 55,
  top: 40, bottom: 35, left: 40, right: 40, inset: 40, overflow: 70, cursor: 60, transition: 70, duration: 55,
  rotate: 55, scale: 55, translate: 40, blur: 45, 'line-clamp': 50, 'border-t': 55, 'border-b': 60, 'rounded-t': 40,
  'rounded-b': 40, aspect: 45, object: 50, order: 25, col: 35, row: 25,
};
const STANDALONE = {
  flex: 100, hidden: 90, block: 85, grid: 85, italic: 80, underline: 80, uppercase: 75, truncate: 75, relative: 80,
  absolute: 75, fixed: 55, sticky: 60, border: 90, rounded: 90, shadow: 90, transition: 70, container: 60,
  'inline-block': 60, inline: 50, lowercase: 40, capitalize: 50, 'sr-only': 20, antialiased: 40, ring: 60,
};
const SPACE = {
  0: 55, px: 35, 0.5: 30, 1: 75, 1.5: 25, 2: 90, 2.5: 30, 3: 80, 3.5: 20, 4: 100, 5: 60, 6: 85, 7: 30, 8: 80,
  9: 25, 10: 55, 11: 20, 12: 65, 14: 30, 16: 55, 20: 40, 24: 35, 32: 30, 40: 20, 48: 20, 64: 20,
};
const NAMED = {
  md: 100, lg: 90, sm: 80, base: 90, xl: 75, xs: 55, '2xl': 65, '3xl': 55, '4xl': 45, '5xl': 35, '6xl': 25,
  full: 90, none: 70, auto: 70, screen: 60, center: 100, between: 80, start: 70, end: 70, bold: 100, semibold: 95,
  medium: 80, normal: 70, light: 60, thin: 30, black: 40, extrabold: 50, white: 95, transparent: 70, col: 90,
  row: 70, wrap: 70, hidden: 60, auto_: 60, pointer: 100, left: 80, right: 80, justify: 40, relaxed: 60, tight: 60,
  wide: 60, snug: 40, loose: 45, evenly: 50, around: 50, stretch: 60, baseline: 30, '2xs': 20, inner: 25,
};
const SHADE = { 500: 100, 600: 85, 400: 80, 700: 70, 300: 65, 200: 50, 100: 45, 800: 45, 900: 40, 50: 35, 950: 30 };
const FAMILY = {
  blue: 100, gray: 95, red: 90, green: 85, slate: 80, indigo: 70, zinc: 65, neutral: 60, yellow: 60, purple: 60,
  orange: 60, pink: 55, emerald: 50, sky: 50, teal: 45, amber: 45, violet: 45, rose: 40, cyan: 40, lime: 35,
  fuchsia: 30, stone: 40,
};
const LOW_LABEL = /^(Mask|Scroll spacing|Border spacing|Will change|Font variant|Perspective|Contain|Touch action|Break |Forced|Transform box|Field sizing|Caption|Grid auto|Background blend|Mix blend|Backface)/;

/**
 * @param {string} stem class without its last dash segment ("bg-blue")
 * @param {string} val last segment ("500"), "" when the class has no dash
 * @param {string} label group label
 * @param {boolean} neg class starts with "-"
 */
export function popularity(stem, val, label, neg) {
  let s;
  if (!val) {
    s = STANDALONE[stem] ?? 30;
  } else {
    const family = stem.slice(stem.lastIndexOf('-') + 1);
    const base = STEM[stem] ?? STEM[stem.replace(/-[a-z]+$/, '')] ?? (FAMILY[family] !== undefined ? STEM[stem.slice(0, stem.lastIndexOf('-'))] ?? 40 : 25);
    let v;
    if (FAMILY[family] !== undefined && SHADE[val] !== undefined) v = SHADE[val] * 0.7 + FAMILY[family] * 0.3;
    else if (SPACE[val] !== undefined) v = SPACE[val];
    else if (NAMED[val] !== undefined) v = NAMED[val];
    else v = 15;
    s = base * 0.55 + v * 0.45;
  }
  if (LOW_LABEL.test(label)) s = Math.min(s, 6);
  if (neg) s *= 0.4;
  return Math.round(Math.max(0, Math.min(100, s)));
}
