import { useFetcher } from "react-router";
import { useEffect, useState, useCallback } from "react";

import "./analytics.css";

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */
function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(2) + " MB";
}
function fmtMs(n) { return typeof n === "number" ? n.toFixed(0) + "ms" : "\u2014"; }
function fmtPct(n) { return typeof n === "number" ? n.toFixed(1) + "%" : "\u2014"; }
function fmtNum(n) { return typeof n === "number" ? n.toLocaleString() : "0"; }
function fmtTime(ts) {
  if (!ts) return "\u2014";
  return new Date(ts).toLocaleTimeString();
}
function latencyColor(ms) {
  if (ms <= 50) return "var(--a-green)";
  if (ms <= 200) return "var(--a-promoted)";
  return "var(--a-red)";
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, sub, color }) {
  return (
    <div className="a-stat-card">
      <div className="a-stat-label">{label}</div>
      <div className="a-stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="a-stat-sub">{sub}</div>}
    </div>
  );
}

function Section({ title, meta, children }) {
  return (
    <div className="a-section">
      <div className="a-section-head">
        <span>{title}</span>
        {meta && <span className="a-meta">{meta}</span>}
      </div>
      <div className="a-section-body">{children}</div>
    </div>
  );
}

function RatioBar({ a, b, labelA, labelB }) {
  const total = a + b;
  const pctA = total > 0 ? (a / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--a-text-2)", marginBottom: "0.2rem" }}>
        <span>{labelA} {a}</span><span>{labelB} {b}</span>
      </div>
      <div className="a-ratio-bar">
        <div className="a-fill-a" style={{ width: pctA + "%" }} />
        <div className="a-fill-b" style={{ width: (100 - pctA) + "%" }} />
      </div>
      <div className="a-ratio-legend">
        <span className="a-leg-a">{labelA}</span>
        <span className="a-leg-b">{labelB}</span>
      </div>
    </div>
  );
}

function MiniTable({ headers, rows }) {
  if (!rows.length) return null;
  return (
    <table className="a-tbl">
      <thead><tr>{headers.map((h, i) => <th key={i} style={i > 0 ? { textAlign: "right" } : undefined}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className={j > 0 ? "a-num" : ""} style={cell.style}>{cell.v ?? cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/*  Section renderers                                                  */
/* ------------------------------------------------------------------ */

function Overview({ data }) {
  return (
    <div className="a-stat-row">
      <StatCard label="Uptime" value={fmtUptime(data.uptime.uptimeMs)} color="var(--a-cyan)" />
      <StatCard label="Requests" value={fmtNum(data.requests.total)} sub={fmtMs(data.responses.latency.avg) + " avg"} color="var(--a-accent)" />
      <StatCard label="Compiles" value={fmtNum(data.compiles.total)} sub={`${data.compiles.fresh} fresh / ${data.compiles.cached} cached`} color="var(--a-green)" />
      <StatCard label="Cache Hit Rate" value={fmtPct(data.cache.hitRate)} sub={`${data.cache.hits} hits / ${data.cache.misses} misses`} color="var(--a-promoted)" />
      <StatCard label="Errors" value={fmtNum(data.errors.total)}
        sub={data.errors.recent.length ? "Latest: " + data.errors.recent[data.errors.recent.length - 1].message.slice(0, 30) : "None"}
        color={data.errors.total > 0 ? "var(--a-red)" : "var(--a-green)"} />
    </div>
  );
}

function Requests({ data }) {
  const actions = data.requests.byAction;
  const actionKeys = Object.keys(actions).sort((a, b) => actions[b] - actions[a]);
  const statuses = data.responses.byStatus;
  const statusKeys = Object.keys(statuses).sort();

  if (!actionKeys.length) return <Section title="Requests"><p className="a-empty">No requests yet</p></Section>;

  return (
    <Section title="Requests">
      <MiniTable headers={["Action", "Count"]} rows={actionKeys.map(k => [k, fmtNum(actions[k])])} />
      {statusKeys.length > 0 && (
        <div style={{ marginTop: "0.6rem" }}>
          <MiniTable headers={["Status", "Count"]}
            rows={statusKeys.map(k => [
              k,
              { v: fmtNum(statuses[k]), style: { color: k.startsWith("2") ? undefined : k.startsWith("4") ? "var(--a-promoted)" : "var(--a-red)" } }
            ])} />
        </div>
      )}
    </Section>
  );
}

function Compiles({ data }) {
  const c = data.compiles;
  const bundleKeys = Object.keys(c.byBundle).sort();
  const sourceKeys = Object.keys(c.bySource).sort();

  return (
    <Section title="Compile Stats">
      <RatioBar a={c.fresh} b={c.cached} labelA="Fresh" labelB="Cached" />
      {bundleKeys.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <MiniTable headers={["Bundle", "Count"]} rows={bundleKeys.map(k => [k, fmtNum(c.byBundle[k])])} />
        </div>
      )}
      {sourceKeys.length > 0 && (
        <div style={{ marginTop: "0.4rem" }}>
          <MiniTable headers={["Source", "Count"]} rows={sourceKeys.map(k => [k, fmtNum(c.bySource[k])])} />
        </div>
      )}
    </Section>
  );
}

function CssOutput({ data }) {
  const css = data.css;
  const pc = css.perCompile;
  return (
    <Section title="CSS Output">
      <div className="a-inline-stats">
        <div className="a-inline-stat"><span className="a-is-val">{fmtBytes(css.totalBytes)}</span><span className="a-is-label">Total Generated</span></div>
        <div className="a-inline-stat"><span className="a-is-val">{fmtBytes(pc.avg || 0)}</span><span className="a-is-label">Avg / Compile</span></div>
      </div>
      <div style={{ marginTop: "0.6rem" }}>
        <MiniTable headers={["Metric", "Value"]} rows={[
          ["Min", fmtBytes(pc.min || 0)],
          ["Average", fmtBytes(pc.avg || 0)],
          ["Max", fmtBytes(pc.max || 0)],
          ["Compiles", fmtNum(pc.count || 0)],
        ]} />
      </div>
    </Section>
  );
}

function ClassLeaderboard({ data }) {
  const cls = data.classes;
  const maxCount = cls.top20.length ? cls.top20[0].count : 0;

  return (
    <Section title="Class Leaderboard" meta={cls.uniqueTracked + " unique"}>
      {!cls.top20.length
        ? <p className="a-empty">No classes tracked yet</p>
        : cls.top20.map((c, i) => {
          const pct = maxCount > 0 ? (c.count / maxCount) * 100 : 0;
          return (
            <div className="a-lb-row" key={c.name}>
              <span className="a-lb-rank">{i + 1}</span>
              <span className="a-lb-name" title={c.name}>{c.name}</span>
              <div className="a-lb-bar-track"><div className="a-lb-bar-fill" style={{ width: pct + "%" }} /></div>
              <span className="a-lb-count">{c.count}</span>
            </div>
          );
        })
      }
    </Section>
  );
}

function CacheStatus({ data }) {
  const ca = data.cache;
  const utilPct = ca.maxPages > 0 ? (ca.totalPages / ca.maxPages) * 100 : 0;
  const utilCls = utilPct > 80 ? "danger" : utilPct > 50 ? "warn" : "";

  return (
    <Section title="Cache Status">
      <div className="a-cache-grid">
        <div>
          <div className="a-small-label">Page Utilization</div>
          <div className="a-progress-track">
            <div className={`a-progress-fill ${utilCls}`} style={{ width: Math.min(100, utilPct) + "%" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", color: "var(--a-text-2)", marginTop: "0.15rem" }}>
            <span>{ca.totalPages} / {ca.maxPages} pages</span><span>{utilPct.toFixed(1)}%</span>
          </div>
        </div>
        <div>
          <div className="a-small-label">Hit / Miss Ratio</div>
          <RatioBar a={ca.hits} b={ca.misses} labelA="Hits" labelB="Misses" />
        </div>
      </div>
      <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--a-text-2)" }}>
        {ca.projectCount} project{ca.projectCount !== 1 ? "s" : ""} in cache
      </div>
    </Section>
  );
}

function Projects({ data }) {
  const [open, setOpen] = useState({});
  const keys = Object.keys(data.projects);
  const toggle = useCallback((pid) => setOpen(prev => ({ ...prev, [pid]: !prev[pid] })), []);

  return (
    <Section title="Per-Project Detail" meta={keys.length + " project" + (keys.length !== 1 ? "s" : "")}>
      {!keys.length
        ? <p className="a-empty">No projects yet</p>
        : keys.map(pid => {
          const p = data.projects[pid];
          const isOpen = open[pid];
          return (
            <div className={`a-proj-card${isOpen ? " open" : ""}`} key={pid}>
              <div className="a-proj-head" onClick={() => toggle(pid)}>
                <span>{pid}</span>
                <span className="a-proj-toggle">&#9654;</span>
              </div>
              {isOpen && (
                <div className="a-proj-detail">
                  <div className="a-proj-stat"><span className="a-pv">{p.pages}</span><span className="a-pl">Pages</span></div>
                  <div className="a-proj-stat"><span className="a-pv">{p.classes}</span><span className="a-pl">Classes</span></div>
                  <div className="a-proj-stat"><span className="a-pv">{p.compiles}</span><span className="a-pl">Compiles</span></div>
                </div>
              )}
            </div>
          );
        })
      }
    </Section>
  );
}

function Errors({ data }) {
  const errs = data.errors;
  const recent = errs.recent.slice(-50).reverse();

  return (
    <Section title="Errors" meta={errs.total + " total"}>
      {!recent.length
        ? <p className="a-empty">No errors recorded</p>
        : (
          <div style={{ overflowX: "auto" }}>
            <table className="a-tbl">
              <thead><tr><th>Time</th><th>Message</th><th>Stage</th><th>Hook</th><th>Plugin</th><th>Timeout</th></tr></thead>
              <tbody>
                {recent.map((e, i) => (
                  <tr key={i}>
                    <td className="a-dim">{fmtTime(e.time)}</td>
                    <td style={{ color: "var(--a-red)" }}>{(e.message || "").slice(0, 60)}</td>
                    <td className="a-dim">{e.stage || "\u2014"}</td>
                    <td className="a-dim">{e.hook || "\u2014"}</td>
                    <td className="a-dim">{e.plugin || "\u2014"}</td>
                    <td>{e.timedOut ? <span style={{ color: "var(--a-promoted)" }}>Yes</span> : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </Section>
  );
}

function Latency({ data }) {
  const lat = data.responses.latency;
  const recent = data.responses.recentLatencies || [];

  const pills = [
    { label: "p50", val: lat.p50 },
    { label: "p95", val: lat.p95 },
    { label: "p99", val: lat.p99 },
    { label: "min", val: lat.min },
    { label: "max", val: lat.max },
  ];

  // Sparkline SVG
  let sparkline = null;
  if (recent.length > 1) {
    const w = 300, h = 48, pad = 2;
    const maxVal = Math.max(...recent) || 1;
    const pts = recent.map((v, i) => {
      const x = pad + (i / (recent.length - 1)) * (w - pad * 2);
      const y = h - pad - (v / maxVal) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const areaStart = `${pad},${h - pad}`;
    const areaEnd = `${(pad + (w - pad * 2)).toFixed(1)},${h - pad}`;

    sparkline = (
      <svg className="a-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(129,140,248,0.25)" />
            <stop offset="100%" stopColor="rgba(129,140,248,0)" />
          </linearGradient>
        </defs>
        <polygon className="a-spark-area" points={`${areaStart} ${pts.join(" ")} ${areaEnd}`} />
        <polyline className="a-spark-line" points={pts.join(" ")} />
      </svg>
    );
  }

  return (
    <Section title="Latency">
      <div className="a-pct-row">
        {pills.map(p => (
          <div className="a-pct-pill" key={p.label}>
            <div className="a-pp-label">{p.label}</div>
            <div className="a-pp-val" style={{ color: latencyColor(p.val || 0) }}>{fmtMs(p.val)}</div>
          </div>
        ))}
      </div>
      {sparkline || <p className="a-empty" style={{ padding: "0.5rem" }}>No latency data yet</p>}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function AnalyticsDashboard({ initialData, routePath }) {
  const fetcher = useFetcher();
  const [live, setLive] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      fetcher.load(routePath);
    }, 2000);
    return () => clearInterval(interval);
  }, [routePath]);

  const data = fetcher.data?.error ? initialData : (fetcher.data || initialData);
  const hasError = data?.error;

  useEffect(() => {
    setLive(!hasError);
  }, [hasError]);

  if (hasError) {
    return (
      <div className="a-dash">
        <div className="a-container">
          <div className="a-connecting">
            <div className="a-spinner" />
            <span>Connecting to analytics plugin...</span>
            <span style={{ fontSize: "0.7rem", marginTop: "0.5rem" }}>
              Make sure the backend is running with the analytics plugin loaded.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="a-dash">
      <div className="a-container">
        <header className="a-header">
          <h1 className="a-title">Analytics Dashboard</h1>
          <div className="a-status-pill">
            <div className={`a-status-dot ${live ? "live" : "err"}`} />
            <span>{live ? "Live" : "Disconnected"}</span>
          </div>
        </header>

        <Overview data={data} />

        <div className="a-grid-2">
          <Requests data={data} />
          <Compiles data={data} />
        </div>

        <div className="a-grid-2">
          <CssOutput data={data} />
          <Latency data={data} />
        </div>

        <div className="a-grid-2">
          <CacheStatus data={data} />
          <ClassLeaderboard data={data} />
        </div>

        <Projects data={data} />
        <Errors data={data} />
      </div>
    </div>
  );
}
