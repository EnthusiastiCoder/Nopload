// Minimal harness written with the failing tests; WS1 owns and may extend it.
// e2e runs against the local production build served with the real public/_headers.
// `@perf` tests (E2.7) are excluded unless PERF=1: `PERF=1 pnpm test:e2e -g @perf`.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  grep: process.env.PERF ? /@perf/ : undefined,
  grepInvert: process.env.PERF ? undefined : /@perf/,
  use: {
    baseURL: 'http://localhost:4321',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm serve',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
