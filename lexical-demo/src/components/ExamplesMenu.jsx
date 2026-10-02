import React, { useState, useEffect, useRef } from 'react';
import { EXAMPLES } from '../examples';

export default function ExamplesMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        Examples
      </button>
      {open && (
        <div className="menu" role="menu">
          {EXAMPLES.map(ex => (
            <button
              key={ex.id}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => { setOpen(false); onPick(ex); }}
            >
              <span className="menu-item-label">
                {ex.label}
                {ex.hasRejected && <span className="menu-badge">rejected</span>}
              </span>
              <span className="menu-item-hint">{ex.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
