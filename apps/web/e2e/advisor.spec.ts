/**
 * P1, the demo's first beat: home → ask the headline question → the sources
 * show while the answer still streams → the exact video moment plays inline →
 * "שמרו בבית שלי" → "שתפו בוואטסאפ" (a real /ask/a/<id>/ snapshot) → a
 * follow-up chip asks in the same thread.
 *
 * The answer is the recorded demo answer, replayed ($0). E2E_LIVE_AI=1 adds
 * one real answer through the whole pipeline (desktop only, about $0.02).
 */
import { expect, expectNoSideScroll, press, test } from './fixtures';
import { recordedFirstMoment, recordedFollowups, recordedQuestion, startAdvisorMock, type AdvisorMock } from './helpers/advisor-mock';
import { serviceDb } from './helpers/env';

const LIVE = process.env.E2E_LIVE_AI === '1';

function clock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

test.describe('advisor: the headline question, end to end', () => {
  let mock: AdvisorMock;

  test.beforeEach(async ({ page }) => {
    mock = await startAdvisorMock();
    await page.route('**/api/answer/stream', (route) => route.continue({ url: mock.url }));
  });

  test.afterEach(async () => {
    await mock?.close();
  });

  test('home → ask → sources first → answer → moment → save → share → follow-up', async ({ page, context }) => {
    const question = recordedQuestion();
    await page.goto('/');
    const box = page.getByLabel('מה תרצו לשאול?');
    await box.fill(question);
    await box.press('Enter');
    await page.waitForURL((url) => url.pathname === '/ask/' && url.searchParams.get('q') === question);

    // The sources arrive first, while the answer is still streaming.
    const turn = page.locator('article').filter({ has: page.getByRole('heading', { name: question }) }).first();
    const sources = turn.getByRole('list', { name: 'המקורות של התשובה' });
    await expect(sources.getByRole('listitem').first()).toBeVisible();
    await expect(turn.locator('section[aria-label="התשובה"] [aria-busy="true"]')).toHaveCount(1);
    await expect(turn.getByText(/מצאנו \d+ רגעים/)).toBeVisible();

    // The answer finishes: real text, rendered markdown (no raw **), the date and the disclaimer.
    await expect(turn.locator('section[aria-label="התשובה"] [aria-busy="false"]')).toHaveCount(1, { timeout: 20_000 });
    const answer = turn.locator('section[aria-label="התשובה"]');
    await expect(answer).toContainText('800,000');
    expect(await answer.innerText()).not.toContain('**');
    await expect(answer).toContainText('לא תחליף לייעוץ מקצועי');
    await expect(sources.getByRole('listitem')).toHaveCount(6);

    // The exact moment plays inline, at its second.
    const moment = recordedFirstMoment();
    await press(page, turn.getByRole('button', { name: new RegExp(`מ-${clock(moment.second)}$`) }).first());
    const player = page.locator(`iframe[src*="${moment.youtubeId}"]`);
    await expect(player).toBeVisible();
    expect(await player.getAttribute('src')).toContain(`start=${moment.second}`);

    // Lead moments under a cost answer.
    await expect(turn.getByRole('heading', { name: 'תקציב ראשוני ב-3 דקות' })).toBeVisible();

    // "שמרו בבית שלי" (anonymous: kept in this browser).
    await press(page, turn.getByRole('button', { name: 'שמרו בבית שלי' }));
    await expect(turn.getByRole('button', { name: 'נשמר בבית שלי' })).toBeVisible();

    // "שתפו בוואטסאפ": a wa.me link with the snapshot URL, and the snapshot is stored for real.
    const shared = page.waitForResponse((r) => r.url().includes('/api/advisor/share') && r.request().method() === 'POST');
    const popupPromise = context.waitForEvent('page');
    await press(page, turn.getByRole('button', { name: 'שתפו בוואטסאפ' }));
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
    const wa = new URL(popup.url());
    expect(wa.hostname).toMatch(/wa\.me|whatsapp\.com/);
    const text = wa.searchParams.get('text') ?? '';
    const shareId = /\/ask\/a\/([A-Za-z0-9]{16})\//.exec(text)?.[1];
    expect(shareId, `share link in "${text}"`).toBeTruthy();
    expect((await shared).status()).toBeLessThan(300);
    await popup.close();

    const snapshot = await context.newPage();
    const res = await snapshot.goto(`/ask/a/${shareId}/`);
    expect(res?.status()).toBe(200);
    await expect(snapshot.getByRole('heading', { name: question })).toBeVisible();
    await snapshot.close();

    // A follow-up chip asks in the same thread.
    const followup = recordedFollowups()[0];
    await press(page, turn.getByRole('button', { name: followup }));
    const second = page.locator('article').filter({ has: page.getByRole('heading', { name: followup }) }).first();
    await expect(second.locator('section[aria-label="התשובה"] [aria-busy="false"]')).toHaveCount(1, { timeout: 20_000 });
    expect(mock.questions).toEqual([question, followup]);
    expect(new URL(page.url()).searchParams.get('q')).toBe(followup);

    // The project file's producer: the last questions are in bb.advisor.recent.
    const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('bb.advisor.recent') ?? '[]') as Array<{ q: string }>);
    expect(recent.map((r) => r.q)).toEqual(expect.arrayContaining([question, followup]));
    await expectNoSideScroll(page);
  });
});

test.describe('advisor: one real answer (E2E_LIVE_AI=1)', () => {
  test.skip(!LIVE, 'set E2E_LIVE_AI=1 for a real answer (about $0.02)');

  test('the live pipeline answers, records its cost, and plays a moment', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one real answer per run');
    const question = recordedQuestion();
    const before = await todaysAdvisorCalls();
    const started = Date.now();
    await page.goto(`/ask/?q=${encodeURIComponent(question)}`);
    const turn = page.locator('article').first();
    await expect(turn.getByRole('list', { name: 'המקורות של התשובה' }).getByRole('listitem').first()).toBeVisible({ timeout: 10_000 });
    const sourcesMs = Date.now() - started;
    await expect(turn.locator('section[aria-label="התשובה"] [aria-busy="false"]')).toHaveCount(1, { timeout: 60_000 });
    await expect(turn.locator('section[aria-label="התשובה"]')).toContainText(/₪|ש"ח|שקל/);
    await expect(turn.getByRole('button', { name: /מ-\d+:\d\d$/ }).first()).toBeVisible();
    const followups = await turn.getByRole('navigation').getByRole('button').count();
    expect(followups).toBeGreaterThanOrEqual(1);
    expect(followups).toBeLessThanOrEqual(3);
    testInfo.annotations.push({ type: 'sources_ms', description: String(sourcesMs) });
    // The guard recorded the call (ai_usage, today, UTC).
    await expect.poll(todaysAdvisorCalls, { timeout: 10_000 }).toBeGreaterThan(before);
  });
});

async function todaysAdvisorCalls(): Promise<number> {
  const { data } = await serviceDb().from('ai_usage').select('calls, route').eq('day', new Date().toISOString().slice(0, 10));
  return (data ?? []).reduce((n, r) => n + (Number((r as { calls: number }).calls) || 0), 0);
}
