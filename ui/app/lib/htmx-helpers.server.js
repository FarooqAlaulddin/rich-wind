import { CORE_URL } from "./core-url.server.js";

export const escapeHtml = (value = "") => {
  const safe = value === null || value === undefined ? "" : String(value);
  return safe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const formatBytes = (value) => {
  if (!value && value !== 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

export const renderStatus = ({ tone, message }) => {
  return `<span id="status-pill" hx-swap-oob="true" class="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ${tone}">${escapeHtml(
    message
  )}</span>`;
};

export const renderCacheBadge = (label) => {
  return `<span id="cache-badge" hx-swap-oob="true" class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">${escapeHtml(
    label
  )}</span>`;
};

export const renderStats = ({ classCount, cssSize, hash, runLabel }) => {
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

export const renderCssOutput = (css) => {
  return `<div id="css-output" hx-swap-oob="true" class="mt-4 rounded-2xl border border-slate-200 bg-slate-950/95 p-4 text-xs text-slate-200"><pre class="font-mono whitespace-pre-wrap break-words">${escapeHtml(
    css || "Compile to see CSS output."
  )}</pre></div>`;
};

export const renderClassList = (classes) => {
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

export const renderPreviewData = ({ html, css, customCss }) => {
  const payload = Buffer.from(
    JSON.stringify({ html, css, customCss }),
    "utf8"
  ).toString("base64");
  return `<div id="preview-data" hx-swap-oob="true" data-payload="${escapeHtml(
    payload
  )}"></div>`;
};

export const renderPreviewBadge = (label) => {
  return `<span id="preview-badge" hx-swap-oob="true" class="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">${escapeHtml(
    label
  )}</span>`;
};

export const truncate = (value = "", limit = 320) => {
  const safe = String(value || "");
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit)}…`;
};

const escapeShellSingle = (value = "") => String(value).replace(/'/g, `'\"'\"'`);

const resolveCoreUrl = (path = "") => {
  return `${CORE_URL.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
};

export const buildCurlCommand = (kind, request, curlPayload) => {
  const projectId = request?.projectId || "";
  const pageId = request?.pageId || "";
  const bundle = request?.bundle || "";
  if (kind === "compile") {
    const payload = curlPayload || {
      projectId,
      pageId,
      html: "",
      classes: "",
    };
    if (bundle && bundle !== "full") payload.bundle = bundle;
    const body = escapeShellSingle(JSON.stringify(payload));
    return `curl -X POST ${resolveCoreUrl("/api/compile")} -H "Content-Type: application/json" -d '${body}'`;
  }
  if (kind === "cache") {
    const bundleParam = bundle && bundle !== "full" ? `&bundle=${encodeURIComponent(bundle)}` : "";
    return `curl "${resolveCoreUrl(`/api/css?projectId=${encodeURIComponent(
      projectId
    )}&pageId=${encodeURIComponent(pageId)}${bundleParam}`)}"`;
  }
  if (kind === "project") {
    const bundleParam = bundle && bundle !== "full" ? `?bundle=${encodeURIComponent(bundle)}` : "";
    return `curl "${resolveCoreUrl(`/api/projects/${encodeURIComponent(projectId)}/css${bundleParam}`)}"`;
  }
  return "";
};

export const renderApiPanel = ({ kind, request, response, status = "ok", curlPayload }) => {
  const time = new Date().toLocaleTimeString();
  const req = escapeHtml(JSON.stringify(request, null, 2));
  const res = escapeHtml(JSON.stringify(response, null, 2));
  const tone = status === "error" ? "is-error" : "is-ok";
  const curl = escapeHtml(buildCurlCommand(kind, request, curlPayload));
  return [
    `<pre id="api-${kind}-request" hx-swap-oob="true" class="api-code" data-json="${req}" data-curl="${curl}" data-view="json">${req}</pre>`,
    `<pre id="api-${kind}-response" hx-swap-oob="true" class="api-code">${res}</pre>`,
    `<span id="api-${kind}-time" hx-swap-oob="true" class="api-time">${escapeHtml(
      time
    )}</span>`,
    `<span id="api-${kind}-status" hx-swap-oob="true" class="api-status ${tone}">${escapeHtml(
      status.toUpperCase()
    )}</span>`,
  ].join("");
};

export const buildRequestMeta = ({ projectId, pageId, html, classes, customCss, intent, bundle }) => {
  const bundleParam = bundle && bundle !== "full" ? `&bundle=${encodeURIComponent(bundle)}` : "";
  const projectBundleParam = bundle && bundle !== "full" ? `?bundle=${encodeURIComponent(bundle)}` : "";
  const path =
    intent === "compile"
      ? "/api/compile"
      : intent === "cache"
      ? `/api/css?projectId=${encodeURIComponent(projectId)}&pageId=${encodeURIComponent(pageId)}${bundleParam}`
      : `/api/projects/${encodeURIComponent(projectId)}/css${projectBundleParam}`;
  return {
    method: intent === "compile" ? "POST" : "GET",
    url: resolveCoreUrl(path),
    projectId,
    pageId,
    intent,
    bundle: bundle || "full",
    html: html ? `<HTML:${String(html).length}>` : "",
    classes: classes ? `<CLASSES:${String(classes).length}>` : "",
    customCss: customCss ? `<CUSTOM_CSS:${String(customCss).length}>` : "",
  };
};

export const renderResponse = (payload) => {
  return new Response(`<div class="htmx-stub"></div>${payload}`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
