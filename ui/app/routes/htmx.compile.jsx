import { CORE_URL } from "../lib/core-url.server.js";
import { getUserId } from "../lib/user-id.server.js";
import {
  formatBytes,
  truncate,
  renderStatus,
  renderCacheBadge,
  renderStats,
  renderCssOutput,
  renderClassList,
  renderPreviewData,
  renderPreviewBadge,
  renderApiPanel,
  buildRequestMeta,
  renderResponse,
} from "../lib/htmx-helpers.server.js";

export async function action({ request }) {
  const formData = await request.formData();
  const projectId = (formData.get("projectId") || "").trim();
  const userId = getUserId(request);
  const fullProjectId = userId ? `${userId}_${projectId}` : projectId;
  const pageId = (formData.get("pageId") || "default").trim() || "default";
  const html = formData.get("html") || "";
  const classes = formData.get("classes") || "";
  const customCss = formData.get("customCss") || "";
  const bundle = (formData.get("bundle") || "full").trim() || "full";
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
          bundle,
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
          fullProjectId
        )}&pageId=${encodeURIComponent(pageId)}${bundle !== "full" ? `&bundle=${encodeURIComponent(bundle)}` : ""}`
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
          bundle,
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
        `${CORE_URL}/api/projects/${encodeURIComponent(fullProjectId)}/css${bundle !== "full" ? `?bundle=${encodeURIComponent(bundle)}` : ""}`
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
          bundle,
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
        projectId: fullProjectId,
        pageId,
        html,
        classes,
        bundle,
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
        bundle,
      }),
      curlPayload: {
        projectId,
        pageId,
        html,
        classes,
        bundle,
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
        bundle,
      }),
      curlPayload:
        intent === "compile"
          ? {
              projectId,
              pageId,
              html,
              classes,
              bundle,
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
