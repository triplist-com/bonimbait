/**
 * End-to-end suite (opt-in: it needs a production build and the LOCAL
 * Supabase stack).
 *
 *   cd apps/web
 *   npm run build
 *   npm run e2e                  # starts `next start -p 3121` if nothing answers there
 *   E2E_LIVE_AI=1 npm run e2e    # also one real advisor answer (about $0.02)
 *
 * Every spec runs twice: desktop (1440x900) and phone (390x844, touch).
 * Advisor answers are replayed from the recorded demo answer ($0) unless
 * E2E_LIVE_AI=1. See docs/platform/QA_REPORT.md for the full run book.
 */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3121);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// A real browser's UA: /api/track drops headless browsers, and the funnel
// checks need the events stored.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  outputDir: './.results/artifacts',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  // One worker: the journeys share the local stack and one IP's rate limits.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: './.results/report.json' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: PHONE_UA,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        cwd: '..',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        // The suite submits leads, bookings and shares from one IP: lift the
        // per-IP limits for this server only (never in deployed envs).
        env: {
          LEAD_RATE_LIMIT_MAX: '1000',
          RATE_LIMIT_FORM: '1000/600',
          RATE_LIMIT_AI_ANSWER: '200/600',
        },
      },
});
