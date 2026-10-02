import React from 'react';
import { useRoving } from '../hooks/useRoving';
import { currentInGroup } from '../classEdit';
import { groupOf, splitToken, normalizePrefix } from '../classCatalog';
import { colorsInUse, swatchColor } from '../search/palette';
import { chipWord } from '../shelf/intents';
import {
  SPACE_KINDS, SIDES, spaceStem, spaceClasses, TYPE_STRIPS, SHAPE_STRIPS, EFFECT_STRIPS, SHADOW_COLORS, GAP_STRIP, LAYOUT_OPTIONS,
} from '../shelf/strips';
import ColorPalette from './ColorPalette';

/** Short button labels for a strip: "text-xs text-sm" -> "xs", "sm"; a class that is just the stem reads "base". */
function labelsOf(classes) {
  const parts = classes.map((c) => c.split('-'));
  let n = 0;
  while (parts.every((p) => p.length > n + 1 && p[n] === parts[0][n])) n++;
  return classes.map((c, i) => {
    const rest = parts[i].slice(n).join('-');
    return rest || 'base';
  });
}

/** One row of buttons for a single conflict group; the current value is marked, hover or focus previews. */
function Strip({ strip, wire, classes, onApply, onPreview, onLeave, swatch }) {
  const group = groupOf(strip.classes[0]);
  const current = currentInGroup(classes, wire, group);
  const currentBase = current ? splitToken(current).base : null;
  const labels = labelsOf(strip.classes);
  return (
    <div className="strip" role="group" aria-label={strip.label}>
      <span className="strip-label">{strip.label}</span>
      <div className="strip-items">
        {strip.classes.map((base, i) => {
          const token = `${wire}${base}`;
          const isCurrent = base === currentBase;
          return (
            <button
              key={base}
              type="button"
              data-nav
              data-row={strip.id}
              data-cls={base}
              {...(isCurrent ? { 'data-current': '' } : {})}
              className={`strip-btn${isCurrent ? ' is-current' : ''}${swatch ? ' strip-swatch' : ''}`}
              style={swatch ? { background: swatch(base) } : undefined}
              title={`${base} ${chipWord(base)}`.trim()}
              aria-pressed={isCurrent}
              aria-label={base}
              onClick={() => onApply([token])}
              onMouseEnter={() => onPreview([token], { from: currentBase, to: base })}
              onMouseLeave={onLeave}
              onFocus={() => onPreview([token], { from: currentBase, to: base })}
              onBlur={onLeave}
            >
              {swatch ? '' : labels[i]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Choice({ rowId, label, options, value, onChange }) {
  return (
    <div className="choice" role="group" aria-label={label}>
      <span className="strip-label">{label}</span>
      <div className="strip-items">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            data-nav
            data-row={rowId}
            {...(o.id === value ? { 'data-current': '' } : {})}
            className={`pchip${o.id === value ? ' is-on' : ''}`}
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutOptions({ wire, classes, onApply, onPreview, onLeave }) {
  const has = (c) => classes.includes(`${wire}${c}`);
  return (
    <div className="layout-options" role="group" aria-label="Layout">
      {LAYOUT_OPTIONS.map((o) => {
        const isCurrent = o.has.every(has) && !(o.lacks || []).some(has);
        const tokens = o.add.map((c) => `${wire}${c}`);
        return (
          <button
            key={o.id}
            type="button"
            data-nav
            data-row="layout"
            data-cls={o.add[o.add.length - 1]}
            {...(isCurrent ? { 'data-current': '' } : {})}
            className={`lay-btn${isCurrent ? ' is-current' : ''}`}
            aria-pressed={isCurrent}
            title={o.add.join(' ')}
            onClick={() => onApply(tokens, o.drop)}
            onMouseEnter={() => onPreview(tokens, null)}
            onMouseLeave={onLeave}
            onFocus={() => onPreview(tokens, null)}
            onBlur={onLeave}
          >
            <span className={`lay lay-${o.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="lay-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AnythingList({ query, results, onApply, onPreview, onLeave }) {
  if (!query.trim()) return <p className="surface-empty">Type in Make it to search every Tailwind class.</p>;
  if (!results || results.items.length === 0) {
    return <p className="surface-empty">{results?.hints?.[0] || 'Nothing matches.'}</p>;
  }
  return (
    <div className="any-list">
      {results.groups.map((g) => (
        <div key={g.label} className="any-group">
          <h4 className="any-title">{g.label || 'Other'}</h4>
          {g.items.map((it) => (
            <button
              key={it.cls}
              type="button"
              data-nav
              data-row={g.label || 'Other'}
              className="any-item"
              onClick={() => onApply([it.cls])}
              onMouseEnter={() => onPreview([it.cls], null)}
              onMouseLeave={onLeave}
              onFocus={() => onPreview([it.cls], null)}
              onBlur={onLeave}
            >
              {it.color && <i className="card-swatch" style={{ background: it.color }} />}
              <span className="card-cls">{it.cls}</span>
              <span className="any-css">{it.css}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The open intent of the shelf. Every callback takes full tokens (the scope
 * prefix already on them), so what is shown is what is applied. onPreview gets
 * `{ from, to }` for strips, which feeds the scrub label.
 */
export default function IntentSurface({
  intent, classes, wire, space, onSpace, colorProp, onColorProp, family, onFamily,
  query, results, onApply, onPreview, onLeave, surfaceRef,
}) {
  const roving = useRoving();
  const props = { wire, classes, onApply, onPreview, onLeave };
  const sideOptions = SIDES.filter((s) => spaceStem(space.kind, s.id) !== null);
  const setKind = (kind) => onSpace({ kind, side: spaceStem(kind, space.side) === null ? '' : space.side });

  let body = <p className="surface-empty">Pick what to change, or type in Make it.</p>;
  if (intent === 'space') {
    const label = SPACE_KINDS.find((k) => k.id === space.kind).label;
    body = (
      <>
        <Choice rowId="kind" label="What" options={SPACE_KINDS} value={space.kind} onChange={setKind} />
        <Choice rowId="side" label="Where" options={sideOptions} value={space.side} onChange={(side) => onSpace({ ...space, side })} />
        <Strip {...props} strip={{ id: 'space', label, classes: spaceClasses(space.kind, space.side) }} />
      </>
    );
  } else if (intent === 'type') {
    body = TYPE_STRIPS.map((s) => <Strip key={s.id} {...props} strip={s} />);
  } else if (intent === 'shape') {
    body = SHAPE_STRIPS.map((s) => <Strip key={s.id} {...props} strip={s} />);
  } else if (intent === 'effects') {
    body = (
      <>
        {EFFECT_STRIPS.map((s) => <Strip key={s.id} {...props} strip={s} />)}
        <Strip
          {...props}
          strip={{ id: 'shadow-color', label: 'Shadow color', classes: SHADOW_COLORS.map((c) => `shadow-${c}`) }}
          swatch={(base) => swatchColor(base.slice('shadow-'.length))}
        />
      </>
    );
  } else if (intent === 'layout') {
    body = (
      <>
        <LayoutOptions {...props} />
        <Strip {...props} strip={GAP_STRIP} />
      </>
    );
  } else if (intent === 'color') {
    body = (
      <ColorPalette
        prop={colorProp}
        onProp={onColorProp}
        family={family}
        onFamily={onFamily}
        prefix={wire}
        current={colorsInUse(classes, normalizePrefix(wire))[colorProp]}
        onPick={(cls) => onApply([cls])}
        onPreview={(cls) => onPreview([cls], { from: colorsInUse(classes, normalizePrefix(wire))[colorProp], to: cls.slice(wire.length) })}
        onLeave={onLeave}
      />
    );
  } else if (intent === 'anything') {
    body = <AnythingList query={query} results={results} onApply={onApply} onPreview={onPreview} onLeave={onLeave} />;
  }

  return (
    <div
      className="shelf-surface"
      role="group"
      aria-label="Change"
      ref={(el) => { roving.ref.current = el; surfaceRef.current = el; }}
      onFocus={roving.onFocus}
      onKeyDown={roving.onKeyDown}
    >
      {body}
    </div>
  );
}
