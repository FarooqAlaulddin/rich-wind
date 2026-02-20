import { fmtUptime, fmtNum, fmtPct, formatBytes } from '../format';
import { SparklineSvg } from './SparklineSvg';

const EMPTY = {
  uptime: { uptimeMs: 0 },
  requests: { total: 0, byAction: {} },
  responses: { byStatus: {}, latency: {}, recentLatencies: [] },
  compiles: { total: 0, fresh: 0, cached: 0, hitRate: 0, byBundle: {}, bySource: {} },
  css: { totalBytes: 0, perCompile: {} },
  classes: { uniqueTracked: 0, top20: [] },
  cache: { hits: 0, misses: 0, hitRate: 0 },
  projects: {},
  errors: { total: 0, recent: [] },
};

export function AnalyticsDashboard({ data, connected }) {
  const d = data || EMPTY;
  const compileTotal = d.compiles.total || 0;
  const freshPct = compileTotal > 0 ? ((d.compiles.fresh / compileTotal) * 100).toFixed(1) : '0';
  const cachedPct = compileTotal > 0 ? ((d.compiles.cached / compileTotal) * 100).toFixed(1) : '0';
  const cp = d.css.perCompile || {};
  const lat = d.responses.latency || {};

  return (
    <div>
      <div class="an-header">
        <h1>Analytics Dashboard</h1>
        <span class="an-status">
          <span class={`an-dot ${connected ? 'an-dot-live' : 'an-dot-disconnected'}`} />
          <span>{connected ? 'Live' : 'Disconnected'}</span>
        </span>
      </div>

      {/* Overview cards */}
      <div class="an-cards">
        <div class="an-card"><div class="an-card-label">Uptime</div><div class="an-card-value">{fmtUptime(d.uptime.uptimeMs)}</div></div>
        <div class="an-card"><div class="an-card-label">Requests</div><div class="an-card-value">{fmtNum(d.requests.total)}</div></div>
        <div class="an-card"><div class="an-card-label">Compiles</div><div class="an-card-value">{fmtNum(compileTotal)}</div></div>
        <div class="an-card"><div class="an-card-label">Cache Hit Rate</div><div class="an-card-value">{fmtPct(d.compiles.hitRate)}</div></div>
        <div class="an-card"><div class="an-card-label">Errors</div><div class="an-card-value">{fmtNum(d.errors.total)}</div></div>
      </div>

      {/* Request Breakdown */}
      <section class="an-section">
        <h3>Request Breakdown</h3>
        <table class="an-table">
          <thead><tr><th>Action</th><th>Count</th></tr></thead>
          <tbody>
            {Object.entries(d.requests.byAction).length > 0
              ? Object.entries(d.requests.byAction).map(([action, count]) => (
                  <tr key={action}><td>{action}</td><td>{fmtNum(count)}</td></tr>
                ))
              : <tr><td colspan="2" class="an-empty">No requests yet</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Compile Stats */}
      <section class="an-section">
        <h3>Compile Stats</h3>
        <div class="an-ratio-bar">
          <div class="an-ratio-fresh" style={{ width: `${freshPct}%` }} />
          <div class="an-ratio-cached" style={{ width: `${cachedPct}%` }} />
        </div>
        <div class="an-ratio-legend">
          <span class="an-legend-fresh">Fresh: {fmtNum(d.compiles.fresh)} ({freshPct}%)</span>
          <span class="an-legend-cached">Cached: {fmtNum(d.compiles.cached)} ({cachedPct}%)</span>
        </div>
        <div class="an-sub-tables">
          <div>
            <h4>By Bundle</h4>
            <table class="an-table">
              <thead><tr><th>Bundle</th><th>Count</th></tr></thead>
              <tbody>
                {Object.entries(d.compiles.byBundle).length > 0
                  ? Object.entries(d.compiles.byBundle).map(([b, c]) => <tr key={b}><td>{b}</td><td>{fmtNum(c)}</td></tr>)
                  : <tr><td colspan="2" class="an-empty">--</td></tr>}
              </tbody>
            </table>
          </div>
          <div>
            <h4>By Source</h4>
            <table class="an-table">
              <thead><tr><th>Source</th><th>Count</th></tr></thead>
              <tbody>
                {Object.entries(d.compiles.bySource).length > 0
                  ? Object.entries(d.compiles.bySource).map(([s, c]) => <tr key={s}><td>{s}</td><td>{fmtNum(c)}</td></tr>)
                  : <tr><td colspan="2" class="an-empty">--</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CSS Output */}
      <section class="an-section">
        <h3>CSS Output</h3>
        <div class="an-cards an-cards-sm">
          <div class="an-card"><div class="an-card-label">Total</div><div class="an-card-value">{formatBytes(d.css.totalBytes)}</div></div>
          <div class="an-card"><div class="an-card-label">Avg</div><div class="an-card-value">{formatBytes(cp.avg)}</div></div>
          <div class="an-card"><div class="an-card-label">Min</div><div class="an-card-value">{formatBytes(cp.min)}</div></div>
          <div class="an-card"><div class="an-card-label">Max</div><div class="an-card-value">{formatBytes(cp.max)}</div></div>
          <div class="an-card"><div class="an-card-label">p50</div><div class="an-card-value">{formatBytes(cp.p50)}</div></div>
          <div class="an-card"><div class="an-card-label">p95</div><div class="an-card-value">{formatBytes(cp.p95)}</div></div>
          <div class="an-card"><div class="an-card-label">p99</div><div class="an-card-value">{formatBytes(cp.p99)}</div></div>
        </div>
      </section>

      {/* Latency */}
      <section class="an-section">
        <h3>Latency</h3>
        <div class="an-cards an-cards-sm">
          <div class="an-card"><div class="an-card-label">p50</div><div class="an-card-value">{lat.p50 != null ? lat.p50 + 'ms' : '--'}</div></div>
          <div class="an-card"><div class="an-card-label">p95</div><div class="an-card-value">{lat.p95 != null ? lat.p95 + 'ms' : '--'}</div></div>
          <div class="an-card"><div class="an-card-label">p99</div><div class="an-card-value">{lat.p99 != null ? lat.p99 + 'ms' : '--'}</div></div>
          <div class="an-card"><div class="an-card-label">Min</div><div class="an-card-value">{lat.min != null ? lat.min + 'ms' : '--'}</div></div>
          <div class="an-card"><div class="an-card-label">Max</div><div class="an-card-value">{lat.max != null ? lat.max + 'ms' : '--'}</div></div>
        </div>
        <div class="an-sparkline-wrap">
          <SparklineSvg latencies={d.responses.recentLatencies} />
        </div>
      </section>

      {/* Cache */}
      <section class="an-section">
        <h3>Cache</h3>
        <div class="an-progress-wrap">
          <div class="an-progress-label">Hits: {fmtNum(d.cache.hits)} / Misses: {fmtNum(d.cache.misses)} ({fmtPct(d.cache.hitRate)} hit rate)</div>
          <div class="an-progress-bar">
            <div class="an-progress-fill" style={{ width: `${d.cache.hitRate || 0}%` }} />
          </div>
        </div>
        {d.cache.pagesUsed != null && (
          <div class="an-cache-pages">Pages: {fmtNum(d.cache.pagesUsed)} / {fmtNum(d.cache.maxPages || '?')}</div>
        )}
      </section>

      {/* Class Leaderboard */}
      <section class="an-section">
        <h3>Class Leaderboard</h3>
        <div class="an-unique">Unique classes: {fmtNum(d.classes.uniqueTracked)}</div>
        <table class="an-table an-leaderboard">
          <thead><tr><th>#</th><th>Class</th><th>Frequency</th><th>Count</th></tr></thead>
          <tbody>
            {(d.classes.top20 || []).length > 0
              ? d.classes.top20.map((item, i) => {
                  const maxCount = d.classes.top20[0]?.count || 1;
                  const pct = ((item.count / maxCount) * 100).toFixed(1);
                  return (
                    <tr key={item.name}>
                      <td class="an-rank">{i + 1}</td>
                      <td class="an-class-name"><code>{item.name}</code></td>
                      <td class="an-class-bar-cell"><div class="an-class-bar" style={{ width: `${pct}%` }} /></td>
                      <td class="an-class-count">{fmtNum(item.count)}</td>
                    </tr>
                  );
                })
              : <tr><td colspan="4" class="an-empty">No classes tracked yet</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Projects */}
      <section class="an-section">
        <h3>Projects</h3>
        <div>
          {Object.entries(d.projects || {}).length > 0
            ? Object.entries(d.projects).map(([pid, info]) => (
                <details key={pid} class="an-project">
                  <summary>{pid}</summary>
                  <div class="an-project-body">
                    <div class="an-project-stat">Pages: {fmtNum(info.pages)}</div>
                    <div class="an-project-stat">Classes: {fmtNum(info.classes)}</div>
                    <div class="an-project-stat">Compiles: {fmtNum(info.compiles)}</div>
                  </div>
                </details>
              ))
            : <div class="an-empty">No projects yet</div>}
        </div>
      </section>

      {/* Recent Errors */}
      <section class="an-section">
        <h3>Recent Errors</h3>
        <table class="an-table">
          <thead><tr><th>Time</th><th>Message</th><th>Stage</th><th>Plugin</th></tr></thead>
          <tbody>
            {(d.errors.recent || []).length > 0
              ? d.errors.recent.map((err, i) => (
                  <tr key={i}>
                    <td>{err.time ? new Date(err.time).toLocaleTimeString() : '--'}</td>
                    <td>{err.message || ''}</td>
                    <td>{err.stage || '--'}</td>
                    <td>{err.plugin || '--'}</td>
                  </tr>
                ))
              : <tr><td colspan="4" class="an-empty">No errors</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
