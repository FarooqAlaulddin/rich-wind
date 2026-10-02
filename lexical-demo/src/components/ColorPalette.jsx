import React, { useState, useEffect } from 'react';
import { PALETTE_PROPS, SHADES, FAMILIES, paletteGrid } from '../search/palette';
import { chipWord } from '../shelf/intents';

const MAIN = ['text', 'bg', 'border', 'ring', 'from'];
const TITLE = { from: 'Gradient' };

const DEFAULT_FAMILY = 'blue';

/** The family of the color class `token` (text-red-500 -> red), or null. */
function familyOf(token) {
  const m = /^(?:[a-z]+-)*?([a-z]+)-\d+$/.exec(token || '');
  return m && FAMILIES.includes(m[1]) ? m[1] : null;
}

/**
 * The shared palette: pick a property (Text, Background, ...), a color family,
 * then a shade. One family shows at a time, as a single strip of shades;
 * `current` is the target's color for the chosen property and carries the
 * highlight. `family` (set by words like "background blue") picks the family.
 */
export default function ColorPalette({ prop, onProp, family, onFamily, prefix, current, onPick, onPreview, onLeave }) {
  const [more, setMore] = useState(false);
  const [fam, setFam] = useState(() => (FAMILIES.includes(family) ? family : familyOf(current) || DEFAULT_FAMILY));
  useEffect(() => {
    if (FAMILIES.includes(family)) setFam(family);
  }, [family]);
  const showMore = more || !MAIN.includes(prop);
  const grid = paletteGrid(prop, prefix);
  const rows = grid.rows.filter((r) => r.family === fam);
  const specials = grid.specials;
  const dotOf = (r) => (r.cells.find((c) => c.token.endsWith('-500')) || r.cells[0]).color;

  const propChip = (p) => (
    <button
      key={p.id}
      type="button"
      data-nav
      data-row="props"
      className={`pchip${p.id === prop ? ' is-on' : ''}`}
      aria-pressed={p.id === prop}
      title={p.title}
      onClick={() => onProp(p.id)}
    >
      {TITLE[p.id] || p.title}
    </button>
  );

  const swatch = (cell, row) => (
    <button
      key={cell.cls}
      type="button"
      data-nav
      data-row={row}
      data-cls={cell.cls.slice(prefix.length)}
      {...(current === cell.token ? { 'data-current': '' } : {})}
      className={`swatch${current === cell.token ? ' is-current' : ''}${cell.token === 'transparent' ? ' is-clear' : ''}`}
      style={{ background: cell.color }}
      title={`${cell.cls} ${chipWord(cell.cls)}`.trim()}
      aria-label={cell.cls}
      onClick={() => onPick(cell.cls)}
      onMouseEnter={() => onPreview(cell.cls)}
      onMouseLeave={onLeave}
      onFocus={() => onPreview(cell.cls)}
      onBlur={onLeave}
    />
  );

  return (
    <div className="palette">
      <div className="palette-props" role="group" aria-label="Color property">
        {PALETTE_PROPS.filter((p) => MAIN.includes(p.id)).map(propChip)}
        <button type="button" data-nav data-row="props" className="pchip pchip-more" aria-expanded={showMore} onClick={() => setMore(!showMore)}>
          More
        </button>
        {showMore && PALETTE_PROPS.filter((p) => !MAIN.includes(p.id)).map(propChip)}
      </div>
      <div className="palette-fams" role="group" aria-label="Color family">
        {grid.rows.map((r) => (
          <button
            key={r.family}
            type="button"
            data-nav
            data-row="fams"
            className={`fam-dot${r.family === fam ? ' is-on' : ''}`}
            style={{ background: dotOf(r) }}
            title={r.family}
            aria-label={r.family}
            aria-pressed={r.family === fam}
            onClick={() => { setFam(r.family); onFamily(r.family); }}
          />
        ))}
      </div>
      <div className="palette-grid" role="group" aria-label={`${TITLE[prop] || prop} colors, ${fam}`}>
        <div className="palette-row palette-head" aria-hidden="true">
          {SHADES.map((s) => <span key={s}>{s}</span>)}
        </div>
        {rows.map((r) => (
          <div key={r.family} className="palette-row">
            {r.cells.map((c) => swatch(c, r.family))}
          </div>
        ))}
        {specials.length > 0 && (
          <div className="palette-row palette-basic">
            {specials.map((c) => swatch(c, 'basic'))}
          </div>
        )}
      </div>
    </div>
  );
}
