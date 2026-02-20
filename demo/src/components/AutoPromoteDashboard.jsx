import { useState, useCallback } from 'preact/hooks';
import { fmtNum, formatBytes } from '../format';
import { compile, fetchAutoPromoteStats, fetchPromotedCss } from '../api';
import { usePolling } from '../hooks/usePolling';

const DEMO_PAGES = [
  'flex items-center justify-between p-4 bg-white rounded-lg shadow',
  'flex items-center gap-2 p-4 text-sm text-gray-700 border-b',
  'flex items-center p-4 bg-gray-50 font-medium text-lg',
  'grid grid-cols-2 gap-4 p-4 bg-white rounded-lg border',
  'flex items-center justify-center p-4 bg-blue-500 text-white rounded-lg',
  'flex items-center p-4 bg-white shadow-sm hover:shadow-md transition',
];

function PageEntry({ page, projectId, promotedClasses, onRemove, onUpdate }) {
  const [status, setStatus] = useState(page.status || 'idle');
  const [result, setResult] = useState(page.result || null);

  const doCompile = useCallback(async (classes) => {
    if (!classes.trim()) { setResult(null); return; }
    setStatus('compiling');
    try {
      const data = await compile({
        projectId,
        pageId: page.id,
        classes,
        bundle: 'utilities',
      });
      setResult(data);
      setStatus(data.cached ? 'cached' : 'compiled');
      onUpdate?.(page.id, classes);
    } catch (err) {
      setResult({ error: err.message });
      setStatus('error');
    }
  }, [projectId, page.id, onUpdate]);

  const inputList = (page.classes || '').split(/\s+/).filter(Boolean);
  const compiledSet = new Set(result?.classes || []);
  const promotedSet = new Set(promotedClasses || []);
  const strippedFromPage = inputList.filter(cls => !compiledSet.has(cls) && promotedSet.has(cls));

  return (
    <div class="ap-page-entry">
      <div class="ap-page-header">
        <span class="ap-page-title">{page.id}</span>
        <div class="ap-page-actions">
          <span class={`ap-page-status ap-page-status-${status}`}>{status}</span>
          <button class="ap-btn-remove" onClick={() => onRemove(page.id)} title="Remove page">&times;</button>
        </div>
      </div>
      <textarea
        class="ap-page-textarea"
        value={page.classes}
        onInput={(e) => {
          onUpdate?.(page.id, e.target.value);
          // Debounced compile
          clearTimeout(e.target._timer);
          e.target._timer = setTimeout(() => doCompile(e.target.value), 500);
        }}
        placeholder="Enter Tailwind classes (e.g. flex items-center p-4 bg-white)"
      />
      {result && !result.error && (
        <div class="ap-compile-result">
          <div class="ap-compile-metrics">
            <span class="ap-size-badge">{formatBytes(result.css?.length || 0)}</span>
            <span class="ap-compile-detail">{(result.classes || []).length} classes compiled</span>
            {result.cached && <span class="ap-compile-cached">cache hit</span>}
            {strippedFromPage.length > 0 && (
              <span class="ap-compile-stripped">{strippedFromPage.length} in shared base</span>
            )}
          </div>
          <div class="ap-compile-classes">
            {inputList.map((cls, i) => (
              <span
                key={`${i}-${cls}`}
                class={`ap-class-pill${promotedSet.has(cls) ? ' ap-class-promoted' : ''}`}
                title={promotedSet.has(cls) ? 'Promoted to shared base' : ''}
              >
                {cls}
              </span>
            ))}
          </div>
          <details class="ap-compile-css-details">
            <summary class="ap-compile-css-toggle">
              Page CSS <span class="ap-size-badge">{formatBytes(result.css?.length || 0)}</span>
            </summary>
            <pre class="ap-compile-css-code">{result.css || ''}</pre>
          </details>
        </div>
      )}
      {result?.error && (
        <div class="ap-compile-result ap-compile-error">Error: {result.error}</div>
      )}
    </div>
  );
}

export function AutoPromoteDashboard() {
  const [projectId, setProjectId] = useState('demo-promote');
  const [pages, setPages] = useState([]);
  const [counter, setCounter] = useState(0);
  const [promotedCss, setPromotedCss] = useState(null);
  const [promotedClasses, setPromotedClasses] = useState([]);

  const { data: statsData } = usePolling(
    () => fetchAutoPromoteStats(),
    5000
  );

  const stats = statsData?.[projectId] || null;

  usePolling(
    async () => {
      const css = await fetchPromotedCss(projectId);
      setPromotedCss(css);
      // Refresh stats to get promoted classes
      const allStats = await fetchAutoPromoteStats();
      setPromotedClasses(allStats[projectId]?.promoted || []);
    },
    5000
  );

  const addPage = useCallback(() => {
    setCounter((c) => c + 1);
    setPages((prev) => [...prev, { id: `page-${counter + 1}`, classes: '', status: 'idle', result: null }]);
  }, [counter]);

  const removePage = useCallback((id) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePage = useCallback((id, classes) => {
    setPages((prev) => prev.map((p) => p.id === id ? { ...p, classes } : p));
  }, []);

  const quickDemo = useCallback(async () => {
    setCounter(DEMO_PAGES.length);
    const newPages = DEMO_PAGES.map((classes, i) => ({
      id: `page-${i + 1}`,
      classes,
      status: 'idle',
      result: null,
    }));

    // Compile all pages
    const compiled = await Promise.all(
      newPages.map(async (page) => {
        try {
          const data = await compile({
            projectId,
            pageId: page.id,
            classes: page.classes,
            bundle: 'utilities',
          });
          return { ...page, result: data, status: data.cached ? 'cached' : 'compiled' };
        } catch {
          return { ...page, status: 'error' };
        }
      })
    );

    setPages(compiled);

    // Refresh promoted
    try {
      const allStats = await fetchAutoPromoteStats();
      setPromotedClasses(allStats[projectId]?.promoted || []);
      const css = await fetchPromotedCss(projectId);
      setPromotedCss(css);
    } catch { /* ignore */ }
  }, [projectId]);

  const recompileAll = useCallback(async () => {
    const compiled = await Promise.all(
      pages.map(async (page) => {
        if (!page.classes.trim()) return page;
        try {
          const data = await compile({
            projectId,
            pageId: page.id,
            classes: page.classes,
            bundle: 'utilities',
          });
          return { ...page, result: data, status: data.cached ? 'cached' : 'compiled' };
        } catch {
          return { ...page, status: 'error' };
        }
      })
    );

    setPages(compiled);

    try {
      const allStats = await fetchAutoPromoteStats();
      setPromotedClasses(allStats[projectId]?.promoted || []);
      const css = await fetchPromotedCss(projectId);
      setPromotedCss(css);
    } catch { /* ignore */ }
  }, [pages, projectId]);

  const refreshPromotedCss = useCallback(async () => {
    try {
      const css = await fetchPromotedCss(projectId);
      setPromotedCss(css);
    } catch { /* ignore */ }
  }, [projectId]);

  return (
    <div>
      <div class="ap-header">
        <h1>Auto-Promote Dashboard</h1>
        <div class="ap-threshold">
          Threshold: <strong>{stats?.threshold || 5}</strong> pages
        </div>
      </div>

      <section class="ap-section">
        <h3>Project Stats</h3>
        <div class="ap-project-grid">
          {stats ? (
            <div class="ap-project-card">
              <div class="ap-project-header">
                <span>{projectId}</span>
                {stats.promotedClasses > 0 && (
                  <span class="ap-promoted-count">{stats.promotedClasses} promoted</span>
                )}
              </div>
              <div class="ap-project-body">
                <div class="ap-stat-row">
                  <span class="ap-stat-label">Tracked Classes</span>
                  <span class="ap-stat-value">{fmtNum(stats.trackedClasses)}</span>
                </div>
                <div class="ap-stat-row">
                  <span class="ap-stat-label">Promoted to Base</span>
                  <span class="ap-stat-value ap-stat-promoted">
                    {fmtNum(stats.promotedClasses)}{' '}
                    <span class="ap-stat-pct">
                      ({stats.trackedClasses > 0 ? ((stats.promotedClasses / stats.trackedClasses) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </div>
                {stats.promotedClasses > 0 && (
                  <div class="ap-stat-row">
                    <span class="ap-stat-label">Threshold</span>
                    <span class="ap-stat-value">{stats.threshold || '?'} pages</span>
                  </div>
                )}
                <div class="ap-promoted-section">
                  <div class="ap-promoted-label">
                    {stats.promotedClasses > 0
                      ? 'Shared base classes'
                      : `Classes need ${stats.threshold || 5}+ page appearances to promote`}
                  </div>
                  <div class="ap-promoted-list">
                    {(stats.promoted || []).length > 0
                      ? stats.promoted.map((cls) => (
                          <span key={cls} class="ap-badge ap-badge-promoted">{cls}</span>
                        ))
                      : <span class="ap-badge ap-badge-none">none yet</span>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div class="ap-empty">No projects tracked yet. Use the demo below to see auto-promotion in action.</div>
          )}
        </div>
      </section>

      <section class="ap-section">
        <h3>Interactive Demo</h3>
        <p class="ap-desc">
          Create pages with Tailwind classes. When a class appears on{' '}
          <span>{stats?.threshold || 5}</span>+ pages, it gets promoted to a shared bundle.
        </p>

        <div class="ap-demo-controls">
          <div class="ap-field">
            <label for="demo-project">Project ID</label>
            <input
              type="text"
              id="demo-project"
              value={projectId}
              onInput={(e) => setProjectId(e.target.value)}
              placeholder="project-id"
            />
          </div>
          <div class="ap-demo-buttons">
            <button class="ap-btn ap-btn-primary" onClick={addPage}>Add Page</button>
            <button class="ap-btn ap-btn-secondary" onClick={quickDemo}>Quick Demo</button>
            <button class="ap-btn ap-btn-warning" onClick={recompileAll}>Recompile All</button>
          </div>
        </div>

        <div class="ap-output-section ap-base-bundle">
          <h4>
            Shared Base Bundle{' '}
            <button class="ap-btn ap-btn-sm" onClick={refreshPromotedCss}>Refresh</button>
          </h4>
          <p class="ap-desc">
            Classes that appear on enough pages get promoted here. Per-page CSS shrinks as classes move to the shared base.
          </p>
          <div class="ap-css-output">
            {promotedCss ? (
              <>
                <div class="ap-promoted-output-header">
                  <span class="ap-size-badge ap-size-badge-promoted">{formatBytes(promotedCss.length)}</span> shared base bundle
                </div>
                <pre class="ap-promoted-output-code">{promotedCss}</pre>
              </>
            ) : (
              <div class="ap-promoted-output-empty">
                No promoted classes for this project yet. Classes appear here once they cross the threshold.
              </div>
            )}
          </div>
        </div>

        <h4 class="ap-pages-heading">Per-Page CSS</h4>
        <div class="ap-pages">
          {pages.map((page) => (
            <PageEntry
              key={page.id}
              page={page}
              projectId={projectId}
              promotedClasses={promotedClasses}
              onRemove={removePage}
              onUpdate={updatePage}
            />
          ))}
        </div>
      </section>

      <div class="ap-status" />
    </div>
  );
}
