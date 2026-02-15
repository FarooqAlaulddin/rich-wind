/**
 * Dev server that starts rich-wind with all discovered plugins loaded.
 * Usage: node scripts/dev-server.js
 *        npm run dev:demo
 */

import { createCore } from '../services/index.js';
import { loadPlugins } from '../plugins/loader.js';

const PORT = process.env.PORT || 3001;

const plugins = await loadPlugins();

const { app, close } = await createCore({
  plugins,
  maxPluginCompileChainDepth: 3
});

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Plugins loaded: ${plugins.map(p => p.name).join(', ') || 'none'}`);
});

const shutdown = async () => {
  await new Promise(resolve => server.close(resolve));
  await close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
