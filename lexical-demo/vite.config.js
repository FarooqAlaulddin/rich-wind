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
    proxy: {
      '/api': coreOrigin,
      '/plugins': coreOrigin,
    },
  },
});
