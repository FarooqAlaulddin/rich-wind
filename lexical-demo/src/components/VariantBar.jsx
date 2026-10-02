import React from 'react';
import { COMMON_VARIANTS, variantGroups, appliesAs } from '../search/variants';
import { useRoving } from '../hooks/useRoving';

/**
 * The scope row of the panel: where the class applies (everywhere, from a
 * breakpoint, in dark mode, on hover). It is the one source of the prefix for
 * everything the shelf adds. `scope` is the effective stack; `typed` are the
 * ids that came from words in the Make it field.
 */
export default function VariantBar({ scope, typed, onToggle, onBase, moreOpen, onMore }) {
  const roving = useRoving();
  const extra = scope.filter((id) => !COMMON_VARIANTS.includes(id));

  const chip = (id) => (
    <button
      key={id}
      type="button"
      data-nav
      className={`vchip${scope.includes(id) ? ' is-on' : ''}${typed.includes(id) ? ' is-typed' : ''}`}
      aria-pressed={scope.includes(id)}
      title={typed.includes(id) ? 'Set by a word in Make it; click to remove the word' : undefined}
      onClick={() => onToggle(id)}
    >
      {id}
    </button>
  );

  return (
    <div className="shelf-scope">
      <div className="vbar" role="toolbar" aria-label="Applies at" {...roving}>
        <button type="button" data-nav className={`vchip${scope.length === 0 ? ' is-on' : ''}`} aria-pressed={scope.length === 0} onClick={onBase}>
          Base
        </button>
        {COMMON_VARIANTS.map(chip)}
        {extra.map(chip)}
        <button type="button" data-nav className="vchip vchip-more" aria-expanded={moreOpen} onClick={() => onMore(!moreOpen)}>
          More
        </button>
        {moreOpen && (
          <div className="vmore" role="group" aria-label="More variants">
            {variantGroups().filter((g) => g.ids.length > 0).map((g) => (
              <div key={g.id} className="vmore-group">
                <span className="vmore-title">{g.id}</span>
                <span className="vmore-chips">{g.ids.map(chip)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className="shelf-applies" aria-live="polite">{appliesAs(scope)}</span>
      <span className="shelf-fine">md/lg/dark follow the browser window</span>
    </div>
  );
}
