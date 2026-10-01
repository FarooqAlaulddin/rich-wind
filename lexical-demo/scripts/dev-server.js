import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCore } from '../../services/index.js';
import { loadPlugins } from '../../plugins/loader.js';

const PORT = process.env.RW_CORE_PORT || process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const isProd = process.env.NODE_ENV === 'production';
const demoBase = `/${(process.env.RW_DEMO_BASE || '/rich-wind/lexical-demo')
  .replace(/^\/+|\/+$/g, '')}`;

const plugins = await loadPlugins();

// The Lexical demo expects promotion to kick in quickly for visible behavior.
for (let i = 0; i < plugins.length; i++) {
  if (plugins[i].name === 'auto-promote') {
    const { default: createAutoPromotePlugin } = await import('../../plugins/auto-promote/index.js');
    plugins[i] = createAutoPromotePlugin({ threshold: 2 });
    console.log('Auto-promote plugin overridden with threshold=2');
    break;
  }
}

const { handler, close } = await createCore({
  plugins,
  maxPluginCompileChainDepth: 3,
  config: {
    rateLimitDisabled: true,
  },
});

// Express hosts the static demo build; core is mounted as a plain handler.
const app = express();
if (isProd) {
  app.use(demoBase, express.static(distDir));
}
app.use(handler);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Plugins loaded: ${plugins.map(p => p.name).join(', ') || 'none'}`);
  if (isProd) {
    console.log(`Serving lexical demo from ${distDir}`);
  } else {
    console.log('Dev mode: run "npm run dev:lexical-ui" for Vite on :5174');
  }
});

const shutdown = async () => {
  await new Promise(resolve => server.close(resolve));
  await close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
