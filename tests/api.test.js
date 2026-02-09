import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../services/index.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/compile accepts html + classes and returns css", async () => {
  const response = await fetch(`${baseUrl}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: "proj-a",
      pageId: "home",
      html: `<div class="text-red-500 font-semibold">Hello</div>`,
      classes: "bg-blue-500 p-4",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.success, true);
  assert.equal(body.projectId, "proj-a");
  assert.equal(body.pageId, "home");
  assert.ok(body.css && body.css.length > 0);
  assert.ok(Array.isArray(body.classes));
  assert.ok(body.classes.includes("text-red-500"));
  assert.ok(body.classes.includes("bg-blue-500"));
});

test("GET /api/css returns cached page css", async () => {
  const response = await fetch(
    `${baseUrl}/api/css?projectId=proj-a&pageId=home`
  );

  assert.equal(response.status, 200);
  const css = await response.text();
  assert.ok(css.includes(".text-red-500") || css.includes("text-red-500"));
});

test("GET /api/projects/:projectId/css returns aggregated css", async () => {
  const response = await fetch(`${baseUrl}/api/projects/proj-a/css`);
  assert.equal(response.status, 200);
  const css = await response.text();
  assert.ok(css.length > 0);
});

test("GET /api/css cache miss returns 404", async () => {
  const response = await fetch(
    `${baseUrl}/api/css?projectId=missing&pageId=none`
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.ok(body.error);
});

test("POST /api/compile without projectId returns 400", async () => {
  const response = await fetch(`${baseUrl}/api/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ html: "<div class='text-red-500'></div>" }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.error);
});

test("GET /health returns 200 with status ok", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
});
