import http from 'node:http';
import { createCore } from '../services/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function asInt(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function asFloat(value, fallback, min = 0, max = 1) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[idx];
}

function summarizeLatency(latencies) {
  if (!latencies.length) {
    return {
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0
    };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    avgMs: total / sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1]
  };
}

function createMetrics() {
  const buckets = new Map();
  const overall = {
    name: 'overall',
    requests: 0,
    ok: 0,
    errors: 0,
    latencies: [],
    statuses: new Map()
  };

  const ensure = (name) => {
    if (!buckets.has(name)) {
      buckets.set(name, {
        name,
        requests: 0,
        ok: 0,
        errors: 0,
        latencies: [],
        statuses: new Map()
      });
    }
    return buckets.get(name);
  };

  const record = (name, { ok, status, latencyMs }) => {
    for (const bucket of [overall, ensure(name)]) {
      bucket.requests += 1;
      if (ok) bucket.ok += 1;
      else bucket.errors += 1;
      bucket.latencies.push(latencyMs);
      bucket.statuses.set(status, (bucket.statuses.get(status) || 0) + 1);
    }
  };

  const snapshot = () => [overall, ...buckets.values()].map((bucket) => {
    const latency = summarizeLatency(bucket.latencies);
    return {
      name: bucket.name,
      requests: bucket.requests,
      ok: bucket.ok,
      errors: bucket.errors,
      errorRate: bucket.requests ? bucket.errors / bucket.requests : 0,
      ...latency,
      statuses: Array.from(bucket.statuses.entries())
        .sort((a, b) => b[1] - a[1])
    };
  });

  return { record, snapshot };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function buildIds(projectCount, pagesPerProject) {
  const projects = [];
  const pagesByProject = new Map();

  for (let p = 0; p < projectCount; p += 1) {
    const projectId = `load-proj-${String(p).padStart(2, '0')}`;
    projects.push(projectId);
    const pages = [];
    for (let i = 0; i < pagesPerProject; i += 1) {
      pages.push(`page-${String(i).padStart(3, '0')}`);
    }
    pagesByProject.set(projectId, pages);
  }

  return { projects, pagesByProject };
}

function randomClasses(classPool, min = 2, max = 5) {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const selected = new Set();
  while (selected.size < count) selected.add(randomItem(classPool));
  return Array.from(selected).join(' ');
}

async function startCoreInstance(options = {}) {
  const { handler, close } = await createCore(options);
  const server = http.createServer(handler).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://localhost:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  };
}

function createSharedStore() {
  const pageArtifacts = new Map();
  const projectArtifacts = new Map();

  const pageKey = ({ projectId, pageId, bundle }) => `${projectId}::${pageId}::${bundle || 'full'}`;
  const projectKey = ({ projectId, bundle }) => `${projectId}::${bundle || 'full'}`;

  const clone = (value) => {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  };

  return {
    async readPageArtifact(input) {
      return clone(pageArtifacts.get(pageKey(input)) ?? null);
    },
    async upsertPageArtifact(input) {
      pageArtifacts.set(pageKey(input), clone(input));
    },
    async readProjectArtifact(input) {
      return clone(projectArtifacts.get(projectKey(input)) ?? null);
    },
    async upsertProjectArtifact(input) {
      projectArtifacts.set(projectKey(input), clone(input));
    },
    async deletePageArtifact(input) {
      pageArtifacts.delete(pageKey(input));
    },
    async deleteProjectArtifact(input) {
      projectArtifacts.delete(projectKey(input));
    },
    async deleteProjectPageArtifacts({ projectId }) {
      const prefix = `${projectId}::`;
      for (const key of pageArtifacts.keys()) {
        if (key.startsWith(prefix)) pageArtifacts.delete(key);
      }
    }
  };
}

async function timedRequest(name, url, init, metrics) {
  const start = performance.now();
  try {
    const response = await fetch(url, init);
    const latencyMs = performance.now() - start;
    const ok = response.status >= 200 && response.status < 300;
    const status = String(response.status);

    // Drain body to avoid leaking sockets during heavy runs.
    if (response.headers.get('content-type')?.includes('application/json')) {
      await response.json().catch(() => ({}));
    } else {
      await response.text().catch(() => '');
    }

    metrics.record(name, { ok, status, latencyMs });
    return { ok, status: response.status, latencyMs };
  } catch (error) {
    const latencyMs = performance.now() - start;
    metrics.record(name, { ok: false, status: 'ERR', latencyMs });
    return { ok: false, status: 0, latencyMs, error };
  }
}

async function seedData({
  writerUrl,
  projects,
  pagesByProject,
  classPool,
  metrics
}) {
  const jobs = [];
  for (const projectId of projects) {
    for (const pageId of pagesByProject.get(projectId)) {
      jobs.push({ projectId, pageId });
    }
  }

  let idx = 0;
  const parallel = 10;
  async function worker() {
    while (idx < jobs.length) {
      const current = jobs[idx];
      idx += 1;
      const classes = randomClasses(classPool, 3, 6);
      await timedRequest(
        'seed.compile',
        `${writerUrl}/api/compile`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId: current.projectId,
            pageId: current.pageId,
            classes
          })
        },
        metrics
      );
    }
  }

  await Promise.all(Array.from({ length: parallel }, () => worker()));

  // Warm project artifacts in the shared store.
  await Promise.all(
    projects.map((projectId) =>
      timedRequest(
        'seed.project-css',
        `${writerUrl}/api/projects/${encodeURIComponent(projectId)}/css`,
        { method: 'GET' },
        metrics
      )
    )
  );
}

async function runScenario({
  durationMs,
  concurrency,
  writeRatio,
  writerUrl,
  readerUrls,
  projects,
  pagesByProject,
  classPool,
  metrics
}) {
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;

  async function worker() {
    while (Date.now() < deadline) {
      const isWrite = Math.random() < writeRatio;
      const projectId = randomItem(projects);
      const pageId = randomItem(pagesByProject.get(projectId));

      if (isWrite) {
        const classes = randomClasses(classPool, 2, 5);
        await timedRequest(
          'load.compile',
          `${writerUrl}/api/compile`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectId, pageId, classes })
          },
          metrics
        );
        continue;
      }

      const readerUrl = randomItem(readerUrls);
      const choice = Math.random();

      if (choice < 0.8) {
        await timedRequest(
          'load.page-css',
          `${readerUrl}/api/css?projectId=${encodeURIComponent(projectId)}&pageId=${encodeURIComponent(pageId)}`,
          { method: 'GET' },
          metrics
        );
      } else if (choice < 0.95) {
        await timedRequest(
          'load.project-css',
          `${readerUrl}/api/projects/${encodeURIComponent(projectId)}/css`,
          { method: 'GET' },
          metrics
        );
      } else {
        await timedRequest(
          'load.suggest',
          `${readerUrl}/api/suggest`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectId, prefix: 'bg-', limit: 20 })
          },
          metrics
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function probePropagation({
  writerUrl,
  readerUrls,
  projectId,
  pageId,
  metrics
}) {
  const firstClass = 'bg-red-500';
  const secondClass = 'bg-blue-500';

  const first = await timedRequest(
    'probe.compile.first',
    `${writerUrl}/api/compile`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, pageId, classes: firstClass })
    },
    metrics
  );
  if (!first.ok) return { ok: false, propagationMs: null };

  const second = await timedRequest(
    'probe.compile.second',
    `${writerUrl}/api/compile`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, pageId, classes: secondClass })
    },
    metrics
  );
  if (!second.ok) return { ok: false, propagationMs: null };

  const started = performance.now();
  const timeoutMs = 5000;
  while (performance.now() - started < timeoutMs) {
    const readerUrl = randomItem(readerUrls);
    const response = await fetch(
      `${readerUrl}/api/css?projectId=${encodeURIComponent(projectId)}&pageId=${encodeURIComponent(pageId)}`
    );
    if (response.ok) {
      const css = await response.text();
      if (css.includes('.bg-blue-500') && !css.includes('.bg-red-500')) {
        return { ok: true, propagationMs: performance.now() - started };
      }
    } else {
      await response.text().catch(() => '');
    }
    await sleep(20);
  }
  return { ok: false, propagationMs: null };
}

function printReport({
  startedAt,
  finishedAt,
  summary,
  config,
  propagation
}) {
  const elapsedSec = Math.max(0.001, (finishedAt - startedAt) / 1000);
  console.log('\n=== Load Test Config ===');
  console.log(`mode: ${config.mode}`);
  console.log(`durationMs: ${config.durationMs}`);
  console.log(`concurrency: ${config.concurrency}`);
  console.log(`writeRatio: ${config.writeRatio}`);
  console.log(`projects: ${config.projectCount}`);
  console.log(`pagesPerProject: ${config.pagesPerProject}`);
  console.log(`readers: ${config.readerCount}`);

  console.log('\n=== Results ===');
  for (const row of summary) {
    const rps = row.requests / elapsedSec;
    console.log(
      `${row.name.padEnd(18)} requests=${String(row.requests).padStart(6)} ok=${String(row.ok).padStart(6)} ` +
      `errors=${String(row.errors).padStart(6)} errorRate=${pct(row.errorRate).padStart(8)} ` +
      `rps=${rps.toFixed(1).padStart(8)} p95=${row.p95Ms.toFixed(1).padStart(7)}ms p99=${row.p99Ms.toFixed(1).padStart(7)}ms`
    );
  }

  if (propagation) {
    console.log('\n=== Propagation Probe ===');
    if (propagation.ok) {
      console.log(`writer->reader update visibility: ${propagation.propagationMs.toFixed(1)}ms`);
    } else {
      console.log('writer->reader update visibility: timed out (>5000ms)');
    }
  }
}

async function main() {
  const durationMs = asInt(process.env.RW_LOAD_DURATION_MS, 30000, 1000);
  const concurrency = asInt(process.env.RW_LOAD_CONCURRENCY, 40, 1);
  const writeRatio = asFloat(process.env.RW_LOAD_WRITE_RATIO, 0.15, 0, 1);
  const projectCount = asInt(process.env.RW_LOAD_PROJECTS, 8, 1);
  const pagesPerProject = asInt(process.env.RW_LOAD_PAGES_PER_PROJECT, 20, 1);
  const readerCount = asInt(process.env.RW_LOAD_READERS, 2, 1);

  const writerUrlEnv = process.env.RW_LOAD_WRITER_URL?.trim();
  const readerUrlsEnv = (process.env.RW_LOAD_READER_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const externalMode = Boolean(writerUrlEnv && readerUrlsEnv.length);

  const classPool = [
    'bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
    'text-white', 'text-slate-900', 'text-slate-100',
    'p-2', 'p-4', 'p-6', 'm-2', 'rounded', 'rounded-lg',
    'font-semibold', 'shadow', 'shadow-lg', 'border', 'border-slate-200',
    'grid', 'grid-cols-2', 'flex', 'items-center', 'justify-between'
  ];

  const { projects, pagesByProject } = buildIds(projectCount, pagesPerProject);
  const metrics = createMetrics();

  let writer;
  const readers = [];
  let writerUrl = writerUrlEnv;
  let readerUrls = readerUrlsEnv;
  let mode = 'external';

  try {
    if (!externalMode) {
      mode = 'local';
      const store = createSharedStore();
      writer = await startCoreInstance({
        cacheStore: store,
        config: { nodeRole: 'writer' }
      });
      writerUrl = writer.baseUrl;
      for (let i = 0; i < readerCount; i += 1) {
        const reader = await startCoreInstance({
          cacheStore: store,
          config: { nodeRole: 'reader' }
        });
        readers.push(reader);
      }
      readerUrls = readers.map((reader) => reader.baseUrl);
    }

    console.log('Seeding load dataset...');
    await seedData({
      writerUrl,
      projects,
      pagesByProject,
      classPool,
      metrics
    });

    console.log('Running mixed load scenario...');
    const startedAt = Date.now();
    await runScenario({
      durationMs,
      concurrency,
      writeRatio,
      writerUrl,
      readerUrls,
      projects,
      pagesByProject,
      classPool,
      metrics
    });
    const finishedAt = Date.now();

    const propagation = await probePropagation({
      writerUrl,
      readerUrls,
      projectId: projects[0],
      pageId: pagesByProject.get(projects[0])[0],
      metrics
    });

    const summary = metrics.snapshot();
    printReport({
      startedAt,
      finishedAt,
      summary,
      config: {
        mode,
        durationMs,
        concurrency,
        writeRatio,
        projectCount,
        pagesPerProject,
        readerCount: readerUrls.length
      },
      propagation
    });
  } finally {
    await Promise.all([
      ...(writer ? [writer.close()] : []),
      ...readers.map((reader) => reader.close())
    ]);
  }
}

main().catch((error) => {
  console.error('Load test failed.');
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
