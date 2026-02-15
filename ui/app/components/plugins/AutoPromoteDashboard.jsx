import { useState, useRef, useCallback, useEffect } from "react";

import "./auto-promote.css";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fmtBytes(n) { return n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB"; }
function unique(arr) { const s = new Set(); return arr.filter(v => { if (s.has(v)) return false; s.add(v); return true; }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function compileApi(pageId, classes) {
  const r = await fetch("/api/compile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "demo", pageId, classes, bundle: "utilities" }),
  });
  return r.json();
}

async function fetchStats() {
  const r = await fetch("/plugins/auto-promote/stats");
  if (!r.ok) return null;
  const d = await r.json();
  return d.demo || null;
}

async function fetchPromotedCss() {
  const r = await fetch("/plugins/auto-promote/css/demo");
  if (r.status === 404) return "";
  return r.text();
}

/* ------------------------------------------------------------------ */
/*  Page card                                                          */
/* ------------------------------------------------------------------ */
function PageCard({ page, onInput, onRemove }) {
  const timerRef = useRef(null);

  const handleInput = (e) => {
    const val = e.target.value;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onInput(page.id, val), 500);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const inputClasses = unique(page.classes.trim().split(/\s+/).filter(Boolean));
  const kept = page.compiled?.classes || [];
  const stripped = inputClasses.filter(c => !kept.includes(c));
  const hasStripped = page.status === "compiled" && stripped.length > 0;

  return (
    <div className="ap-page-card">
      <div className="ap-page-head">
        <span>{page.name}</span>
        <button title="Remove page" onClick={() => onRemove(page.id)}>&times;</button>
      </div>
      <div className="ap-page-body">
        <textarea
          placeholder="text-red-500 p-4 bg-blue-500 ..."
          defaultValue={page.classes}
          onChange={handleInput}
        />
        <div className="ap-page-output">
          {page.status === "error" ? page.error : (page.compiled?.css || "Utilities-only CSS will appear here")}
        </div>
      </div>
      <div className="ap-page-foot">
        <span className={page.status === "compiling" ? "ap-st-compiling" : page.status === "error" ? "ap-st-error" : page.status === "compiled" ? "ap-st-compiled" : ""}>
          {page.status === "compiling" ? "Compiling\u2026" : page.status === "error" ? "Error" : page.status === "compiled" ? "Compiled" : ""}
        </span>
        <span>
          {page.status === "compiled" && (
            hasStripped
              ? <>{kept.length} kept, <span className="ap-stripped">{stripped.length} promoted</span> &middot; {fmtBytes(page.compiled.css.length)}</>
              : <>{kept.length} classes &middot; {fmtBytes(page.compiled.css.length)}</>
          )}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function AutoPromoteDashboard() {
  const [pages, setPages] = useState([]);
  const [stats, setStats] = useState(null);
  const [promotedCss, setPromotedCss] = useState("");
  const [threshold, setThreshold] = useState(5);
  const counterRef = useRef(0);
  const pagesRef = useRef(pages);
  const lockRef = useRef(false);
  const queueRef = useRef(false);
  const prevPromotedRef = useRef([]);

  // Keep ref in sync
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // Init
  useEffect(() => {
    (async () => {
      try {
        const s = await fetchStats();
        setStats(s);
        if (s) setThreshold(s.threshold || 5);
        setPromotedCss(await fetchPromotedCss());
      } catch {}
    })();
  }, []);

  const addPage = useCallback((name, prefill) => {
    counterRef.current++;
    const id = "page-" + counterRef.current;
    const page = { id, name: name || "Page " + counterRef.current, classes: prefill || "", status: "empty", compiled: null, error: null };
    setPages(prev => [...prev, page]);
    return page;
  }, []);

  const removePage = useCallback((pageId) => {
    setPages(prev => prev.filter(p => p.id !== pageId));
  }, []);

  const updatePage = useCallback((pageId, update) => {
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, ...update } : p));
  }, []);

  const compileSinglePage = useCallback(async (page) => {
    if (!page.classes.trim()) return;
    updatePage(page.id, { status: "compiling" });
    try {
      const result = await compileApi(page.id, page.classes);
      if (result.error) {
        updatePage(page.id, { status: "error", error: result.error, compiled: null });
      } else {
        updatePage(page.id, { status: "compiled", error: null, compiled: { classes: result.classes || [], css: result.css || "" } });
      }
    } catch (e) {
      updatePage(page.id, { status: "error", error: e.message, compiled: null });
    }
  }, [updatePage]);

  const refreshAfterCompile = useCallback(async () => {
    if (lockRef.current) { queueRef.current = true; return; }
    lockRef.current = true;
    try {
      await sleep(400);
      const s = await fetchStats();
      setStats(s);
      if (s) setThreshold(s.threshold || 5);
      let css = await fetchPromotedCss();
      setPromotedCss(css);

      const newList = s ? (s.promoted || []) : [];
      const prev = prevPromotedRef.current;
      const changed = newList.length !== prev.length || newList.some(c => !prev.includes(c));
      prevPromotedRef.current = newList;

      if (changed && newList.length > 0) {
        const currentPages = pagesRef.current.filter(p => p.classes.trim());
        for (const p of currentPages) {
          await compileSinglePage(p);
        }
        await sleep(500);
        css = await fetchPromotedCss();
        setPromotedCss(css);
        const s2 = await fetchStats();
        setStats(s2);
      }
    } catch {}
    lockRef.current = false;
    if (queueRef.current) { queueRef.current = false; refreshAfterCompile(); }
  }, [compileSinglePage]);

  const handleInput = useCallback(async (pageId, value) => {
    updatePage(pageId, { classes: value });
    const page = pagesRef.current.find(p => p.id === pageId);
    if (page) await compileSinglePage({ ...page, classes: value });
    await refreshAfterCompile();
  }, [updatePage, compileSinglePage, refreshAfterCompile]);

  const recompileAll = useCallback(async () => {
    const todo = pagesRef.current.filter(p => p.classes.trim());
    for (const p of todo) await compileSinglePage(p);
    await refreshAfterCompile();
  }, [compileSinglePage, refreshAfterCompile]);

  const quickDemo = useCallback(async () => {
    setPages([]);
    counterRef.current = 0;
    prevPromotedRef.current = [];
    await sleep(50);

    const samples = [
      ["Home", "text-red-500 p-4 bg-blue-500 font-bold"],
      ["About", "text-red-500 m-2 rounded-lg font-bold"],
      ["Contact", "text-red-500 shadow-md flex font-bold"],
      ["Blog", "text-red-500 items-center w-full font-bold"],
      ["Dashboard", "text-red-500 h-screen gap-4 font-bold"],
    ];

    const newPages = samples.map(([name, classes]) => {
      counterRef.current++;
      return { id: "page-" + counterRef.current, name, classes, status: "empty", compiled: null, error: null };
    });
    setPages(newPages);
    pagesRef.current = newPages;

    await sleep(50);
    for (const p of newPages) await compileSinglePage(p);
    await refreshAfterCompile();
  }, [compileSinglePage, refreshAfterCompile]);

  const promoted = stats?.promoted || [];

  // Class tracking
  const counts = {};
  pages.forEach(page => {
    const seen = new Set();
    page.classes.trim().split(/\s+/).filter(Boolean).forEach(c => {
      if (!seen.has(c)) { seen.add(c); counts[c] = (counts[c] || 0) + 1; }
    });
  });
  const trackEntries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="ap-dash">
      <div className="ap-container">
        <header className="ap-header">
          <h1 className="ap-title">Auto-Promote Plugin Demo</h1>
          <span className="ap-badge">Threshold: <b>{threshold}</b> pages</span>
        </header>

        <p className="ap-hint">
          Type the same Tailwind classes across multiple pages. Once a class appears on{" "}
          <b>{threshold}</b>+ pages, it moves to the promoted bundle and is stripped from per-page output &mdash; eliminating duplication.
        </p>

        {/* Promoted bundle section */}
        <section className={`ap-promoted${promoted.length > 0 ? " active" : ""}`}>
          <div className="ap-promoted-head">
            <span>Promoted CSS Bundle</span>
            <span>{promoted.length > 0 ? `${promoted.length} class${promoted.length !== 1 ? "es" : ""} \u00b7 ${fmtBytes(promotedCss.length)}` : "0 classes"}</span>
          </div>
          {promoted.length > 0 && (
            <div className="ap-chips">
              {promoted.map(c => <span className="ap-chip" key={c}>{c}</span>)}
            </div>
          )}
          <div className="ap-promoted-css">
            {promotedCss || "/* Full CSS (base + theme + promoted utilities) appears here once classes cross the threshold */"}
          </div>
        </section>

        {/* Page cards */}
        {pages.map(page => (
          <PageCard key={page.id} page={page} onInput={handleInput} onRemove={removePage} />
        ))}

        {/* Actions */}
        <div className="ap-actions">
          <button className="ap-btn ap-btn-primary" onClick={() => addPage()}>+ Add Page</button>
          <button className="ap-btn ap-btn-warn" onClick={quickDemo}>Quick Demo</button>
          <button className="ap-btn" onClick={recompileAll} disabled={!pages.length}>Recompile All</button>
        </div>

        {/* Class tracking */}
        {trackEntries.length > 0 && (
          <section className="ap-tracking">
            <div className="ap-tracking-head">Class Tracking</div>
            <div className="ap-tracking-grid">
              {trackEntries.map(([name, count]) => {
                const pct = Math.min(100, (count / threshold) * 100);
                const hit = promoted.includes(name);
                return (
                  <div className="ap-track-item" key={name}>
                    <span className="ap-track-name" title={name}>{name}</span>
                    <div className="ap-track-bar"><div className={`ap-track-fill${hit ? " hit" : ""}`} style={{ width: pct + "%" }} /></div>
                    <span className="ap-track-ct">{count}/{threshold}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
