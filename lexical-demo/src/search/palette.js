// One color palette for the picker and the search: families x shades plus the
// special colors, shared by every color property. You pick the property (Text,
// Background, Border, ...) and then the swatch; the class is the property
// prefix plus the color (bg-red-400). No UI in here.

import { PALETTE, SHADES } from '../tailwindPalette';
import { splitTokenSimple } from './tokens';

export const SPECIAL = ['white', 'black', 'transparent'];
export const SPECIAL_VALUES = { white: '#ffffff', black: '#000000', transparent: 'transparent' };
const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
/** Neutrals first, then the hues in Tailwind's order. */
export const FAMILIES = [...NEUTRALS, ...Object.keys(PALETTE).filter((f) => !NEUTRALS.includes(f))];
export { SHADES };

/** Property chips, in display order. `label` is the catalog group label the property edits. */
export const PALETTE_PROPS = [
  { id: 'text', prefix: 'text-', title: 'Text', label: 'Text color' },
  { id: 'bg', prefix: 'bg-', title: 'Background', label: 'Background color' },
  { id: 'border', prefix: 'border-', title: 'Border', label: 'Border color' },
  { id: 'ring', prefix: 'ring-', title: 'Ring', label: 'Ring color' },
  { id: 'outline', prefix: 'outline-', title: 'Outline', label: 'Outline color' },
  { id: 'decoration', prefix: 'decoration-', title: 'Decoration', label: 'Text decoration color' },
  { id: 'shadow', prefix: 'shadow-', title: 'Shadow', label: 'Shadow color' },
  { id: 'fill', prefix: 'fill-', title: 'Fill', label: 'Fill' },
  { id: 'stroke', prefix: 'stroke-', title: 'Stroke', label: 'Stroke' },
  { id: 'from', prefix: 'from-', title: 'Gradient from', label: 'Gradient from' },
  { id: 'via', prefix: 'via-', title: 'Gradient via', label: 'Gradient via' },
  { id: 'to', prefix: 'to-', title: 'Gradient to', label: 'Gradient to' },
];

const PROP_BY_ID = Object.fromEntries(PALETTE_PROPS.map((p) => [p.id, p]));
export const propById = (id) => PROP_BY_ID[id] || null;

/** Labels the palette chips cover (the search leaves these out of its sections). */
export const PALETTE_LABELS = new Set(PALETTE_PROPS.map((p) => p.label));

const COLOR_TOKEN = new RegExp(`^(?:white|black|transparent|current|inherit|(?:${FAMILIES.join('|')})-(?:${SHADES.join('|')}))(?:/(?:\\d+|\\[[^\\]]+\\]))?$|^\\[(?:#|rgb|hsl|oklch|oklab|color:|var\\(--)`);

/** True when `rest` (what follows the property prefix) is a color. */
export function isColorToken(rest) {
  return COLOR_TOKEN.test(rest);
}

/** The class for a property and a color token: ("bg", "red-400") -> "bg-red-400". */
export function paletteClass(propId, color) {
  const p = PROP_BY_ID[propId];
  return p ? `${p.prefix}${color}` : null;
}

/** CSS color of a palette token ("red-400", "white"), or null. */
export function swatchColor(token) {
  if (SPECIAL_VALUES[token]) return SPECIAL_VALUES[token];
  const m = /^([a-z]+)-(\d+)$/.exec(token || '');
  if (!m || !PALETTE[m[1]]) return null;
  const i = SHADES.indexOf(m[2]);
  return i < 0 ? null : `oklch(${PALETTE[m[1]][i]})`;
}

/**
 * The grid for one property: rows of families, each with its swatches.
 * Every cell carries the full class (with the variant prefix) so the UI can
 * show it, plus the swatch color.
 */
export function paletteGrid(propId, prefix = '') {
  const rows = FAMILIES.map((family) => ({
    family,
    cells: SHADES.map((shade) => {
      const token = `${family}-${shade}`;
      return { token, shade, cls: `${prefix}${paletteClass(propId, token)}`, color: swatchColor(token) };
    }),
  }));
  const specials = SPECIAL.map((token) => ({ token, cls: `${prefix}${paletteClass(propId, token)}`, color: swatchColor(token) }));
  return { prop: propId, rows, specials };
}

/**
 * Which colors a list of classes sets, by property: { text: "blue-600", bg: "white" }.
 * Only classes under `prefix` count (the variant bar's stack, "" for plain).
 */
export function colorsInUse(classes, prefix = '') {
  const out = {};
  for (const cls of classes || []) {
    const { prefix: p, base } = splitTokenSimple(cls);
    if (p !== prefix) continue;
    for (const prop of PALETTE_PROPS) {
      if (!base.startsWith(prop.prefix)) continue;
      const rest = base.slice(prop.prefix.length);
      if (isColorToken(rest)) out[prop.id] = rest;
    }
  }
  return out;
}

/** Which chip to open on: the property last used on this target, else Text. */
export function defaultProp(lastUsed) {
  return lastUsed && PROP_BY_ID[lastUsed] ? lastUsed : 'text';
}

/** Next chip when cycling: step is +1 or -1. */
export function cycleProp(propId, step = 1) {
  const i = PALETTE_PROPS.findIndex((p) => p.id === propId);
  return PALETTE_PROPS[(i + step + PALETTE_PROPS.length * 2) % PALETTE_PROPS.length].id;
}

/** Moves a swatch cursor over the grid: { row, col } by (dRow, dCol), clamped; specials are row = FAMILIES.length. */
export function moveCursor(pos, dRow, dCol) {
  const lastRow = FAMILIES.length; // the specials row
  const row = Math.min(lastRow, Math.max(0, pos.row + dRow));
  const width = row === lastRow ? SPECIAL.length : SHADES.length;
  const col = Math.min(width - 1, Math.max(0, pos.col + dCol));
  return { row, col };
}

/** The cell at a cursor position. */
export function cellAt(grid, pos) {
  if (pos.row >= grid.rows.length) return grid.specials[Math.min(pos.col, grid.specials.length - 1)];
  return grid.rows[pos.row].cells[Math.min(pos.col, SHADES.length - 1)];
}
