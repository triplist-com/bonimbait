/**
 * P3 for business owners: a seeded pro's portal (stats, then a tier upgrade
 * through the mock checkout), and a partner's monthly report (דוח שותף).
 * The mock provider is used locally; on production it is refused and the
 * tiers offer a conversation instead (see tests/qa/tier-upsell.test.tsx and
 * the "production payments" section of docs/platform/QA_REPORT.md).
 */
import { expect, expectNoSideScroll, press, test } from './fixtures';
import { serviceDb } from './helpers/env';
import { runState, storageStatePath } from './helpers/state';

test.describe('pro portal', () => {
  test.use({ storageState: storageStatePath('pro') });

  test('stats, then an upgrade to שותפים through the mock checkout', async ({ page }) => {
    const { proBusiness } = runState();
    const db = serviceDb();
    await db.from('partner_subscriptions').delete().eq('business_id', proBusiness.id);

    await page.goto(`/partner-portal/?b=${proBusiness.id}`);
    await expect(page.getByRole('heading', { name: proBusiness.name }).first()).toBeVisible();
    const kpis = page.getByRole('region', { name: 'מדדים מרכזיים' });
    for (const label of ['צפיות בפרופיל', 'חשיפות של הטלפון', 'פניות', 'בונים ששאלו על התחום']) await expect(kpis).toContainText(label);
    await expect(page.getByRole('heading', { name: 'מסלולי השותפות של בונים בית' })).toBeVisible();
    await expectNoSideScroll(page);

    await press(page, page.getByRole('button', { name: 'מעבר למסלול שותפים' }));
    await page.waitForURL((url) => url.pathname === '/partner-portal/' && url.searchParams.get('upgraded') === '1', { timeout: 30_000 });
    await expect(page.getByRole('status').filter({ hasText: 'המסלול הופעל' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'אתם במסלול שותפים' })).toBeVisible();

    const { data: sub } = await db.from('partner_subscriptions').select('status, provider').eq('business_id', proBusiness.id).eq('status', 'active').single();
    expect(sub).toMatchObject({ status: 'active', provider: 'mock' });
  });
});

test.describe('partner report', () => {
  test.use({ storageState: storageStatePath('partner') });

  test('the partner opens this month\'s דוח שותף', async ({ page }) => {
    const { partnerBusiness } = runState();
    await page.goto(`/partner-portal/report/?b=${partnerBusiness.id}`);
    await expect(page.getByText(partnerBusiness.name).first()).toBeVisible();
    await expect(page.getByText('דוח שותף').first()).toBeVisible();
    await expectNoSideScroll(page);
  });

  test('asking for another business\'s report shows the partner\'s own', async ({ page }) => {
    const { proBusiness, partnerBusiness } = runState();
    const res = await page.goto(`/partner-portal/report/?b=${proBusiness.id}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText(partnerBusiness.name).first()).toBeVisible();
    await expect(page.getByText(proBusiness.name)).toHaveCount(0);
  });
});
