/**
 * P4 and the owner's tools: חדר הבקרה (its six tiles and the two lists),
 * insights, the content-autopilot queue, the leads inbox with a project file,
 * and the consult queue. Plus who may not get in.
 */
import { expect, expectNoSideScroll, test } from './fixtures';
import { serviceDb } from './helpers/env';
import { E2E_NAME, e2eEmail, storageStatePath } from './helpers/state';

const TILES = ['צבר פוטנציאלי', 'פגישות ייעוץ', 'תמהיל מסלולים', 'בריאות שותפים', 'שימוש ועלות AI'];

test.describe('staff', () => {
  test.use({ storageState: storageStatePath('admin') });

  test('חדר הבקרה: six tiles, hot leads and the unanswered questions', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'חדר הבקרה', level: 1 })).toBeVisible();
    for (const title of TILES) await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^(לידים חמים|לידים פתוחים אחרונים)$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'השאלות שעוד לא עניתם עליהן' })).toBeVisible();
    await expectNoSideScroll(page);

    await page.goto('/admin/?demo=1');
    for (const title of TILES) await expect(page.getByRole('heading', { name: title })).toBeVisible();
  });

  test('insights and the content autopilot queue', async ({ page }) => {
    await page.goto('/admin/insights/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/admin/autopilot/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /בדיקת הערוץ עכשיו/ })).toBeVisible();
  });

  test('the leads inbox shows refs, and a lead shows its project file', async ({ page }) => {
    const db = serviceDb();
    const { data: lead, error } = await db
      .from('leads')
      .insert({
        type: 'consultation',
        full_name: `${E2E_NAME} תיק`,
        email: e2eEmail('admin-file'),
        phone: '0501234567',
        payload: {
          project_file: {
            version: 1,
            stage: 'permit',
            regionSlug: 'sharon',
            sizeM2: 220,
            budgetRangeNis: [2_500_000, 3_000_000],
            questions: [{ q: 'כמה עולים חלונות אלומיניום לבית של 220 מ״ר?', at: new Date().toISOString() }],
          },
          project_score: { score: 74, band: 'hot', reasons: ['שלב היתר: קרוב להחלטות'] },
        },
      })
      .select('id, ref, score')
      .single();
    expect(error).toBeNull();
    expect(lead!.ref).toMatch(/^BB-\d{2}-\d{6}$/);

    await page.goto(`/admin/leads/?q=${encodeURIComponent(lead!.ref)}`);
    await expect(page.getByText(lead!.ref).first()).toBeVisible();

    await page.goto(`/admin/leads/${lead!.id}/`);
    await expect(page.getByText(lead!.ref).first()).toBeVisible();
    await expect(page.getByText('כמה עולים חלונות אלומיניום לבית של 220 מ״ר?').first()).toBeVisible();

    await page.goto(`/admin/consult-queue/?lead=${lead!.id}`);
    await expect(page.getByRole('heading', { name: 'תור הייעוצים' })).toBeVisible();
    await expect(page.getByRole('img', { name: /^ציון 74 מתוך 100/ }).first()).toBeVisible();
  });
});

test.describe('who may not get in', () => {
  test('a signed-out visitor is sent to log in', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page).toHaveURL(/\/login\//);
  });

  test.describe('a member', () => {
    test.use({ storageState: storageStatePath('client') });

    test('is kept out of the admin', async ({ page }) => {
      await page.goto('/admin/');
      expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(false);
    });
  });
});
