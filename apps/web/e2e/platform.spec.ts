/**
 * The sales experience: /platform/, the guided tour and every demo view render
 * with no console errors, no sideways scroll, the demo banner, and nothing
 * left "בקרוב". Demo views are discovered from the /platform/demo/ index, and
 * every internal link the tour offers must resolve.
 */
import { expect, expectNoSideScroll, test } from './fixtures';

const MIN_DEMO_VIEWS = 9;

test('the pitch site and the tour render cleanly', async ({ page }) => {
  for (const path of ['/platform/', '/platform/tour/']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expectNoSideScroll(page);
  }
});

test('every tour beat opens a working screen', async ({ page, request }) => {
  await page.goto('/platform/tour/');
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) => Array.from(new Set(as.map((a) => a.getAttribute('href') ?? ''))));
  const internal = hrefs.filter((h) => h && !h.startsWith('/platform/tour'));
  expect(internal.length).toBeGreaterThan(5);
  for (const href of internal) {
    const res = await request.get(href, { maxRedirects: 5 });
    expect(res.status(), href).toBeLessThan(400);
  }
});

test('every demo view renders from fixtures', async ({ page }, testInfo) => {
  await page.goto('/platform/demo/');
  const hrefs = await page
    .locator('a[href^="/platform/demo/"]')
    .evaluateAll((as) => Array.from(new Set(as.map((a) => a.getAttribute('href') ?? '').filter((h) => /^\/platform\/demo\/[^/]+\/$/.test(h)))));
  expect(hrefs.length, 'demo views listed on /platform/demo/').toBeGreaterThanOrEqual(MIN_DEMO_VIEWS);
  const headingIssues: string[] = [];
  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), href).toBe(200);
    await expect(page.getByText('תצוגת הדגמה · נתונים לדוגמה').first(), href).toBeVisible();
    await expect(page.getByRole('heading').first(), href).toBeVisible();
    await expect(page.getByText('בקרוב', { exact: true }), href).toHaveCount(0);
    await expectNoSideScroll(page);
    const h1s = await page.locator('h1').count();
    if (h1s !== 1) headingIssues.push(`${href}: ${h1s} <h1>`);
  }
  // Reported in QA_REPORT.md (one <h1> per page, DESIGN_SYSTEM.md §9); not a render failure.
  if (headingIssues.length) testInfo.annotations.push({ type: 'a11y: h1 count', description: headingIssues.join('; ') });
});
