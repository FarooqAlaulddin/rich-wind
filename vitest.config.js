import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'plugins/**/*.test.js'],
    testTimeout: 30000, // Tailwind compilation can be slow
    hookTimeout: 30000,
  },
});
