import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const corePort = process.env.RW_CORE_PORT || 3001;
const coreOrigin = `http://localhost:${corePort}`;

export default defineConfig({
  plugins: [react()],
  base: '/rich-wind/lexical-demo/',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    allowedHosts: true,
    hmr: {
      path: '/rich-wind/lexical-demo/',
    },
    proxy: {
      '/rich-wind/api': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/rich-wind/, ''),
      },
      '/rich-wind/plugins': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/rich-wind/, ''),
      },
      '/api': coreOrigin,
      '/plugins': coreOrigin,
    },
  },
});
