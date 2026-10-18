import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_WINDOW_MS, attributionLabelHe, isAcquisitionView, pickLastTouch, type TouchRow } from '@/lib/analytics/attribution';

const LEAD_AT = '2026-10-14T12:00:00.000Z';
const ago = (minutes: number) => new Date(Date.parse(LEAD_AT) - minutes * 60_000).toISOString();

function touch(name: string, minutesAgo: number, extra: Partial<TouchRow> = {}): TouchRow {
  return { name, occurred_at: ago(minutesAgo), path: '/search/', referrer: null, utm: {}, props: {}, ...extra };
}

const partnerClick = (m: number) => touch('partner_click', m, { path: '/search/', props: { partner_id: 'partner-42', offer_id: 'spring', slot: 'answer-sidebar' } });
const sourceClick = (m: number) => touch('source_clicked', m, { props: { kind: 'video', id: 'dQw4w9WgXcQ' } });
const internalView = (m: number) => touch('page_view', m, { path: '/business/עודד/', referrer: '/search/' });
const googleLanding = (m: number) => touch('page_view', m, { path: '/', referrer: 'https://www.google.com/search' });
const campaignLanding = (m: number) =>
  touch('page_view', m, { path: '/membership-tiers/', utm: { utm_source: 'facebook', utm_campaign: 'budget-oct' } });

describe('pickLastTouch (4-hour last touch)', () => {
  it('returns the most recent touch inside the window', () => {
    const res = pickLastTouch([campaignLanding(200), sourceClick(90), partnerClick(30), internalView(5)], LEAD_AT);
    expect(res).toEqual({
      model: 'last_touch_4h',
      touch: 'partner_click',
      at: ago(30),
      minutes_before: 30,
      medium: 'partner',
      source: 'partner-42',
      campaign: 'spring',
      path: '/search/',
    });
  });

  it('ignores internal page views: they are not what brought the visitor', () => {
    expect(pickLastTouch([internalView(10), internalView(3)], LEAD_AT)).toBeNull();
    expect(pickLastTouch([googleLanding(120), internalView(3)], LEAD_AT)).toMatchObject({
      touch: 'page_view',
      medium: 'referral',
      source: 'google.com',
      minutes_before: 120,
    });
  });

  it('credits campaign landings by utm_source / utm_campaign', () => {
    expect(pickLastTouch([campaignLanding(45)], LEAD_AT)).toMatchObject({
      medium: 'campaign',
      source: 'facebook',
      campaign: 'budget-oct',
      path: '/membership-tiers/',
    });
  });

  it('credits the AI answer source that was clicked', () => {
    expect(pickLastTouch([sourceClick(15)], LEAD_AT)).toMatchObject({ medium: 'ai_source', source: 'video:dQw4w9WgXcQ' });
  });

  it('a newer landing beats an older partner click (newest wins)', () => {
    expect(pickLastTouch([partnerClick(100), campaignLanding(20)], LEAD_AT)).toMatchObject({ touch: 'page_view', medium: 'campaign' });
  });

  it('honours the 4-hour window, inclusive', () => {
    expect(ATTRIBUTION_WINDOW_MS).toBe(4 * 60 * 60 * 1000);
    expect(pickLastTouch([partnerClick(240)], LEAD_AT)).toMatchObject({ minutes_before: 240 });
    expect(pickLastTouch([partnerClick(241)], LEAD_AT)).toBeNull();
  });

  it('ignores touches after the lead and unrelated events', () => {
    expect(pickLastTouch([partnerClick(-5), touch('search_submitted', 2, { props: { query: 'x' } })], LEAD_AT)).toBeNull();
  });

  it('breaks timestamp ties by touch strength', () => {
    expect(pickLastTouch([googleLanding(10), sourceClick(10), partnerClick(10)], LEAD_AT)?.touch).toBe('partner_click');
    expect(pickLastTouch([googleLanding(10), sourceClick(10)], LEAD_AT)?.touch).toBe('source_clicked');
  });

  it('accepts Date, ISO and epoch lead times; rejects garbage', () => {
    const rows = [partnerClick(30)];
    expect(pickLastTouch(rows, new Date(LEAD_AT))?.touch).toBe('partner_click');
    expect(pickLastTouch(rows, Date.parse(LEAD_AT))?.touch).toBe('partner_click');
    expect(pickLastTouch(rows, 'not a date')).toBeNull();
    expect(pickLastTouch([], LEAD_AT)).toBeNull();
  });

  it('tolerates malformed rows', () => {
    const odd = [
      { name: 'partner_click', occurred_at: 'nope', path: null, referrer: null, utm: null, props: null },
      { name: 'page_view', occurred_at: ago(5), path: null, referrer: 'android-app://x', utm: 'oops', props: [] },
      { name: 'partner_click', occurred_at: ago(50), path: null, referrer: null, utm: null, props: null },
    ] as TouchRow[];
    expect(pickLastTouch(odd, LEAD_AT)).toMatchObject({ touch: 'partner_click', minutes_before: 50, source: null });
  });
});

describe('helpers', () => {
  it('recognises acquisition page views', () => {
    expect(isAcquisitionView({ utm: { utm_source: 'newsletter' }, referrer: null })).toBe(true);
    expect(isAcquisitionView({ utm: {}, referrer: 'https://www.facebook.com/' })).toBe(true);
    expect(isAcquisitionView({ utm: {}, referrer: '/blog/' })).toBe(false);
    expect(isAcquisitionView({ utm: { gclid: 'x' }, referrer: null })).toBe(false);
  });

  it('labels attributions in Hebrew for the admin', () => {
    expect(attributionLabelHe(pickLastTouch([campaignLanding(12)], LEAD_AT))).toBe('קמפיין: facebook (budget-oct) · 12 דק׳ לפני הפנייה');
    expect(attributionLabelHe(pickLastTouch([partnerClick(3)], LEAD_AT))).toBe('לחיצה על שותף: partner-42 (spring) · 3 דק׳ לפני הפנייה');
    expect(attributionLabelHe(null)).toBe('ישיר / לא ידוע');
    expect(attributionLabelHe({ medium: 'nonsense' })).toBe('ישיר / לא ידוע');
    // Integration (revenue -> admin): a partner is shown by name; raw ids (business, offer) never.
    const biz = '11111111-2222-4333-8444-555555555501';
    const viaOffer = { medium: 'partner', source: biz, campaign: '11111111-2222-4333-8444-555555555503', minutes_before: 0 };
    expect(attributionLabelHe(viaOffer, (id) => (id === biz ? 'שלד השרון' : null))).toBe('לחיצה על שותף: שלד השרון · 0 דק׳ לפני הפנייה');
    expect(attributionLabelHe(viaOffer)).toBe('לחיצה על שותף · 0 דק׳ לפני הפנייה');
  });
});
