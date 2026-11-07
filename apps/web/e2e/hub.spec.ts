/**
 * P2 הבית שלי: onboarding in five answers (well under a minute) → "המפה
 * האישית שלכם מוכנה" → signup carries the map into the account → the
 * dashboard → save a video → shortlist a pro → upload a document → all three
 * show on /my-home/.
 */
import { randomBytes } from 'node:crypto';
import { expect, expectNoSideScroll, press, test } from './fixtures';
import { serviceDb } from './helpers/env';
import { SIGNUP_PREFIX } from './helpers/cleanup';
import { runState } from './helpers/state';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

test('onboarding → signup → dashboard → save a video → shortlist a pro → upload a document', async ({ page }, testInfo) => {
  const { proBusiness } = runState();
  const email = `${SIGNUP_PREFIX}${testInfo.project.name}-${Date.now().toString(36)}@bonimbait.test`;
  const password = randomBytes(12).toString('base64url');

  // Onboarding, anonymous: five answers, then the reveal.
  const started = Date.now();
  await page.goto('/my-home/start/');
  await expect(page.getByText(/שאלה\s*1\s*מתוך\s*5/)).toBeVisible();
  await press(page, page.getByRole('button', { name: /היתר בנייה ומכרז קבלנים/ }));
  await press(page, page.getByRole('button', { name: 'אזור השרון' }));
  await press(page, page.getByRole('button', { name: /200.{0,3}250/ }));
  await press(page, page.getByRole('button', { name: /2\.5.{0,3}3/ }));
  await press(page, page.getByRole('button', { name: /^בערך ב/ }));
  await expect(page.getByRole('heading', { name: 'המפה האישית שלכם מוכנה' })).toBeVisible();
  expect(Date.now() - started, 'onboarding should take well under a minute').toBeLessThan(60_000);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('bb.hub.draft') ?? 'null') as Record<string, unknown> | null);
  expect(draft).toMatchObject({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220 });
  await expectNoSideScroll(page);

  // Signup keeps the map.
  await press(page, page.getByRole('link', { name: /שמרו את המפה/ }));
  await page.waitForURL(/\/signup\//);
  await expect(page.getByText('המפה שלכם מוכנה ונשמור אותה בחשבון.')).toBeVisible();
  await page.getByLabel(/שם מלא/).fill('בדיקת מערכת בונים');
  await page.getByLabel(/אימייל/).fill(email);
  await page.getByLabel(/סיסמה/).fill(password);
  await press(page, page.getByRole('button', { name: /הרשמה/ }));
  await page.waitForURL((url) => url.pathname === '/my-home/', { timeout: 30_000 });

  // The dashboard, from the account (not the browser).
  await expect(page.getByRole('heading', { name: /מה עושים השבוע/ })).toBeVisible();
  await expect(page.getByText('תיק הפרויקט שלי').first()).toBeVisible();
  const db = serviceDb();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const userId = users.users.find((u) => u.email === email)?.id;
  expect(userId, 'the signup created the account').toBeTruthy();
  const { data: project } = await db.from('hub_projects').select('id, stage, size_m2, onboarded_at').eq('created_by', userId!).single();
  expect(project).toMatchObject({ stage: 'permit', size_m2: 220 });
  expect(project!.onboarded_at).not.toBeNull();

  // Save a video.
  await page.goto('/video/vluNH7GTkU4/');
  await press(page, page.getByRole('button', { name: 'שמירה', exact: true }));
  await expect(page.getByRole('button', { name: 'נשמר', exact: true })).toBeVisible();

  // Shortlist a pro.
  await page.goto(`/business/${proBusiness.slug}/`);
  await press(page, page.getByRole('button', { name: 'לרשימה הקצרה' }));
  await expect(page.getByRole('button', { name: 'ברשימה הקצרה' })).toBeVisible();

  // Upload a document to the private bucket.
  await page.goto('/my-home/');
  const docs = page.locator('#documents');
  await docs.locator('input[type="file"]').setInputFiles({ name: 'תוכנית-הגשה.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(docs.getByText('תוכנית-הגשה.pdf')).toBeVisible({ timeout: 20_000 });

  // All three are on /my-home/ after a reload.
  await page.reload();
  await expect(page.locator('#saved')).toContainText('פרק 109');
  await expect(page.locator('#pros')).toContainText(proBusiness.name);
  await expect(page.locator('#documents')).toContainText('תוכנית-הגשה.pdf');
  const { count } = await db.from('hub_documents').select('id', { count: 'exact', head: true }).eq('project_id', project!.id);
  expect(count).toBe(1);
  await expectNoSideScroll(page);
});
