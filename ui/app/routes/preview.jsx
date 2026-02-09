export function meta() {
  return [
    { title: "Rich Wind Preview" },
    { name: "description", content: "Live Rich Wind preview window." },
  ];
}

export default function Preview() {
  return (
    <main className="min-h-screen px-4 py-4">
      <div className="glass-panel flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-slate-600">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Preview Window
          </p>
          <p className="text-lg font-semibold text-slate-800">
            Live Output
          </p>
        </div>
        <a
          href="/"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600"
        >
          Back to Editor
        </a>
      </div>
      <iframe
        id="preview-standalone"
        title="Standalone Preview"
        className="mt-4 h-[calc(100vh-120px)] w-full rounded-2xl border border-slate-200 bg-white"
        sandbox="allow-same-origin"
        srcDoc={`<!doctype html><html><body style="font-family:Space Grotesk,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;background:#f8fafc;">Waiting for updates...</body></html>`}
        suppressHydrationWarning
      />
    </main>
  );
}
