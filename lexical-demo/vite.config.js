import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const corePort = process.env.RW_CORE_PORT || 3001;
const coreOrigin = `http://localhost:${corePort}`;
const normalizeBase = (value, fallback) => {
  const raw = value || fallback;
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};
const demoBase = normalizeBase(process.env.VITE_RW_DEMO_BASE, '/rich-wind/lexical-demo/');

export default defineConfig({
  plugins: [react()],
  base: demoBase,
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    allowedHosts: true,
    hmr: {
      path: demoBase,
    },
    proxy: {
      '/core/richwind-loader.js': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/core/, ''),
      },
      '/core/api': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/core/, ''),
      },
      '/core/plugins': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/core/, ''),
      },
      '/rich-wind/richwind-loader.js': {
        target: coreOrigin,
        rewrite: (path) => path.replace(/^\/rich-wind/, ''),
      },
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
