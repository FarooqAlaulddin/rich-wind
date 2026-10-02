import React, { useState } from 'react';
import { useRoving } from '../hooks/useRoving';
import { chipWord } from '../shelf/intents';

/** "3 classes" or "-2 +1": what a bundle card does, in a few characters. */
function bundleSummary(it) {
  const add = it.bundle.length;
  const gone = (it.removed || []).length;
  if (add && !gone) return `${add} class${add === 1 ? '' : 'es'}`;
  if (!add) return `removes ${gone}`;
  return `+${add} -${gone}`;
}

const VISIBLE = 3;

/**
 * Three cards for what the Make it field found (the rest behind "more"): the
 * class, its plain label, a swatch for a color. Hover or focus previews it,
 * click or Enter applies it, "why" shows the CSS it resolves to.
 */
export default function CandidateStrip({ items, onPick, onPreview, onLeave }) {
  const roving = useRoving();
  const [why, setWhy] = useState(null);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, VISIBLE);
  const hidden = items.length - VISIBLE;

  return (
    <div className="shelf-cards" role="group" aria-label="Matches" {...roving}>
      {shown.map((it) => (
        <div key={it.key || it.cls} className={`card${why === (it.key || it.cls) ? ' is-why' : ''}${it.bundle ? ' is-bundle' : ''}`}>
          <button
            type="button"
            data-nav
            data-row="cards"
            className="card-main"
            onClick={() => onPick(it)}
            onMouseEnter={() => onPreview(it)}
            onMouseLeave={onLeave}
            onFocus={() => onPreview(it)}
            onBlur={onLeave}
          >
            {it.color && <i className="card-swatch" style={{ background: it.color }} />}
            <span className="card-cls">{it.bundle ? it.title : it.cls}</span>
            <span className="card-word">{it.bundle ? bundleSummary(it) : (chipWord(it.base) || it.label)}</span>
          </button>
          <button
            type="button"
            data-nav
            data-row="cards"
            className="card-why"
            aria-pressed={why === (it.key || it.cls)}
            title="Show the CSS this class resolves to"
            onClick={() => setWhy(why === (it.key || it.cls) ? null : (it.key || it.cls))}
          >
            why
          </button>
          {why === (it.key || it.cls) && <code className="card-css">{it.css || it.hint}</code>}
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" data-nav data-row="cards" className="cards-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'fewer' : `${hidden} more`}
        </button>
      )}
    </div>
  );
}
