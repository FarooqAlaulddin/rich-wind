import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCore } from '../services/index.js';

let server;
let baseUrl;

beforeAll(async () => {
  const { handler } = await createCore();
  server = http.createServer(handler).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Cache behavior tests', () => {
  it('compiling same project+page with same classes returns cached: true on second call', async () => {
    const payload = {
      projectId: 'cache-test-1',
      pageId: 'page1',
      classes: 'text-indigo-500',
    };

    // First compile
    const response1 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body1 = await response1.json();
    expect(body1.cached).toBe(false);
    expect(body1.success).toBe(true);

    // Second compile with same payload
    const response2 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body2 = await response2.json();
    expect(body2.cached).toBe(true);
    expect(body2.success).toBe(true);
  });

  it('compiling same project+page with different classes returns cached: false and updates CSS', async () => {
    const projectId = 'cache-test-2';
    const pageId = 'page1';

    // First compile
    const response1 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId,
        classes: 'text-yellow-500',
      }),
    });
    const body1 = await response1.json();
    expect(body1.cached).toBe(false);
    const css1 = body1.css;

    // Second compile with different classes
    const response2 = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId,
        classes: 'bg-teal-500',
      }),
    });
    const body2 = await response2.json();
    expect(body2.cached).toBe(false);
    expect(body2.css).not.toBe(css1);
  });

  it('different projects are isolated (compiling in project-a does not affect project-b)', async () => {
    // Compile in project-a
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-a',
        pageId: 'page1',
        classes: 'text-pink-500',
      }),
    });

    // Compile in project-b
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-b',
        pageId: 'page1',
        classes: 'text-cyan-500',
      }),
    });

    // Get CSS for project-a
    const responseA = await fetch(`${baseUrl}/api/css?projectId=project-a&pageId=page1`);
    const cssA = await responseA.text();
    expect(cssA.length).toBeGreaterThan(0);

    // Get CSS for project-b
    const responseB = await fetch(`${baseUrl}/api/css?projectId=project-b&pageId=page1`);
    const cssB = await responseB.text();
    expect(cssB.length).toBeGreaterThan(0);

    // CSS should be different
    expect(cssA).not.toBe(cssB);
  });

  it('GET /api/css returns the correct CSS for each page after multiple compiles', async () => {
    const projectId = 'cache-test-3';

    // Compile page1
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'text-lime-500',
      }),
    });

    // Compile page2
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page2',
        classes: 'bg-amber-500',
      }),
    });

    // Get CSS for page1
    const response1 = await fetch(`${baseUrl}/api/css?projectId=${projectId}&pageId=page1`);
    const css1 = await response1.text();
    expect(css1.length).toBeGreaterThan(0);

    // Get CSS for page2
    const response2 = await fetch(`${baseUrl}/api/css?projectId=${projectId}&pageId=page2`);
    const css2 = await response2.text();
    expect(css2.length).toBeGreaterThan(0);

    // CSS should be different
    expect(css1).not.toBe(css2);
  });

  it('GET /api/projects/:id/css aggregates classes from all pages in that project', async () => {
    const projectId = 'cache-test-4';

    // Compile multiple pages with different classes
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'text-emerald-500',
      }),
    });

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page2',
        classes: 'bg-rose-500',
      }),
    });

    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page3',
        classes: 'p-8',
      }),
    });

    // Get aggregated CSS
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/css`);
    expect(response.status).toBe(200);
    const css = await response.text();
    expect(css.length).toBeGreaterThan(0);
  });

  it('after updating a page\'s classes, the project aggregated CSS reflects the new classes', async () => {
    const projectId = 'cache-test-5';

    // Initial compile for page1
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'text-violet-500',
      }),
    });

    // Initial compile for page2
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page2',
        classes: 'bg-fuchsia-500',
      }),
    });

    // Get initial aggregated CSS
    const response1 = await fetch(`${baseUrl}/api/projects/${projectId}/css`);
    const css1 = await response1.text();

    // Update page1 with different classes
    await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        pageId: 'page1',
        classes: 'text-sky-500',
      }),
    });

    // Get updated aggregated CSS
    const response2 = await fetch(`${baseUrl}/api/projects/${projectId}/css`);
    const css2 = await response2.text();

    // CSS should be different after update
    expect(css1).not.toBe(css2);
  });
});
