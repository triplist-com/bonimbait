/**
 * P6 → P3, the money link: the budget planner's 5 questions → the result →
 * the booking sheet shows the project file → a (stubbed) Calendly booking →
 * the lead sits in the admin consult queue with its score, file and ref.
 */
import { expect, expectNoSideScroll, pageAs, press, test } from './fixtures';
import { serviceDb } from './helpers/env';
import { E2E_NAME, e2eEmail } from './helpers/state';

test('planner → result → booking with the project file → booked → consult queue', async ({ page, problems }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const name = `${E2E_NAME} ${testInfo.project.name}`;

  await page.goto('/calculator/');
  const question = page.locator('[data-planner-question]');
  await expect(question).toBeVisible();
  await expect(page.getByText(/שאלה\s*1\s*מתוך\s*5/)).toBeVisible();

  // 1. size: keep 200 m²; 2. floors; 3. region; 4. finish (a pick moves on by itself); 5. extras.
  await press(page, page.getByRole('button', { name: 'הבא' }));
  await press(page, page.locator('label').filter({ hasText: 'שתי קומות' }));
  await press(page, page.locator('label').filter({ hasText: 'אזור השרון' }));
  await press(page, page.locator('label').filter({ hasText: 'סטנדרטי-טוב' }));
  await press(page, page.locator('label').filter({ hasText: /^מרתף/ }));
  await press(page, page.getByRole('button', { name: 'הציגו את התקציב' }));

  const result = page.locator('[data-planner-result]');
  await expect(result).toBeVisible();
  await expect(result).toContainText('נכון ל-2026');
  await expect(result.getByRole('button', { name: /שתפו בוואטסאפ/ }).or(result.getByRole('link', { name: /שתפו בוואטסאפ/ })).first()).toBeVisible();
  const planner = await page.evaluate(() => JSON.parse(localStorage.getItem('bb.planner.last') ?? 'null') as { totalMin: number; totalMax: number } | null);
  expect(planner?.totalMin).toBeGreaterThan(0);
  expect(planner!.totalMax).toBeGreaterThan(planner!.totalMin);
  await expectNoSideScroll(page);

  // The booking sheet carries the file.
  await press(page, result.getByRole('button', { name: 'קבעו פגישת ייעוץ תקציב — ללא עלות' }).first());
  const sheet = page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('התיק שלכם');
  await sheet.locator('input[name="full_name"]').fill(name);
  await sheet.locator('input[name="phone"]').fill('0501234567');
  await sheet.locator('input[name="email"]').fill(e2eEmail(`booking-${tag}`));
  await press(page, sheet.locator('button[value="calendly"]'));

  await expect(sheet.locator('iframe[title*="Calendly"]')).toBeVisible();
  const ref = (await sheet.locator('.font-mono').first().textContent())?.trim() ?? '';
  expect(ref).toMatch(/^BB-\d{2}-\d{6}$/);
  const embed = new URL((await sheet.locator('iframe[title*="Calendly"]').getAttribute('src')) ?? '');
  expect(embed.searchParams.get('utm_content')).toBe(ref);
  expect(embed.searchParams.get('name')).toBe(name);

  // Calendly reports the booking (from its own origin).
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://calendly.com',
        data: {
          event: 'calendly.event_scheduled',
          payload: { event: { uri: 'https://api.calendly.com/scheduled_events/E2E' }, invitee: { uri: 'https://api.calendly.com/scheduled_events/E2E/invitees/1' } },
        },
      }),
    );
  });
  await expect(sheet.getByRole('status')).toContainText(ref);

  // The lead: booked, scored, with the planner estimate in its file.
  const db = serviceDb();
  await expect
    .poll(async () => (await db.from('leads').select('booked_at').eq('ref', ref).maybeSingle()).data?.booked_at ?? null, { timeout: 10_000 })
    .not.toBeNull();
  const { data: lead } = await db.from('leads').select('id, type, score, payload').eq('ref', ref).single();
  expect(lead!.type).toBe('consultation');
  expect(lead!.score).toBeGreaterThan(0);
  const file = (lead!.payload as { project_file?: { plannerEstimate?: { totalMin: number } } }).project_file;
  expect(file?.plannerEstimate?.totalMin).toBe(planner!.totalMin);

  // Staff see it in the consult queue: the ref, the score and the file.
  const staff = await pageAs('admin', page, problems);
  try {
    await staff.goto(`/admin/consult-queue/?tab=booked&lead=${lead!.id}`);
    await expect(staff.getByRole('heading', { name: 'תור הייעוצים' })).toBeVisible();
    await expect(staff.getByText(ref).first()).toBeVisible();
    await expect(staff.getByRole('img', { name: new RegExp(`^ציון ${lead!.score} מתוך 100`) }).first()).toBeVisible();
    await expect(staff.getByText(name).first()).toBeVisible();
  } finally {
    await staff.context().close();
  }
});
