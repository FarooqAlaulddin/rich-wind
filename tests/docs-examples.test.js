import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import crypto from "node:crypto";
import { createCore, RichWindError } from "../services/index.js";

async function startServer(handler) {
  const server = http.createServer(handler).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    server,
    baseUrl: `http://localhost:${port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe("Docs examples", () => {
  let core;
  let baseUrl;

  beforeAll(async () => {
    const { handler } = await createCore({});
    core = await startServer(handler);
    baseUrl = core.baseUrl;
  });

  afterAll(async () => {
    if (core) await core.close();
  });

  it("docs import snippet works with package self-reference", async () => {
    const mod = await import("rich-wind");
    expect(typeof mod.createCore).toBe("function");
  });

  it("index compile example works", async () => {
    const response = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "my-app",
        pageId: "hero",
        html: '<div class="text-red-500 p-4">Hello</div>',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.projectId).toBe("my-app");
    expect(body.pageId).toBe("hero");
    expect(body.classes).toContain("text-red-500");
    expect(body.classes).toContain("p-4");
    expect(typeof body.css).toBe("string");
    expect(body.css.length).toBeGreaterThan(0);
  });

  it("index split bundle examples work", async () => {
    const baseRes = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "my-app", bundle: "base" }),
    });
    expect(baseRes.status).toBe(200);
    const baseBody = await baseRes.json();
    expect(baseBody.bundle).toBe("base");
    expect(baseBody.classes).toEqual([]);

    const themeRes = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "my-app",
        classes: "bg-red-500 text-white",
        bundle: "theme",
      }),
    });
    expect(themeRes.status).toBe(200);
    const themeBody = await themeRes.json();
    expect(themeBody.bundle).toBe("theme");
    expect(themeBody.css).toContain("--color-");

    const utilitiesRes = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "my-app",
        classes: "bg-red-500",
        bundle: "utilities",
      }),
    });
    expect(utilitiesRes.status).toBe(200);
    const utilitiesBody = await utilitiesRes.json();
    expect(utilitiesBody.bundle).toBe("utilities");
    expect(utilitiesBody.css).toContain("bg-red-500");
    expect(utilitiesBody.css).not.toContain(":root, :host");
  });

  it("index get css/project css/suggest examples work", async () => {
    const cssRes = await fetch(`${baseUrl}/api/css?projectId=my-app&pageId=hero`);
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    expect(css.length).toBeGreaterThan(0);

    const projectRes = await fetch(
      `${baseUrl}/api/projects/my-app/css?bundle=utilities`
    );
    expect(projectRes.status).toBe(200);
    const projectCss = await projectRes.text();
    expect(projectCss.length).toBeGreaterThan(0);

    const suggestRes = await fetch(`${baseUrl}/api/suggest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "my-app",
        prefix: "bg-",
        limit: 8,
      }),
    });
    expect(suggestRes.status).toBe(200);
    const suggestBody = await suggestRes.json();
    expect(suggestBody.success).toBe(true);
    expect(suggestBody.suggestions.length).toBeLessThanOrEqual(8);
  });

  it("api-reference compile/get-css/project-css/suggest examples work", async () => {
    const compileRes = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "demo",
        pageId: "hero",
        html: '<div class="text-red-500">Hello</div>',
        classes: "bg-blue-500 p-4",
        bundle: "full",
      }),
    });
    expect(compileRes.status).toBe(200);
    const compileBody = await compileRes.json();
    expect(compileBody.success).toBe(true);
    expect(compileBody.projectId).toBe("demo");
    expect(compileBody.pageId).toBe("hero");
    expect(compileBody.bundle).toBe("full");
    expect(compileBody.classes).toContain("bg-blue-500");

    const cssRes = await fetch(
      `${baseUrl}/api/css?projectId=demo&pageId=hero&bundle=utilities`
    );
    expect(cssRes.status).toBe(200);
    const css = await cssRes.text();
    expect(css).toContain("bg-blue-500");

    const projectRes = await fetch(`${baseUrl}/api/projects/demo/css?bundle=theme`);
    expect(projectRes.status).toBe(200);
    const projectCss = await projectRes.text();
    expect(projectCss).toContain("--color-");

    const suggestRes = await fetch(`${baseUrl}/api/suggest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "demo", prefix: "bg-", limit: 20 }),
    });
    expect(suggestRes.status).toBe(200);
    const suggestBody = await suggestRes.json();
    expect(suggestBody.success).toBe(true);
    expect(suggestBody.suggestions.length).toBeLessThanOrEqual(20);
  });

  it("api-reference health example works", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  it("api-reference library snippet works", async () => {
    const { handler } = await createCore({
      config: { cacheTtlMs: 600000 },
      pluginTimeoutMs: 200,
      plugins: [],
    });
    const server = await startServer(handler);
    try {
      const response = await fetch(`${server.baseUrl}/health`);
      expect(response.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("integration cookbook minimal embedded core snippet works", async () => {
    const { handler } = await createCore({
      config: {
        cacheMaxPages: 500,
        cacheTtlMs: 10 * 60 * 1000,
        projectCacheTtlMs: 10 * 60 * 1000,
      },
    });

    const server = await startServer(handler);
    try {
      const response = await fetch(`${server.baseUrl}/api/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "cookbook-min",
          pageId: "hero",
          classes: "bg-red-500 text-white p-4",
        }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("integration cookbook wrapper snippet works", async () => {
    const core = await createCore({});

    const wrapper = express();
    wrapper.use(express.json({ limit: "100kb" }));

    function tenantFromRequest(req) {
      return req.header("x-tenant-id") || null;
    }

    function scopedProjectId(tenantId, projectSlug) {
      return crypto
        .createHash("sha256")
        .update(`${tenantId}:${projectSlug}`)
        .digest("hex")
        .slice(0, 32);
    }

    wrapper.post("/css/compile", async (req, res) => {
      const tenantId = tenantFromRequest(req);
      if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

      const projectSlug = String(req.body.projectSlug || "");
      if (!projectSlug)
        return res.status(400).json({ error: "projectSlug required" });

      const payload = {
        projectId: scopedProjectId(tenantId, projectSlug),
        pageId: String(req.body.pageId || "default"),
        html: req.body.html,
        classes: req.body.classes,
        bundle: req.body.bundle || "full",
      };

      try {
        res.json(await core.compile(payload));
      } catch (err) {
        if (err instanceof RichWindError) {
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        throw err;
      }
    });

    const wrapperServer = await startServer(wrapper);

    try {
      const unauth = await fetch(`${wrapperServer.baseUrl}/css/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectSlug: "landing",
          pageId: "hero",
          classes: "bg-red-500 text-white",
        }),
      });
      expect(unauth.status).toBe(401);

      const auth = await fetch(`${wrapperServer.baseUrl}/css/compile`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": "tenant-a",
        },
        body: JSON.stringify({
          projectSlug: "landing",
          pageId: "hero",
          classes: "bg-red-500 text-white",
        }),
      });
      expect(auth.status).toBe(200);
      const body = await auth.json();
      expect(body.success).toBe(true);
      expect(body.projectId).toBe(scopedProjectId("tenant-a", "landing"));
      expect(body.projectId).toHaveLength(32);
      expect(body.pageId).toBe("hero");
    } finally {
      await wrapperServer.close();
      await core.close();
    }
  });

  it("api-reference core.fetch basePath and plugin-system addRoute examples work", async () => {
    const plugin = {
      name: "docs-routes",
      setup({ addRoute }) {
        addRoute("get", "/stats", () => ({ body: { ok: true } }));
        addRoute("post", "/echo", async (req) => ({ status: 201, body: await req.json() }));
      },
    };
    const fetchCore = await createCore({ plugins: [plugin], config: {} });
    try {
      const res = await fetchCore.fetch(
        new Request("http://x/rw/api/compile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: "fetch-doc", classes: "p-4" }),
        }),
        { basePath: "/rw" }
      );
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      const outside = await fetchCore.fetch(new Request("http://x/other/api/compile"), {
        basePath: "/rw",
      });
      expect(outside.status).toBe(404);

      const stats = await fetchCore.fetch(new Request("http://x/plugins/docs-routes/stats"));
      expect(await stats.json()).toEqual({ ok: true });

      const echo = await fetchCore.fetch(
        new Request("http://x/plugins/docs-routes/echo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ a: 1 }),
        })
      );
      expect(echo.status).toBe(201);
      expect(await echo.json()).toEqual({ a: 1 });
    } finally {
      await fetchCore.close();
    }
  });

  it("plugin-system ctx.compile result and RichWindError example works", async () => {
    const { RichWindError, createCore: createPackageCore } = await import("rich-wind");
    let ctx;
    const warnings = [];
    const plugin = { name: "docs-compile", setup(c) { ctx = c; } };
    const pluginCore = await createPackageCore({ plugins: [plugin] });
    try {
      const { css } = await ctx.compile({ projectId: "main", pageId: "promo", classes: "p-4" });
      expect(css).toContain(".p-4");

      try {
        await ctx.compile({ projectId: "main", pageId: "promo" });
      } catch (err) {
        if (err instanceof RichWindError) warnings.push([err.status, err.code, err.message]);
      }
      expect(warnings).toEqual([[400, "MISSING_INPUT", "Either html or classes is required."]]);
    } finally {
      await pluginCore.close();
    }
  });

  it("persistence layer idea plugin write-behind example works", async () => {
    const writes = [];
    const plugin = {
      name: "persist-write-behind",
      deferHooks: ["onCompileResult", "onProjectCss"],
      async onCompileResult({ projectId, pageId, bundle, hash, classes, css }) {
        writes.push({
          type: "page",
          projectId,
          pageId,
          bundle,
          hash,
          classes,
          cssLength: css.length,
        });
      },
      async onProjectCss({ projectId, bundle, hash, css }) {
        writes.push({
          type: "project",
          projectId,
          bundle,
          hash,
          cssLength: css.length,
        });
      },
    };

    const { handler } = await createCore({
      plugins: [plugin],
      pluginTimeoutMs: 200,
    });

    const server = await startServer(handler);
    try {
      const compile = await fetch(`${server.baseUrl}/api/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: "persist-review",
          pageId: "hero",
          classes: "bg-red-500 text-white p-4",
        }),
      });
      expect(compile.status).toBe(200);

      const projectCss = await fetch(
        `${server.baseUrl}/api/projects/persist-review/css?bundle=utilities`
      );
      expect(projectCss.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const pageWrite = writes.find((entry) => entry.type === "page");
      const projectWrite = writes.find((entry) => entry.type === "project");

      expect(pageWrite).toBeTruthy();
      expect(projectWrite).toBeTruthy();
      expect(pageWrite.projectId).toBe("persist-review");
      expect(pageWrite.pageId).toBe("hero");
      expect(pageWrite.cssLength).toBeGreaterThan(0);
      expect(projectWrite.projectId).toBe("persist-review");
      expect(projectWrite.cssLength).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("agent-quickstart loop works through core calls and HTTP", async () => {
    const quickCore = await createCore();
    try {
      const projectId = "agent-demo";
      const pageId = "card";
      let html = '<div class="p-4 bg-brand-500 rounded-lg">Hi</div>';
      let classes = ["p-4", "bg-brand-500", "rounded-lg"];

      let result = await quickCore.compile({ projectId, pageId, html, classes });
      expect(result.rejected).toEqual(["bg-brand-500"]);
      expect(result.classes).toEqual(["p-4", "rounded-lg"]);

      html = '<div class="p-4 bg-blue-500 rounded-lg">Hi</div>';
      classes = ["p-4", "bg-blue-500", "rounded-lg"];
      result = await quickCore.compile({ projectId, pageId, html, classes });
      expect(result.rejected).toEqual([]);
      expect(result.classes).toEqual(["bg-blue-500", "p-4", "rounded-lg"]);

      const { css } = await quickCore.getCss({ projectId, pageId });
      expect(css).toContain("bg-blue-500");
    } finally {
      await quickCore.close();
    }

    const res = await fetch(`${baseUrl}/api/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "agent-demo",
        pageId: "card",
        html: '<div class="p-4 bg-brand-500 rounded-lg">Hi</div>',
        classes: "p-4 bg-brand-500 rounded-lg",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual([
      "success", "projectId", "pageId", "bundle", "hash",
      "classes", "rejected", "cached", "css",
    ]);
    expect(body.classes).toEqual(["p-4", "rounded-lg"]);
    expect(body.rejected).toEqual(["bg-brand-500"]);

    const cssRes = await fetch(`${baseUrl}/api/css?projectId=agent-demo&pageId=card`);
    expect(cssRes.status).toBe(200);
  });
});
