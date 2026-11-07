/**
 * Accessibility (WCAG 2.1 AA / IS 5568):
 * - axe-core on the key pages (the Lighthouse set), desktop and phone. Serious
 *   and critical violations fail; everything found is written to
 *   e2e/.results/a11y-<project>.json for docs/platform/QA_REPORT.md.
 * - Keyboard-only flows: the skip link and the ask box, the planner, the
 *   onboarding, and the booking sheet (its focus trap, Escape, focus return).
 * - prefers-reduced-motion turns animations off.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startAdvisorMock, type AdvisorMock } from './helpers/advisor-mock';
import { storageStatePath } from './helpers/state';

const PAGES: Array<{ name: string; path: string; member?: boolean }> = [
  { name: 'home', path: '/' },
  { name: 'ask', path: '/ask/' },
  { name: 'article', path: '/cost-build-private-house-2026/' },
  { name: 'video', path: '/video/vluNH7GTkU4/' },
  { name: 'business', path: '/business/pazgas/' },
  { name: 'calculator', path: '/calculator/' },
  { name: 'my-home', path: '/my-home/', member: true },
  { name: 'platform', path: '/platform/' },
];

type Violation = { id: string; impact: string | null; help: string; nodes: string[] };
const found: Record<string, Violation[]> = {};

test.describe('axe-core on the key pages', () => {
  test.afterAll(async ({}, testInfo) => {
    const dir = join(__dirname, '.results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `a11y-${testInfo.project.name}.json`), JSON.stringify(found, null, 2));
  });

  for (const p of PAGES) {
    test(`${p.name}: no serious or critical WCAG 2.1 AA violations`, async ({ page, browser }, testInfo) => {
      let target: Page = page;
      if (p.member) {
        const ctx = await browser.newContext({ storageState: storageStatePath('client'), viewport: page.viewportSize() ?? undefined, locale: 'he-IL' });
        target = await ctx.newPage();
      }
      try {
        await target.goto(p.path);
        await target.waitForLoadState('networkidle').catch(() => undefined);
        const result = await new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const violations: Violation[] = result.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help,
          nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
        }));
        found[p.name] = violations;
        await testInfo.attach(`axe-${p.name}.json`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' });
        const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(blocking, `${p.path}: ${blocking.map((v) => `${v.id} (${v.nodes.join(', ')})`).join('; ')}`).toEqual([]);
      } finally {
        if (target !== page) await target.context().close();
      }
    });
  }
});

/** Press Tab until `matches` holds for the focused element (at most `max` presses). */
async function tabTo(page: Page, matches: (el: { tag: string; text: string; label: string; name: string }) => boolean, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return {
        tag: a?.tagName.toLowerCase() ?? '',
        text: (a?.textContent ?? '').trim(),
        label: a?.getAttribute('aria-label') ?? '',
        name: (a as HTMLInputElement | null)?.name ?? '',
      };
    });
    if (matches(el)) return;
  }
  throw new Error('the element never received keyboard focus');
}

test.describe('keyboard only', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard flows run on desktop');

  let mock: AdvisorMock;
  test.beforeEach(async ({ page }) => {
    mock = await startAdvisorMock({ chunkDelayMs: 5 });
    await page.route('**/api/answer/stream', (route) => route.continue({ url: mock.url }));
  });
  test.afterEach(async () => {
    await mock?.close();
  });

  test('skip link, then the ask box, then an answer and a follow-up', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('דלגו לתוכן הראשי');
    await page.keyboard.press('Enter');
    await tabTo(page, (el) => el.tag === 'input' && el.name === 'q');
    await page.keyboard.type('כמה עולה שלד לבית של 200 מ״ר ב-2026?');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/ask\/\?q=/);
    await expect(page.locator('section[aria-label="התשובה"] [aria-busy="false"]').first()).toHaveCount(1, { timeout: 20_000 });
    await tabTo(page, (el) => el.tag === 'button' && el.text.includes('מה ההבדל בין מטר אדריכלי'), 120);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'מה ההבדל בין מטר אדריכלי למטר קבלני?' })).toBeVisible();
  });

  test('the planner, start to result', async ({ page }) => {
    await page.goto('/calculator/');
    await tabTo(page, (el) => el.tag === 'button' && el.text.includes('הבא'));
    await page.keyboard.press('Enter');
    for (const option of ['שתי קומות', 'אזור השרון', 'סטנדרטי-טוב']) {
      await tabTo(page, (el) => el.tag === 'input');
      // Arrow keys move within the radio group; Space picks the focused option.
      for (let i = 0; i < 20; i++) {
        const label = await page.evaluate(() => (document.activeElement?.closest('label')?.textContent ?? '').trim());
        if (label.includes(option)) break;
        await page.keyboard.press('ArrowLeft');
      }
      await page.keyboard.press('Space');
      await tabTo(page, (el) => el.tag === 'button' && el.text.includes('הבא'));
      await page.keyboard.press('Enter');
    }
    await tabTo(page, (el) => el.tag === 'button' && el.text.includes('הציגו את התקציב'));
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-planner-result]')).toBeVisible();
  });

  test('the onboarding, five answers by keyboard', async ({ page }) => {
    await page.goto('/my-home/start/');
    for (const pick of [/היתר בנייה ומכרז קבלנים/, /אזור השרון/, /200.{0,3}250/, /2\.5.{0,3}3/, /^בערך ב/]) {
      await tabTo(page, (el) => el.tag === 'button' && pick.test(el.text));
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('heading', { name: 'המפה האישית שלכם מוכנה' })).toBeFocused();
  });

  test('the booking sheet traps focus, closes on Escape and returns focus', async ({ page }) => {
    await page.goto('/membership-tiers/');
    await tabTo(page, (el) => el.tag === 'button' && el.text.includes('פגישת ייעוץ'), 200);
    const trigger = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      el.setAttribute('data-qa-trigger', '1');
      return el.textContent?.trim();
    });
    expect(trigger).toBeTruthy();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]'))), `Tab ${i + 1} left the sheet`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-qa-trigger="1"]')).toBeFocused();
  });
});

test('reduced motion turns animations off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animated = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('*'))
      .map((el) => getComputedStyle(el))
      .filter((s) => s.animationName !== 'none' && parseFloat(s.animationDuration) * (s.animationDuration.endsWith('ms') ? 1 : 1000) > 1).length,
  );
  expect(animated).toBe(0);
});
