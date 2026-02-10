const rawCoreUrl = (process.env.RW_CORE_URL || "http://localhost:3001").trim();
const CORE_URL = /^https?:\/\//i.test(rawCoreUrl)
  ? rawCoreUrl
  : `http://${rawCoreUrl}`;

const escapeHtml = (value = "") => {
  const safe = value === null || value === undefined ? "" : String(value);
  return safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatBytes = (value) => {
  if (!value && value !== 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

const renderStatus = ({ tone, message }) => {
  return `<span id="status-pill" hx-swap-oob="true" class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${tone}">${escapeHtml(
    message
  )}</span>`;
};

const renderCacheBadge = (label) => {
  return `<span id="cache-badge" hx-swap-oob="true" class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">${escapeHtml(
    label
  )}</span>`;
};

const renderStats = ({ classCount, cssSize, hash, runLabel }) => {
  return [
    `<p id="stat-class-count" hx-swap-oob="true" class="mt-2 text-lg font-semibold text-slate-900">${escapeHtml(
      classCount ?? "--"
    )}</p>`,
    `<p id="stat-css-size" hx-swap-oob="true" class="mt-2 text-lg font-semibold text-slate-900">${escapeHtml(
      cssSize ?? "--"
    )}</p>`,
    `<p id="stat-hash" hx-swap-oob="true" class="font-mono mt-2 text-xs text-slate-700">${escapeHtml(
      hash ?? "--"
    )}</p>`,
    `<p id="stat-run" hx-swap-oob="true" class="mt-1 text-xs text-slate-400">${escapeHtml(
      runLabel ?? "Awaiting compile"
    )}</p>`,
  ].join("");
};

const renderCssOutput = (css) => {
  return `<div id="css-output" hx-swap-oob="true" class="mt-4 rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-xs text-slate-200"><pre class="font-mono whitespace-pre-wrap break-words">${escapeHtml(
    css || "Compile to see CSS output."
  )}</pre></div>`;
};

const renderClassList = (classes) => {
  const list =
    classes && classes.length
      ? classes
        .map(
          (item) =>
            `<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">${escapeHtml(
              item
            )}</span>`
        )
        .join("")
      : `<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">No classes yet</span>`;
  return `<div id="class-list" hx-swap-oob="true" class="mt-3 flex flex-wrap gap-2">${list}</div>`;
};

const renderPreviewData = ({ html, css, customCss }) => {
  const payload = Buffer.from(
    JSON.stringify({ html, css, customCss }),
    "utf8"
  ).toString("base64");
  return `<div id="preview-data" hx-swap-oob="true" data-payload="${escapeHtml(
    payload
  )}"></div>`;
};

const renderPreviewBadge = (label) => {
  return `<span id="preview-badge" hx-swap-oob="true" class="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">${escapeHtml(
    label
  )}</span>`;
};

const renderResponse = (payload) => {
  return new Response(`<div class="htmx-stub"></div>${payload}`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

export async function action({ request }) {
  const formData = await request.formData();
  const projectId = (formData.get("projectId") || "").trim();
  const pageId = (formData.get("pageId") || "default").trim() || "default";
  const html = formData.get("html") || "";
  const classes = formData.get("classes") || "";
  const customCss = formData.get("customCss") || "";
  const intent = formData.get("intent") || formData.get("_autoIntent") || "compile";

  if (!projectId) {
    return renderResponse(
      renderStatus({
        tone: "bg-rose-200 text-rose-900",
        message: "Project ID required",
      })
    );
  }

  const nowLabel = `Last run ${new Date().toLocaleTimeString()}`;

  try {
    if (intent === "cache") {
      const response = await fetch(
        `${CORE_URL}/api/css?projectId=${encodeURIComponent(
          projectId
        )}&pageId=${encodeURIComponent(pageId)}`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Cache miss.");
      }
      const css = await response.text();
      return renderResponse(
        [
          renderStatus({
            tone: "bg-emerald-200 text-emerald-900",
            message: "Cache hit",
          }),
          renderCacheBadge("Cache hit"),
          renderCssOutput(css),
          renderPreviewBadge("Cached preview"),
          renderPreviewData({ html, css, customCss }),
          renderStats({
            classCount: "--",
            cssSize: formatBytes(css.length),
            hash: "--",
            runLabel: nowLabel,
          }),
        ].join("")
      );
    }

    if (intent === "project") {
      const response = await fetch(
        `${CORE_URL}/api/projects/${encodeURIComponent(projectId)}/css`
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Project cache miss.");
      }
      const css = await response.text();
      return renderResponse(
        [
          renderStatus({
            tone: "bg-sky-200 text-sky-900",
            message: "Project CSS ready",
          }),
          renderCacheBadge("Project CSS"),
          renderCssOutput(css),
          renderPreviewBadge("Project preview"),
          renderPreviewData({ html, css, customCss }),
          renderStats({
            classCount: "--",
            cssSize: formatBytes(css.length),
            hash: "--",
            runLabel: nowLabel,
          }),
        ].join("")
      );
    }

    const compileResponse = await fetch(`${CORE_URL}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        pageId,
        html,
        classes,
      }),
    });

    const data = await compileResponse.json();
    if (!compileResponse.ok) {
      throw new Error(data?.error || "Compile failed.");
    }

    return renderResponse(
      [
        renderStatus({
          tone: data.cached
            ? "bg-emerald-200 text-emerald-900"
            : "bg-sky-200 text-sky-900",
          message: data.cached ? "Cache hit" : "Compiled",
        }),
        renderCacheBadge(data.cached ? "cache hit" : "fresh compile"),
        renderCssOutput(data.css || ""),
        renderClassList(data.classes || []),
        renderPreviewBadge(data.cached ? "Cached preview" : "Live preview"),
        renderPreviewData({ html, css: data.css || "", customCss }),
        renderStats({
          classCount: data.classes?.length ?? "--",
          cssSize: formatBytes((data.css || "").length),
          hash: data.hash ? `${data.hash.slice(0, 16)}...` : "--",
          runLabel: nowLabel,
        }),
      ].join("")
    );
  } catch (error) {
    return renderResponse(
      renderStatus({
        tone: "bg-rose-200 text-rose-900",
        message: error?.message || "Something went wrong.",
      })
    );
  }
}
