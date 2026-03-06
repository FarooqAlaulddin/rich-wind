import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

const corePort = process.env.RW_CORE_PORT || 3001;
const coreOrigin = `http://localhost:${corePort}`;

/** Redirect /lexical-demo (no trailing slash) → /lexical-demo/ in preview mode */
function lexicalDemoRedirect() {
  return {
    name: 'lexical-demo-redirect',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/lexical-demo') {
          res.writeHead(301, { Location: '/lexical-demo/' });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), tailwindcss(), lexicalDemoRedirect()],
  root: '.',
  base: '/rich-wind/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  preview: {
    allowedHosts: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': coreOrigin,
      '/plugins': coreOrigin,
    },
  },
});
