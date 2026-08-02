/**
 * Playwright E2E test configuration.
 *
 * To enable: install @playwright/test and run `pnpx playwright install chromium`
 *
 * Runs against the local dev servers (API on :3000, Web on :3001).
 * Start servers before running:
 *   pnpm dev          # in another terminal
 *   pnpm test:e2e     # run these tests
 */
// Uncomment when @playwright/test is installed:
// import { defineConfig, devices } from '@playwright/test';
// export default defineConfig({
//   testDir: './e2e',
//   fullyParallel: true,
//   forbidOnly: !!process.env.CI,
//   retries: process.env.CI ? 2 : 0,
//   workers: process.env.CI ? 1 : undefined,
//   reporter: 'html',
//   use: {
//     baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
//     trace: 'on-first-retry',
//     screenshot: 'only-on-failure',
//   },
//   projects: [
//     {
//       name: 'chromium',
//       use: { ...devices['Desktop Chrome'] },
//     },
//   ],
//   webServer: {
//     command: 'pnpm dev',
//     url: 'http://localhost:3001',
//     reuseExistingServer: !process.env.CI,
//     timeout: 120_000,
//   },
// });

export {};

