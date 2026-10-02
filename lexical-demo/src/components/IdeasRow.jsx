import React, { useState } from 'react';
import { useRoving } from '../hooks/useRoving';

const LABEL = {
  warming: 'Local AI is preparing',
  thinking: 'Thinking',
  none: 'Local interpretation unavailable',
};

/**
 * The Suggestions row, last in the panel: ideas for a phrase the word rules
 * did not understand. Each item says where it came from: a local model
 * (Gemini Nano) or the closest known phrase (embeddings, "rules"). It never
 * applies anything by itself and never takes focus; its buttons join the
 * roving group (arrow keys from the cards reach them).
 */
export default function IdeasRow({ state, items, onPick, onPreview, onLeave, onEnable }) {
  const roving = useRoving();
  const [why, setWhy] = useState(null);
  if (state === 'off') return null;

  return (
    <div className="shelf-ideas" role="group" aria-label="Suggestions" aria-busy={state === 'thinking' || state === 'warming'} {...roving}>
      <span className="ideas-tag">Suggestions</span>
      {state === 'ready' && items[0] && <span className="ideas-source" title={items[0].how === 'semantic' ? 'Matched to the closest known phrase' : 'Written by the on-device model'}>{items[0].how === 'semantic' ? 'rules' : 'local model'}</span>}
      {state === 'download' && (
        <button type="button" data-nav data-row="ideas" className="ideas-enable" onClick={onEnable}>Enable AI ideas</button>
      )}
      {LABEL[state] && <span className="ideas-status" role="status">{LABEL[state]}</span>}
      {state === 'ready' && items.map((it) => (
        <div key={it.key} className={`card is-bundle${why === it.key ? ' is-why' : ''}`}>
          <button
            type="button"
            data-nav
            data-row="ideas"
            className="card-main"
            onClick={() => onPick(it)}
            onMouseEnter={() => onPreview(it)}
            onMouseLeave={onLeave}
            onFocus={() => onPreview(it)}
            onBlur={onLeave}
          >
            <span className="card-cls">{it.title}</span>
            <span className="card-word">{it.hint}</span>
          </button>
          <button
            type="button"
            data-nav
            data-row="ideas"
            className="card-why"
            aria-pressed={why === it.key}
            title="Show the classes this adds"
            onClick={() => setWhy(why === it.key ? null : it.key)}
          >
            why
          </button>
          {why === it.key && (
            <code className="card-css">
              {[...it.bundle, ...(it.removed || []).map((r) => `-${r}`)].join(' ')}
              {it.css ? ` ${it.css}` : ''}
            </code>
          )}
        </div>
      ))}
    </div>
  );
}
