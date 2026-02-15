export const sampleHtml = `<section class="rounded-3xl border border-white/20 bg-slate-950/85 p-6 text-slate-100 shadow-2xl">
  <div class="flex items-center gap-3">
    <span class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300 text-slate-900 font-bold">RW</span>
    <div>
      <h2 class="text-2xl font-semibold">Rich Wind Preview</h2>
      <p class="text-sm text-slate-300">Live compiled Tailwind from the editor.</p>
    </div>
  </div>
  <p class="mt-4 text-base leading-relaxed text-slate-200">
    Treat HTML as data. Tailwind classes are extracted on the fly, compiled,
    and returned as CSS without a database.
  </p>
  <div class="mt-5 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-slate-300">
    <span class="rounded-full bg-emerald-400/20 px-3 py-1 text-emerald-200">Inline Classes</span>
    <span class="rounded-full bg-sky-400/20 px-3 py-1 text-sky-200">LRU Cache</span>
    <span class="rounded-full bg-amber-300/20 px-3 py-1 text-amber-200">Stateless</span>
  </div>
  <div class="mt-6 flex items-center gap-3">
    <button class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
      Publish Styles
    </button>
    <button class="rounded-full border border-white/30 px-4 py-2 text-sm text-white/80">
      View Tokens
    </button>
  </div>
</section>`;

export const sampleClasses =
  "text-sm uppercase tracking-[0.18em] text-amber-600 bg-white/70 px-3 py-1 rounded-full shadow-md";

export const sampleCustomCss = `/* Optional: add custom CSS on top of compiled output */
/* Example: @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap'); */
:root {
  --rw-preview-font: "Space Grotesk", system-ui, sans-serif;
  --rw-preview-bg: #0f172a;
  --rw-preview-fg: #e2e8f0;
  --rw-preview-pad: 28px;
}
body {
  margin: 0;
  font-family: var(--rw-preview-font);
  background: var(--rw-preview-bg);
  color: var(--rw-preview-fg);
  padding: var(--rw-preview-pad);
}
.preview-shell {
  border-radius: 24px;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.8));
  padding: 28px;
}
.rw-preview-empty {
  border: 1px dashed rgba(148, 163, 184, 0.4);
  padding: 24px;
  text-align: center;
  color: rgba(148, 163, 184, 0.9);
  border-radius: 16px;
}`;
