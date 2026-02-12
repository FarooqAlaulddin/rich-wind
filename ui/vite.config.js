import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [reactRouter(), tailwindcss()],
  optimizeDeps: {
    include: ["@monaco-editor/react", "monaco-editor"],
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
      }
    }
  },
});
