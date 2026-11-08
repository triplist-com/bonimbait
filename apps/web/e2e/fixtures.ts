/**
 * The suite's `test`: every page gets
 * - third-party embeds stubbed (Calendly, the YouTube player, analytics), so
 *   runs are deterministic and never leave the machine;
 * - a problem log: console errors, uncaught page errors and 5xx responses.
 *   Each test ends by asserting it is empty, unless the test allows a pattern
 *   with `allowProblems(/.../)`.
 */
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { storageStatePath, type Role } from './helpers/state';

const STUB_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

/** Third-party hosts the app may embed or open; answered locally with an empty page. */
const STUBBED = [
  /^https?:\/\/([a-z0-9-]+\.)*calendly\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*youtube(-nocookie)?\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*googletagmanager\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*google-analytics\.com\//,
  /^https?:\/\/([a-z0-9-]+\.)*facebook\.(com|net)\//,
  /^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//,
];

export type Problems = { list: string[]; allowed: RegExp[] };

/**
 * Noise every Next.js app logs when a test navigates while link prefetches are
 * in flight (the aborted prefetch "falls back to browser navigation"). A
 * prefetch that really fails on the server still shows as an HTTP 5xx.
 */
const ALWAYS_ALLOWED = [/Failed to fetch RSC payload for .* Falling back to browser navigation/];

export const test = base.extend<{ problems: Problems; allowProblems: (re: RegExp) => void }>({
  problems: [
    async ({ page }, use, testInfo) => {
      const problems: Problems = { list: [], allowed: [...ALWAYS_ALLOWED] };
      // Context-wide, so popups (the WhatsApp share) are stubbed too.
      await stubThirdParties(page.context());
      watch(page, problems);
      page.context().on('page', (p) => watch(p, problems));
      await use(problems);
      const real = problems.list.filter((p) => !problems.allowed.some((re) => re.test(p)));
      if (real.length) await testInfo.attach('problems.txt', { body: real.join('\n'), contentType: 'text/plain' });
      expect(real, `console errors, page errors or 5xx responses on ${testInfo.title}`).toEqual([]);
    },
    { auto: true },
  ],
  allowProblems: async ({ problems }, use) => {
    await use((re: RegExp) => problems.allowed.push(re));
  },
});

/** Stub third parties in another context too (e.g. a staff context a spec opens). */
export async function stubThirdParties(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => STUBBED.some((re) => re.test(url.toString())),
    (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: STUB_HTML }),
  );
}

/** Log a page's problems into the test's list (pages from other contexts). */
export function watch(page: Page, problems: Problems): void {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = m.location()?.url ?? '';
    problems.list.push(`console.error ${page.url()} :: ${m.text()}${where ? ` @ ${where}` : ''}`);
  });
  page.on('pageerror', (e) => problems.list.push(`pageerror ${page.url()} :: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.list.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

export { expect };

/**
 * A page signed in as one of global-setup's fixture roles, at the same
 * viewport as `like`, with third parties stubbed and its problems logged
 * into the test's list. Close its context when done.
 */
export async function pageAs(role: Role, like: Page, problems: Problems): Promise<Page> {
  const browser = like.context().browser();
  if (!browser) throw new Error('no browser');
  const viewport = like.viewportSize() ?? { width: 1440, height: 900 };
  const mobile = viewport.width < 600;
  const context = await browser.newContext({
    storageState: storageStatePath(role),
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3121}`,
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });
  await stubThirdParties(context);
  const page = await context.newPage();
  watch(page, problems);
  return page;
}

/** Whether the current project is the phone one. */
export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 600;
}

/** Tap on phones, click on desktop. */
export async function press(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  if (isMobile(page)) await locator.tap();
  else await locator.click();
}

/** Never-scrolls-sideways check at the current viewport (1 px tolerance). */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
}
