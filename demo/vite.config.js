import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

const corePort = process.env.RW_CORE_PORT || 3001;
const coreOrigin = `http://localhost:${corePort}`;

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': coreOrigin,
      '/plugins': coreOrigin,
    },
  },
});
