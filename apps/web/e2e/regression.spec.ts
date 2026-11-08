/**
 * Parity regressions: the pages and flows bonimbayit.co.il already had must
 * keep working on the platform build: an article, a legacy video page, a
 * YouTube-id video page, a business page with the lead-gated phone, the
 * benefits cart and (mock) checkout, and signup/login/logout.
 */
import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, expectNoSideScroll, press, test } from './fixtures';
import { serviceDb } from './helpers/env';
import { SIGNUP_PREFIX } from './helpers/cleanup';
import { E2E_NAME, e2eEmail, storageStatePath } from './helpers/state';

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const t = (node as Record<string, unknown>)['@type'];
      if (typeof t === 'string') types.push(t);
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  for (const b of blocks) walk(JSON.parse(b));
  return types;
}

test('an article renders with its structured data', async ({ page }) => {
  const res = await page.goto('/cost-build-private-house-2026/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('article, main').first()).toContainText('2026');
  expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(['BreadcrumbList']));
  await expectNoSideScroll(page);
});

test('a legacy video page renders', async ({ page }) => {
  const res = await page.goto('/video/פודקאסט-פרק-107-מדברים-על-עלויות-בניה-לשנ/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expectNoSideScroll(page);
});

test('a YouTube-id video page renders with its key moments', async ({ page }) => {
  const res = await page.goto('/video/vluNH7GTkU4/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(['VideoObject']));
  await expectNoSideScroll(page);
});

/** Open the gated phone popup on a business page and send the lead form. */
async function revealPhone(page: Page, slug: string, tag: string) {
  await page.goto(`/business/${slug}/`);
  await expect(page.locator('h1')).toHaveCount(1);
  // The business's number is never in the page before the form (the header's own office phone is).
  await expect(page.locator('main a[href^="tel:"]')).toHaveCount(0);
  await press(page, page.getByRole('button', { name: 'הצגת הטלפון' }).first());
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="full_name"]').fill(`${E2E_NAME} טלפון`);
  await dialog.locator('input[name="email"]').fill(e2eEmail(`phone-${tag}`));
  await dialog.locator('input[name="phone"]').fill('0501234567');
  await dialog.locator('input[name="terms"]').check();
  await press(page, dialog.getByRole('button', { name: 'הצג מספר טלפון' }));
  return dialog;
}

test('a direct business reveals its phone only after the lead form', async ({ page }, testInfo) => {
  const dialog = await revealPhone(page, 'gsb-סיסטים-icf-שלד', `direct-${testInfo.project.name}`);
  await expect(dialog.locator('a[href^="tel:"]').first()).toBeVisible({ timeout: 15_000 });
});

test('an office-routed business connects the builder instead (lead_routing "site")', async ({ page }, testInfo) => {
  const dialog = await revealPhone(page, 'pazgas', `site-${testInfo.project.name}`);
  await expect(dialog.getByText(/הפרטים שלכם הועברו/)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator('a[href^="tel:"]')).toHaveCount(0);
});

test.describe('a signed-in member', () => {
  test.use({ storageState: storageStatePath('client') });

  test('the benefits cart and the mock checkout', async ({ page }, testInfo) => {
    await cartAndCheckout(page, testInfo.project.name);
  });
});

async function cartAndCheckout(page: Page, project: string): Promise<void> {
  await page.goto('/product-category/כללי/');
  await press(page, page.getByRole('button', { name: 'הוסף לסל הקניות' }).first());
  await page.waitForURL(/\/cart\//);
  await press(page, page.getByRole('link', { name: /המשך לתשלום/ }).or(page.getByRole('button', { name: /המשך לתשלום/ })).first());
  await page.waitForURL(/\/checkout\//);
  await page.getByLabel(/שם מלא/).fill(`${E2E_NAME} קנייה`);
  await page.getByLabel(/אימייל/).fill(e2eEmail(`order-${project}`));
  await page.getByLabel(/טלפון/).fill('0501234567');
  await page.locator('input[name="terms"]').check();
  await press(page, page.getByRole('button', { name: /לתשלום מאובטח/ }));
  // The URL, not the load event (the thank-you page keeps loading media).
  await expect(page).toHaveURL(/\/thank-you-order\/\?order=/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /תודה על רכישת/ })).toBeVisible();
  const order = new URL(page.url()).searchParams.get('order');
  expect(order).toBeTruthy();
  const { data } = await serviceDb().from('orders').select('status').eq('id', order!).single();
  expect(data?.status).toBe('paid');
}

test('signup, logout and login', async ({ page, allowProblems }, testInfo) => {
  // The deliberate wrong password below: Supabase answers 400 and the browser logs it.
  allowProblems(/status of 400 .*auth\/v1\/token\?grant_type=password/);
  const email = `${SIGNUP_PREFIX}auth-${testInfo.project.name}-${Date.now().toString(36)}@bonimbait.test`;
  const password = randomBytes(12).toString('base64url');

  await page.goto('/signup/');
  await page.getByLabel(/באיזה שלב אתם/).selectOption({ index: 1 });
  await page.getByLabel(/^אזור/).selectOption('sharon');
  await page.getByLabel(/שם מלא/).fill('בדיקת מערכת הרשמה');
  await page.getByLabel(/אימייל/).fill(email);
  await page.getByLabel(/סיסמה/).fill(password);
  await press(page, page.getByRole('button', { name: /^הרשמה/ }));
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 30_000 });

  // Wrong password: a Hebrew error, no session.
  await page.context().clearCookies();
  await page.goto('/login/');
  await page.getByLabel('אימייל').fill(email);
  await page.getByLabel('סיסמה').fill(`${password}x`);
  await press(page, page.getByRole('button', { name: 'התחברות' }));
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login/');

  // The right one: into the account.
  await page.getByLabel('סיסמה').fill(password);
  await press(page, page.getByRole('button', { name: 'התחברות' }));
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))).toBe(true);
});
