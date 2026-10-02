import { defineConfig, devices } from '@playwright/test';

// Browser end-to-end tests for the Lexical demo. They run against the
// production bundle of the demo and a real Rich Wind core, on ports that
// differ from the dev defaults (3001 and 5174) so a developer's running
// dev servers never clash with them.
const CORE_PORT = 3101;
const DEMO_PORT = 4174;
const DEMO_BASE = '/rich-wind/lexical-demo/';
const OUT_DIR = 'dist-e2e';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${DEMO_PORT}`,
    trace: 'on-first-retry',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'node lexical-demo/scripts/dev-server.js',
      url: `http://localhost:${CORE_PORT}/health`,
      env: { RW_CORE_PORT: String(CORE_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The production .env points the bundle at the hosted core; override it
      // so the build talks to the local one through the preview proxy.
      command: `npm run build --workspace=lexical-demo -- --outDir ${OUT_DIR} && npm run preview --workspace=lexical-demo -- --port ${DEMO_PORT} --strictPort --outDir ${OUT_DIR}`,
      url: `http://localhost:${DEMO_PORT}${DEMO_BASE}`,
      env: { RW_CORE_PORT: String(CORE_PORT), VITE_RW_CORE_URL: '/rich-wind' },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
