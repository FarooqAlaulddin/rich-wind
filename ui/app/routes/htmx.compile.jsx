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

const truncate = (value = "", limit = 320) => {
  const safe = String(value || "");
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit)}…`;
};

const escapeShellSingle = (value = "") => String(value).replace(/'/g, `'\"'\"'`);

const resolveCoreUrl = (path = "") => {
  return `${CORE_URL.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
};

const buildCurlCommand = (kind, request, curlPayload) => {
  const projectId = request?.projectId || "";
  const pageId = request?.pageId || "";
  if (kind === "compile") {
    const payload = curlPayload || {
      projectId,
      pageId,
      html: "",
      classes: "",
    };
    const body = escapeShellSingle(JSON.stringify(payload));
    return `curl -X POST ${resolveCoreUrl("/api/compile")} -H "Content-Type: application/json" -d '${body}'`;
  }
  if (kind === "cache") {
    return `curl "${resolveCoreUrl(`/api/css?projectId=${encodeURIComponent(
      projectId
    )}&pageId=${encodeURIComponent(pageId)}`)}"`;
  }
  if (kind === "project") {
    return `curl "${resolveCoreUrl(`/api/projects/${encodeURIComponent(projectId)}/css`)}"`;
  }
  return "";
};

const renderApiPanel = ({ kind, request, response, status = "ok", curlPayload }) => {
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

const buildRequestMeta = ({ projectId, pageId, html, classes, customCss, intent }) => {
  const path =
    intent === "compile"
      ? "/api/compile"
      : intent === "cache"
      ? `/api/css?projectId=${encodeURIComponent(projectId)}&pageId=${encodeURIComponent(pageId)}`
      : `/api/projects/${encodeURIComponent(projectId)}/css`;
  return {
    method: intent === "compile" ? "POST" : "GET",
    url: resolveCoreUrl(path),
    projectId,
    pageId,
    intent,
    html: html ? `<HTML:${String(html).length}>` : "",
    classes: classes ? `<CLASSES:${String(classes).length}>` : "",
    customCss: customCss ? `<CUSTOM_CSS:${String(customCss).length}>` : "",
  };
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
    const apiPanel = renderApiPanel({
      kind: "compile",
      request: buildRequestMeta({
        projectId,
        pageId,
        html,
        classes,
        customCss,
        intent,
      }),
      response: { error: "Project ID required" },
      status: "error",
    });
    return renderResponse(
      renderStatus({
        tone: "bg-rose-200 text-rose-900",
        message: "Project ID required",
      }) + apiPanel
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
      const apiPanel = renderApiPanel({
        kind: "cache",
        request: buildRequestMeta({
          projectId,
          pageId,
          html,
          classes,
          customCss,
          intent,
        }),
        response: {
          status: "cache hit",
          cssBytes: css.length,
          cssSnippet: truncate(css, 320),
        },
        curlPayload: null,
        status: "ok",
      });
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
          apiPanel,
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
      const apiPanel = renderApiPanel({
        kind: "project",
        request: buildRequestMeta({
          projectId,
          pageId,
          html,
          classes,
          customCss,
          intent,
        }),
        response: {
          status: "project css",
          cssBytes: css.length,
          cssSnippet: truncate(css, 320),
        },
        curlPayload: null,
        status: "ok",
      });
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
          apiPanel,
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

    const apiPanel = renderApiPanel({
      kind: "compile",
      request: buildRequestMeta({
        projectId,
        pageId,
        html,
        classes,
        customCss,
        intent,
      }),
      curlPayload: {
        projectId,
        pageId,
        html,
        classes,
      },
      response: {
        cached: Boolean(data.cached),
        cssBytes: (data.css || "").length,
        classCount: data.classes?.length ?? 0,
        hash: data.hash ? `${data.hash.slice(0, 16)}...` : null,
        cssSnippet: data.css ? `<CSS:${(data.css || "").length}>` : "",
      },
      status: "ok",
    });
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
        apiPanel,
      ].join("")
    );
  } catch (error) {
    const apiPanel = renderApiPanel({
      kind: intent === "cache" ? "cache" : intent === "project" ? "project" : "compile",
      request: buildRequestMeta({
        projectId,
        pageId,
        html,
        classes,
        customCss,
        intent,
      }),
      curlPayload:
        intent === "compile"
          ? {
              projectId,
              pageId,
              html,
              classes,
            }
          : null,
      response: {
        error: error?.message || "Something went wrong.",
      },
      status: "error",
    });
    return renderResponse(
      renderStatus({
        tone: "bg-rose-200 text-rose-900",
        message: error?.message || "Something went wrong.",
      }) + apiPanel
    );
  }
}
