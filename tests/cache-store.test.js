import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createTestServer } from './helpers/createTestServer.js';

const hashClasses = (classes) =>
  crypto.createHash('sha256').update([...classes].sort().join('|')).digest('hex');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, { timeoutMs = 500, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

describe('Cache store integration', () => {
  it('serves page CSS from cacheStore on memory miss and hydrates project suggestions', async () => {
    const store = {
      async readPageArtifact({ projectId, pageId, bundle }) {
        if (projectId !== 'store-proj' || pageId !== 'home' || bundle !== 'full') return null;
        const classes = ['bg-red-500', 'p-4'];
        return {
          css: '.bg-red-500{background-color:red}.p-4{padding:1rem}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { suggestFallback: false, rateLimitDisabled: true }
    });

    try {
      const cssResponse = await fetch(`${baseUrl}/api/css?projectId=store-proj&pageId=home`);
      expect(cssResponse.status).toBe(200);
      const css = await cssResponse.text();
      expect(css).toContain('bg-red-500');

      const suggestResponse = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'store-proj', prefix: 'bg-', limit: 10 })
      });
      expect(suggestResponse.status).toBe(200);
      const suggestBody = await suggestResponse.json();
      expect(suggestBody.suggestions).toContain('bg-red-500');
    } finally {
      await close();
    }
  });

  it('serves css-only store artifacts without hydrating class suggestions', async () => {
    const store = {
      async readPageArtifact() {
        return {
          css: '.bg-red-500{background-color:red}',
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { suggestFallback: false, rateLimitDisabled: true }
    });

    try {
      const cssResponse = await fetch(`${baseUrl}/api/css?projectId=plain-css&pageId=home`);
      expect(cssResponse.status).toBe(200);
      const css = await cssResponse.text();
      expect(css).toContain('bg-red-500');

      const suggestResponse = await fetch(`${baseUrl}/api/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'plain-css', prefix: 'bg-', limit: 10 })
      });
      expect(suggestResponse.status).toBe(200);
      const suggestBody = await suggestResponse.json();
      expect(suggestBody.suggestions).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('treats invalid store artifacts as miss', async () => {
    const store = {
      async readPageArtifact() {
        return { css: 42, classes: ['bg-red-500'] };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=bad-artifact&pageId=home`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('treats expired store artifacts as miss', async () => {
    const classes = ['bg-red-500'];
    const store = {
      async readPageArtifact() {
        return {
          css: '.bg-red-500{background-color:red}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() - 1
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=expired&pageId=home`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('fails open when cacheStore read times out and reports onError', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {
      async readPageArtifact() {
        await sleep(120);
        return {
          css: '.x{}',
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      cacheStoreTimeoutMs: 20,
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=timeout&pageId=home`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
      const reported = errors.find((entry) => entry?.stage === 'cache-store' && entry?.op === 'readPageArtifact');
      expect(reported).toBeTruthy();
      expect(reported.timedOut).toBe(true);
    } finally {
      await close();
    }
  });

  it('reports missing cacheStore artifact methods through onError and fails open', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {};

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    try {
      const pageRead = await fetch(`${baseUrl}/api/css?projectId=missing-ops&pageId=home`);
      expect(pageRead.status).toBe(404);
      expect(await pageRead.json()).toMatchObject({ code: 'NOT_FOUND' });

      const projectRead = await fetch(`${baseUrl}/api/projects/missing-ops/css`);
      expect(projectRead.status).toBe(404);
      expect(await projectRead.json()).toMatchObject({ code: 'NOT_FOUND' });

      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'missing-ops',
          pageId: 'home',
          classes: 'bg-red-500'
        })
      });
      expect(compile.status).toBe(200);

      const projectWrite = await fetch(`${baseUrl}/api/projects/missing-ops/css`);
      expect(projectWrite.status).toBe(200);

      const done = await waitFor(() => {
        const ops = errors
          .filter((entry) => entry?.stage === 'cache-store')
          .map((entry) => entry.op);
        return (
          ops.includes('readPageArtifact') &&
          ops.includes('readProjectArtifact') &&
          ops.includes('upsertPageArtifact') &&
          ops.includes('upsertProjectArtifact')
        );
      }, { timeoutMs: 2000 });
      expect(done).toBe(true);

      const readPageError = errors.find(
        (entry) => entry?.stage === 'cache-store' && entry?.op === 'readPageArtifact'
      );
      expect(readPageError?.error?.code).toBe('CACHE_STORE_METHOD_MISSING');
      expect(readPageError?.timedOut).toBe(false);
    } finally {
      await close();
    }
  });

  it('writes page artifacts through store after compile', async () => {
    const writes = [];
    const store = {
      async upsertPageArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-page',
          pageId: 'home',
          classes: 'bg-red-500 p-4'
        })
      });
      expect(response.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].projectId).toBe('write-page');
      expect(writes[0].pageId).toBe('home');
      expect(writes[0].bundle).toBe('full');
      expect(Array.isArray(writes[0].classes)).toBe(true);
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('waits for queued page-artifact writes during close', async () => {
    let started = false;
    let finished = false;
    let releaseWrite;
    const writeGate = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const store = {
      async upsertPageArtifact() {
        started = true;
        await writeGate;
        finished = true;
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    const compile = await fetch(`${baseUrl}/api/compile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'close-drain',
        pageId: 'home',
        classes: 'bg-red-500'
      })
    });
    expect(compile.status).toBe(200);

    const closePromise = close();
    const writeStarted = await waitFor(() => started, { timeoutMs: 1000 });
    expect(writeStarted).toBe(true);

    let closeFinishedEarly = false;
    closePromise.then(() => {
      closeFinishedEarly = true;
    });

    await sleep(25);
    expect(closeFinishedEarly).toBe(false);
    expect(finished).toBe(false);

    releaseWrite();
    await closePromise;
    expect(finished).toBe(true);
  });

  it('serves theme bundle page CSS from cacheStore on memory miss', async () => {
    const store = {
      async readPageArtifact({ projectId, pageId, bundle }) {
        if (projectId !== 'theme-store-proj' || pageId !== 'home' || bundle !== 'theme') return null;
        const classes = ['bg-red-500'];
        return {
          css: ':root{--color-red-500:#ef4444}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=theme-store-proj&pageId=home&bundle=theme`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css).toContain('--color-red-500');
    } finally {
      await close();
    }
  });

  it('serves utilities bundle page CSS from cacheStore on memory miss', async () => {
    const store = {
      async readPageArtifact({ projectId, pageId, bundle }) {
        if (projectId !== 'utils-store-proj' || pageId !== 'home' || bundle !== 'utilities') return null;
        const classes = ['bg-red-500'];
        return {
          css: '.bg-red-500{background-color:var(--color-red-500)}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=utils-store-proj&pageId=home&bundle=utilities`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css).toContain('.bg-red-500');
    } finally {
      await close();
    }
  });

  it('writes theme bundle page artifacts through store after compile', async () => {
    const writes = [];
    const store = {
      async upsertPageArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-theme-page',
          pageId: 'home',
          classes: 'bg-red-500',
          bundle: 'theme'
        })
      });
      expect(response.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].bundle).toBe('theme');
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('writes utilities bundle page artifacts through store after compile', async () => {
    const writes = [];
    const store = {
      async upsertPageArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-utilities-page',
          pageId: 'home',
          classes: 'bg-red-500',
          bundle: 'utilities'
        })
      });
      expect(response.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].bundle).toBe('utilities');
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('fails open when page artifact upsert throws and reports onError', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {
      async upsertPageArtifact() {
        throw new Error('disk full');
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-fail',
          pageId: 'home',
          classes: 'bg-red-500'
        })
      });
      expect(response.status).toBe(200);
      const done = await waitFor(
        () => errors.some((entry) => entry?.stage === 'cache-store' && entry?.op === 'upsertPageArtifact')
      );
      expect(done).toBe(true);
    } finally {
      await close();
    }
  });

  it('serves project css from cacheStore on miss', async () => {
    const store = {
      async readProjectArtifact({ projectId, bundle }) {
        if (projectId !== 'project-store' || bundle !== 'full') return null;
        return {
          css: '.bg-blue-500{background-color:blue}',
          hash: hashClasses(['bg-blue-500']),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-store/css`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css).toContain('bg-blue-500');
    } finally {
      await close();
    }
  });

  it('serves theme bundle project css from cacheStore on miss', async () => {
    const store = {
      async readProjectArtifact({ projectId, bundle }) {
        if (projectId !== 'project-theme-store' || bundle !== 'theme') return null;
        return {
          css: ':root{--color-blue-500:#3b82f6}',
          hash: hashClasses(['bg-blue-500']),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-theme-store/css?bundle=theme`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css).toContain('--color-blue-500');
    } finally {
      await close();
    }
  });

  it('serves utilities bundle project css from cacheStore on miss', async () => {
    const store = {
      async readProjectArtifact({ projectId, bundle }) {
        if (projectId !== 'project-utils-store' || bundle !== 'utilities') return null;
        return {
          css: '.bg-blue-500{background-color:var(--color-blue-500)}',
          hash: hashClasses(['bg-blue-500']),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-utils-store/css?bundle=utilities`);
      expect(response.status).toBe(200);
      const css = await response.text();
      expect(css).toContain('.bg-blue-500');
    } finally {
      await close();
    }
  });

  it('treats invalid project artifacts as miss', async () => {
    const store = {
      async readProjectArtifact() {
        return { css: 123, hash: 'x' };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-invalid/css`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('treats expired project artifacts as miss', async () => {
    const store = {
      async readProjectArtifact() {
        return {
          css: '.bg-blue-500{background-color:blue}',
          hash: hashClasses(['bg-blue-500']),
          expiresAt: Date.now() - 1
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-expired/css`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('fails open when project cacheStore read times out and service stays healthy', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {
      async readProjectArtifact() {
        await sleep(120);
        return {
          css: '.x{}',
          hash: 'x',
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      cacheStoreTimeoutMs: 20,
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-timeout/css`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });

      const err = errors.find((entry) => entry?.stage === 'cache-store' && entry?.op === 'readProjectArtifact');
      expect(err).toBeTruthy();
      expect(err.timedOut).toBe(true);

      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('writes project artifacts through store on project css route', async () => {
    const writes = [];
    const store = {
      async upsertProjectArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-project',
          pageId: 'home',
          classes: 'bg-emerald-500 text-white'
        })
      });
      expect(compile.status).toBe(200);

      const project = await fetch(`${baseUrl}/api/projects/write-project/css`);
      expect(project.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].projectId).toBe('write-project');
      expect(writes[0].bundle).toBe('full');
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('writes theme bundle project artifacts through store on project css route', async () => {
    const writes = [];
    const store = {
      async upsertProjectArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-theme-project',
          pageId: 'home',
          classes: 'bg-indigo-500'
        })
      });
      expect(compile.status).toBe(200);

      const project = await fetch(`${baseUrl}/api/projects/write-theme-project/css?bundle=theme`);
      expect(project.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].projectId).toBe('write-theme-project');
      expect(writes[0].bundle).toBe('theme');
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('writes utilities bundle project artifacts through store on project css route', async () => {
    const writes = [];
    const store = {
      async upsertProjectArtifact(input) {
        writes.push(input);
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'write-utils-project',
          pageId: 'home',
          classes: 'bg-indigo-500'
        })
      });
      expect(compile.status).toBe(200);

      const project = await fetch(`${baseUrl}/api/projects/write-utils-project/css?bundle=utilities`);
      expect(project.status).toBe(200);

      const done = await waitFor(() => writes.length > 0);
      expect(done).toBe(true);
      expect(writes[0].projectId).toBe('write-utils-project');
      expect(writes[0].bundle).toBe('utilities');
      expect(typeof writes[0].css).toBe('string');
      expect(writes[0].css.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('fails open when project artifact upsert throws and service stays healthy', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {
      async upsertProjectArtifact() {
        throw new Error('project write failed');
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      plugins: [plugin],
      config: { rateLimitDisabled: true }
    });

    try {
      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-write-fail',
          pageId: 'home',
          classes: 'bg-green-500'
        })
      });
      expect(compile.status).toBe(200);

      const project = await fetch(`${baseUrl}/api/projects/project-write-fail/css`);
      expect(project.status).toBe(200);

      const done = await waitFor(
        () => errors.some((entry) => entry?.stage === 'cache-store' && entry?.op === 'upsertProjectArtifact')
      );
      expect(done).toBe(true);

      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('does not upsert project artifact when project response came from cacheStore', async () => {
    let upsertCount = 0;
    const store = {
      async readProjectArtifact() {
        return {
          css: '.bg-cyan-500{background-color:cyan}',
          hash: hashClasses(['bg-cyan-500']),
          expiresAt: Date.now() + 60_000
        };
      },
      async upsertProjectArtifact() {
        upsertCount += 1;
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/project-from-store/css`);
      expect(response.status).toBe(200);
      await sleep(30);
      expect(upsertCount).toBe(0);
    } finally {
      await close();
    }
  });

  it('pre-hydrates missing compile page from store and returns cached true on matching compile', async () => {
    const readCalls = [];
    const classes = ['bg-red-500'];
    const store = {
      async readPageArtifact(input) {
        readCalls.push(input);
        if (input.projectId !== 'prime-proj' || input.pageId !== 'home') return null;
        return {
          css: '.bg-red-500{background-color:red}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'prime-proj',
          pageId: 'home',
          classes: 'bg-red-500'
        })
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.cached).toBe(true);
      expect(readCalls.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('pre-hydration preserves class-delta correctness for subsequent compile updates', async () => {
    const store = {
      async readPageArtifact(input) {
        if (input.projectId !== 'delta-proj' || input.pageId !== 'home') return null;
        const classes = ['bg-red-500'];
        return {
          css: '.bg-red-500{background-color:red}',
          classes,
          hash: hashClasses(classes),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const compile = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'delta-proj',
          pageId: 'home',
          classes: 'bg-blue-500'
        })
      });
      expect(compile.status).toBe(200);
      const body = await compile.json();
      expect(body.cached).toBe(false);

      const projectCss = await fetch(`${baseUrl}/api/projects/delta-proj/css`);
      expect(projectCss.status).toBe(200);
      const css = await projectCss.text();
      expect(css).toContain('bg-blue-500');
      expect(css).not.toContain('bg-red-500');
    } finally {
      await close();
    }
  });

  it('rejects oversized page artifacts from store using maxCssChars', async () => {
    const store = {
      async readPageArtifact() {
        return {
          css: 'x'.repeat(120),
          classes: ['bg-red-500'],
          hash: hashClasses(['bg-red-500']),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { maxCssChars: 20, rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=big-page&pageId=home`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('rejects oversized project artifacts from store using maxCssChars', async () => {
    const store = {
      async readProjectArtifact() {
        return {
          css: 'x'.repeat(120),
          hash: hashClasses(['bg-red-500']),
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { maxCssChars: 20, rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/projects/big-project/css`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await close();
    }
  });

  it('uses RW_CACHE_STORE_TIMEOUT_MS when cacheStoreTimeoutMs is not provided', async () => {
    const errors = [];
    const plugin = {
      onError: (ctx) => errors.push(ctx)
    };
    const store = {
      async readPageArtifact() {
        await sleep(80);
        return {
          css: '.x{}',
          expiresAt: Date.now() + 60_000
        };
      }
    };

    const { baseUrl, close } = await createTestServer(
      { RW_CACHE_STORE_TIMEOUT_MS: '10' },
      {
        cacheStore: store,
        plugins: [plugin],
        config: { rateLimitDisabled: true }
      }
    );

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=env-timeout&pageId=home`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
      const reported = errors.find((entry) => entry?.stage === 'cache-store' && entry?.op === 'readPageArtifact');
      expect(reported).toBeTruthy();
      expect(reported.timedOut).toBe(true);
    } finally {
      await close();
    }
  });

  it('does not consult cacheStore for base bundle page css', async () => {
    let readCount = 0;
    const store = {
      async readPageArtifact() {
        readCount += 1;
        return null;
      }
    };

    const { baseUrl, close } = await createTestServer({}, {
      cacheStore: store,
      config: { rateLimitDisabled: true }
    });

    try {
      const response = await fetch(`${baseUrl}/api/css?projectId=base-only&pageId=home&bundle=base`);
      expect(response.status).toBe(200);
      expect(readCount).toBe(0);
    } finally {
      await close();
    }
  });
});
