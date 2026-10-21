import React, { useEffect, useState } from 'react';
import { compile } from '../api';
import { THEMES, themedProjectId } from '../themePresets';

function previewDoc(css, html) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0;padding:16px">${html || ''}</body></html>`;
}

/**
 * Compiles the current page once per design system and shows the one picked.
 * Each theme is its own project id, so the server's design-tokens plugin
 * answers it from a fixed preset: the page's classes stay the same and only
 * the token file changes. What a theme does not define comes back rejected.
 */
export default function ThemesView({ html, projectId, activePage }) {
  const [themeId, setThemeId] = useState('ink');
  const [results, setResults] = useState({});
  const [showTokens, setShowTokens] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const entries = await Promise.all(THEMES.map(async (theme) => {
        try {
          const data = await compile({
            projectId: themedProjectId(projectId, theme.id),
            pageId: activePage,
            html: html || '',
            bundle: 'full',
          });
          return [theme.id, { css: data.css || '', rejected: Array.isArray(data.rejected) ? data.rejected : [] }];
        } catch (err) {
          return [theme.id, { error: String(err?.message || err) }];
        }
      }));
      if (live) setResults(Object.fromEntries(entries));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [html, projectId, activePage]);

  const theme = THEMES.find((t) => t.id === themeId);
  const result = results[themeId];

  return (
    <div className="rw-view rw-themes">
      <p className="rw-note">The same page under three design systems. Only the token file changes; classes a theme does not define are rejected.</p>
      <div className="tabs" role="tablist" aria-label="Design system">
        {THEMES.map((t) => {
          const r = results[t.id];
          return (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === themeId} className={`tab${t.id === themeId ? ' tab-active' : ''}`} onClick={() => setThemeId(t.id)}>
              {t.label}
              {r && !r.error && <span className={`rw-count${r.rejected.length ? ' is-bad' : ''}`}>{r.rejected.length} rejected</span>}
            </button>
          );
        })}
        <button type="button" className={`rw-link${showTokens ? ' is-on' : ''}`} aria-expanded={showTokens} onClick={() => setShowTokens((v) => !v)}>Tokens</button>
      </div>
      <p className="rw-note">{theme.hint}</p>
      {showTokens && <pre className="rw-code">{theme.tokens || "/* none: Tailwind's stock theme */"}</pre>}
      {!result && <p className="rw-note" role="status">Compiling</p>}
      {result?.error && <p className="rw-error">{result.error}</p>}
      {result && !result.error && (
        <>
          <iframe className="rw-preview" title={`${theme.label} preview`} sandbox="" srcDoc={previewDoc(result.css, html)} />
          <div className="rw-rejects" aria-label={`Rejected under ${theme.label}`}>
            {result.rejected.length === 0
              ? <span className="rw-note">Nothing rejected.</span>
              : result.rejected.map((cls) => <code key={cls} className="rw-chip">{cls}</code>)}
          </div>
        </>
      )}
    </div>
  );
}
