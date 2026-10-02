// Small color helpers for the class search: parse hex/rgb/hsl/oklch, convert,
// and find the nearest Tailwind palette colors.

import { PALETTE, SHADES } from './tailwindPalette';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function oklchToRgb(l, c, h) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
  return lin.map((v) => {
    const x = clamp(v, 0, 1);
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
  });
}

export function rgbToOklab([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function toHex(rgb) {
  return `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** [r, g, b] for #hex, rgb(), hsl() or oklch(); null for anything else. */
export function parseColor(input) {
  const s = String(input || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  const num = (p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p));
  if (parts.length < 3 || parts.slice(0, 3).some((p) => Number.isNaN(num(p)))) return null;
  if (m[1].startsWith('rgb')) {
    return parts.slice(0, 3).map((p) => clamp(Math.round(p.endsWith('%') ? num(p) * 255 : num(p)), 0, 255));
  }
  if (m[1].startsWith('hsl')) return hslToRgb(parseFloat(parts[0]), num(parts[1]), num(parts[2]));
  return oklchToRgb(num(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
}

let palette = null;

/** Every palette color plus white and black: { name, rgb, lab }. */
export function paletteColors() {
  if (palette) return palette;
  palette = [];
  for (const [family, row] of Object.entries(PALETTE)) {
    SHADES.forEach((shade, i) => {
      const [l, c, h] = row[i].split(/\s+/).map(parseFloat);
      const rgb = oklchToRgb(l / 100, c, h);
      palette.push({ name: `${family}-${shade}`, rgb, lab: rgbToOklab(rgb) });
    });
  }
  for (const [name, rgb] of [['white', [255, 255, 255]], ['black', [0, 0, 0]]]) {
    palette.push({ name, rgb, lab: rgbToOklab(rgb) });
  }
  return palette;
}

/** The `n` palette colors closest to `rgb`, nearest first: [{ name, dist }]. */
export function nearestColors(rgb, n = 3) {
  const lab = rgbToOklab(rgb);
  return paletteColors()
    .map((p) => ({ name: p.name, dist: Math.hypot(p.lab[0] - lab[0], p.lab[1] - lab[1], p.lab[2] - lab[2]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}
