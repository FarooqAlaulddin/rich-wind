import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CORE_BASE } from '../api';

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getExportCoreBase() {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(CORE_BASE)) return CORE_BASE;
  if (typeof window === 'undefined') return CORE_BASE;
  return new URL(CORE_BASE || '/', window.location.origin).href.replace(/\/+$/, '');
}

export function buildExportHtml(html, projectId, activePage) {
  const coreBase = getExportCoreBase();
  const loaderSrc = `${coreBase}/richwind-loader.js`;
  const reloadSrc = `${coreBase}/richwind-reload.js`;
  const loaderScript = `<script
    defer
    src="${escapeAttr(loaderSrc)}"
    data-project-id="${escapeAttr(projectId || '')}"
    data-page-id="${escapeAttr(activePage || '')}"
  ></script>`;
  const reloadScript = `<script
    defer
    src="${escapeAttr(reloadSrc)}"
  ></script>`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${loaderScript}
  ${reloadScript}
</head>
<body>
${(html || '').trim().split('\n').map((l) => '  ' + l).join('\n')}
</body>
</html>`;
}

function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function statusOf({ error, loading, cached, hasResult }) {
  if (error) return { id: 'error', label: 'Error' };
  if (loading) return { id: 'busy', label: 'Compiling' };
  if (!hasResult) return { id: 'idle', label: 'Idle' };
  return cached ? { id: 'cached', label: 'Cached' } : { id: 'ok', label: 'Compiled' };
}

function useCopy() {
  const [copied, setCopied] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (key, text) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return [copied, copy];
}

/**
 * The RICH WIND strip: always visible at the bottom of the panel. It reports
 * what the last compile did and what the page costs. Its buttons open an
 * inline view in place (compiled CSS, or the standalone export), never a
 * popup.
 */
export default function RichWindStrip({
  view, onView, html, projectId, activePage, baseCss, themeCss, utilitiesCss, fullCss,
  promotedClasses, lastResult, error, loading, onRemoveRejected,
}) {
  const [tab, setTab] = useState('page');
  const [copied, copy] = useCopy();

  const sharedBytes = baseCss.length + themeCss.length;
  const pageBytes = utilitiesCss.length;
  const rejected = lastResult.rejected || [];
  const ms = lastResult.freshMs ?? lastResult.ms;
  const status = statusOf({ error, loading, cached: lastResult.cached, hasResult: lastResult.at != null || (lastResult.classes || []).length > 0 });
  const exportHtml = useMemo(() => (view === 'export' ? buildExportHtml(html, projectId, activePage) : ''), [view, html, projectId, activePage]);
  const cssTabs = { page: utilitiesCss, shared: baseCss + themeCss, full: fullCss };
  const promotedN = promotedClasses.length;

  return (
    <footer className="rw-strip" aria-label="Rich Wind">
      <div className="rw-row">
        <span className="rw-name">RICH WIND</span>
        <span className={`rw-status is-${status.id}`} role="status">{status.label}</span>
        <span className="rw-total" title={`shared ${kb(sharedBytes)} (base + theme${promotedN ? ` + ${promotedN} promoted` : ''}) + this page ${kb(pageBytes)}`}>
          {kb(sharedBytes + pageBytes)}
        </span>
        <span className="rw-split">shared {kb(sharedBytes)} + page {kb(pageBytes)}</span>
        {ms != null && <span className="rw-ms">{ms} ms</span>}
        {rejected.length > 0 && (
          <span className="rw-rejected">
            {rejected.length} rejected
            <button type="button" className="rw-link" onClick={onRemoveRejected}>Remove</button>
          </span>
        )}
        <span className="rw-spacer" />
        <button type="button" className={`rw-link${view === 'css' ? ' is-on' : ''}`} aria-expanded={view === 'css'} onClick={() => onView(view === 'css' ? null : 'css')}>CSS</button>
        <button type="button" className={`rw-link${view === 'export' ? ' is-on' : ''}`} aria-expanded={view === 'export'} onClick={() => onView(view === 'export' ? null : 'export')}>Export</button>
      </div>

      {error && <p className="rw-error">{String(error.message || error)}</p>}

      {view === 'css' && (
        <div className="rw-view">
          <div className="tabs" role="tablist" aria-label="Compiled CSS">
            {[['page', 'Page'], ['shared', 'Shared'], ['full', 'Full CSS']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' tab-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
            <button type="button" className="rw-link" onClick={() => copy('css', cssTabs[tab])}>{copied === 'css' ? 'Copied' : 'Copy'}</button>
          </div>
          <pre className="rw-code">{cssTabs[tab] || '/* nothing compiled yet */'}</pre>
        </div>
      )}

      {view === 'export' && (
        <div className="rw-view">
          <p className="rw-note">A standalone page: the HTML plus two script tags. Rich Wind compiles the CSS when it loads. No build step.</p>
          <div className="rw-actions">
            <button type="button" className="btn btn-sm" onClick={() => copy('html', exportHtml)}>{copied === 'html' ? 'Copied' : 'Copy HTML'}</button>
            <button type="button" className="btn btn-sm" onClick={() => copy('css2', fullCss)}>{copied === 'css2' ? 'Copied' : 'Copy CSS'}</button>
            <button type="button" className="btn btn-sm" onClick={() => downloadText('rich-wind-page.html', exportHtml, 'text/html')}>Download .html</button>
          </div>
          <pre className="rw-code">{exportHtml}</pre>
        </div>
      )}
    </footer>
  );
}
