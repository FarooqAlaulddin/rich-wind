import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [reactRouter(), tailwindcss()],
  optimizeDeps: {
    include: ["@monaco-editor/react", "monaco-editor"],
  },
  build: {
    target: "es2018",
    sourcemap: false,
    minify: "esbuild",
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
  ssr: {
    noExternal: ["@monaco-editor/react", "monaco-editor"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/plugins': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // Only proxy sub-paths (e.g. /plugins/analytics/data).
        // Root plugin paths (e.g. /plugins/analytics) fall through to React Router.
        bypass(req) {
          const after = req.url.slice('/plugins/'.length);
          const segments = after.split('/').filter(Boolean);
          if (segments.length <= 1) return req.url;
        }
      }
    }
  },
});
