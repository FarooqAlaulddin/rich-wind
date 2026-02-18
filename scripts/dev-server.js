/**
 * Dev server that starts rich-wind with all discovered plugins loaded,
 * plus serves the Preact SPA from demo/dist/ (production) or proxies to Vite (dev).
 * Usage: node scripts/dev-server.js
 *        npm run dev:demo
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCore } from '../services/index.js';
import { loadPlugins } from '../plugins/loader.js';
import { registerDemoRoutes } from './demo-routes.js';

const PORT = process.env.RW_CORE_PORT || process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../demo/dist');
const isProd = process.env.NODE_ENV === 'production';

const plugins = await loadPlugins();

const { app, close } = await createCore({
  plugins,
  maxPluginCompileChainDepth: 3,
  config: {
    rateLimitDisabled: true,
  },
});

// Demo API routes (JSON endpoints for docs, HTMX compile, etc.)
registerDemoRoutes(app);

if (isProd && existsSync(distDir)) {
  // Serve built SPA assets
  app.use(express.static(distDir));

  // SPA fallback: serve index.html for all non-API GET requests
  app.get('/{*path}', async (req, res) => {
    // Skip API routes and plugin data routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/plugins/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
      res.set('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch {
      res.status(500).send('SPA index.html not found. Run: npm run build --workspace=demo');
    }
  });
} else {
  // Dev mode: serve demo/ static assets (CSS files, etc.)
  app.use(express.static(path.resolve(__dirname, '../demo')));
}

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Plugins loaded: ${plugins.map(p => p.name).join(', ') || 'none'}`);
  if (isProd) {
    console.log(`Serving SPA from ${distDir}`);
  } else {
    console.log(`Dev mode: run "npm run dev:ui" for Vite dev server on :5173`);
  }
});

const shutdown = async () => {
  await new Promise(resolve => server.close(resolve));
  await close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
