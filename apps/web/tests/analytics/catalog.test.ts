import { describe, expect, it } from 'vitest';
import {
  EVENT_CATALOG,
  EVENT_NAMES,
  isClientEvent,
  isEventName,
  redactFreeText,
  validateEvent,
} from '@/lib/analytics/events';
import {
  clampOccurredAt,
  cleanUtm,
  deviceFromUserAgent,
  isBot,
  sanitizePath,
  sanitizeReferrer,
} from '@/lib/analytics/sanitize';
import { track } from '@/lib/analytics/track';

const CHROME_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const UUID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d';

describe('event catalog', () => {
  it('covers every event the platform squads build on', () => {
    const required = [
      'page_view', 'search_submitted', 'answer_requested', 'answer_completed', 'answer_feedback',
      'followup_clicked', 'source_clicked', 'lead_cta_shown', 'lead_cta_clicked', 'lead_submitted',
      'phone_reveal', 'signup_started', 'signup_completed', 'hub_onboarding_completed', 'hub_item_saved',
      'budget_estimate_completed', 'consultation_clicked', 'pro_profile_view', 'pro_contact_clicked',
      'partner_offer_view', 'partner_offer_click', 'video_play',
      // Strategy measurement additions (orchestrator, Wave A).
      'partner_impression', 'partner_click', 'quote_request', 'shortlist_add',
      'consult_booking_started', 'consult_booked', 'planner_started', 'planner_completed',
    ];
    for (const name of required) expect(isEventName(name), name).toBe(true);
  });

  it('requires the quote request dimensions and impression ids', () => {
    expect(validateEvent('quote_request', { specialty: 'אלומיניום', stage: 'frame', region: 'sharon' }).ok).toBe(true);
    expect(validateEvent('quote_request', { specialty: 'אלומיניום' }).ok).toBe(false);
    expect(validateEvent('partner_impression', { slot: 'answer-sidebar', partner_id: 'p-42', visible_ms: 1200 }).ok).toBe(true);
    expect(validateEvent('partner_impression', { partner_id: 'p-42' }).ok).toBe(false);
    expect(isClientEvent('partner_impression')).toBe(true);
  });

  it('uses names the platform_events check constraint accepts', () => {
    for (const name of EVENT_NAMES) expect(name).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
  });

  it('documents every event', () => {
    for (const name of EVENT_NAMES) {
      expect(EVENT_CATALOG[name].description.length, name).toBeGreaterThan(10);
      expect(['client', 'server', 'both']).toContain(EVENT_CATALOG[name].emitter);
    }
  });

  it('keeps server facts out of the public endpoint', () => {
    for (const name of ['lead_submitted', 'phone_reveal', 'answer_requested', 'answer_completed', 'signup_completed'] as const) {
      expect(isClientEvent(name), name).toBe(false);
    }
    expect(isClientEvent('page_view')).toBe(true);
    expect(isClientEvent('hub_item_saved')).toBe(true); // 'both'
  });
});

describe('validateEvent', () => {
  it('accepts a valid event and normalizes strings', () => {
    const res = validateEvent('search_submitted', { query: '  כמה   עולה שלד?  ' });
    expect(res).toEqual({ ok: true, event: { name: 'search_submitted', props: { query: 'כמה עולה שלד?' } } });
  });

  it('truncates long strings instead of rejecting them', () => {
    const res = validateEvent('search_submitted', { query: 'א'.repeat(1000) });
    expect(res.ok && (res.event.props.query as string).length).toBe(300);
  });

  it('drops unknown props', () => {
    const res = validateEvent('consultation_clicked', { source: 'header', phone: '0501234567', extra: 1 });
    expect(res.ok && res.event.props).toEqual({ source: 'header' });
  });

  it('redacts emails and phone numbers typed into free text', () => {
    const res = validateEvent('search_submitted', { query: 'קבלן שלד, תחזרו אליי 050-123-4567 או dana@example.com' });
    expect(res.ok && res.event.props.query).toBe('קבלן שלד, תחזרו אליי [phone] או [email]');
    expect(redactFreeText('בית של 180 מ"ר ב-2.5 מיליון', 300)).toBe('בית של 180 מ"ר ב-2.5 מיליון');
  });

  it('rejects unknown names and wrong types', () => {
    expect(validateEvent('made_up_event', {})).toMatchObject({ ok: false, error: 'unknown_event' });
    expect(validateEvent(42, {})).toMatchObject({ ok: false, error: 'unknown_event' });
    expect(validateEvent('search_submitted', {})).toMatchObject({ ok: false, error: 'invalid_props' });
    expect(validateEvent('pro_contact_clicked', { business_id: UUID, channel: 'fax' })).toMatchObject({
      ok: false,
      error: 'invalid_props',
    });
    expect(validateEvent('pro_profile_view', { business_id: 'not-a-uuid' })).toMatchObject({ ok: false });
    expect(validateEvent('answer_completed', { query: 'x', sources: -1, confidence: 2, latency_ms: 1, model: 'm' })).toMatchObject({
      ok: false,
    });
  });

  it('treats missing props as {} (all-optional events)', () => {
    expect(validateEvent('signup_started', undefined)).toEqual({ ok: true, event: { name: 'signup_started', props: {} } });
  });

  it('validates lead types against the lead catalog', () => {
    expect(validateEvent('lead_submitted', { lead_type: 'consultation' }).ok).toBe(true);
    expect(validateEvent('lead_submitted', { lead_type: 'spam_bot' }).ok).toBe(false);
  });
});

describe('track() typing and server-side safety', () => {
  it('is a no-op outside the browser', () => {
    expect(() => track('page_view')).not.toThrow();
    expect(() => track('search_submitted', { query: 'x' })).not.toThrow();
  });

  it('is typed by the catalog (checked by tsc)', () => {
    track('signup_started');
    track('signup_started', { method: 'google' });
    // @ts-expect-error query is required
    track('search_submitted');
    // @ts-expect-error unknown event name
    track('not_an_event');
    // @ts-expect-error channel must be one of the catalog values
    track('pro_contact_clicked', { business_id: UUID, channel: 'fax' });
    expect(true).toBe(true);
  });
});

describe('request sanitizers', () => {
  it('detects bots, headless browsers and HTTP libraries', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.23.20.0',
      'curl/8.7.1',
      'python-requests/2.32.3',
      '',
      null,
    ]) {
      expect(isBot(ua), String(ua)).toBe(true);
    }
    expect(isBot(CHROME_DESKTOP)).toBe(false);
    expect(isBot(IPHONE)).toBe(false);
  });

  it('classifies devices', () => {
    expect(deviceFromUserAgent(CHROME_DESKTOP)).toBe('desktop');
    expect(deviceFromUserAgent(IPHONE)).toBe('mobile');
    expect(deviceFromUserAgent(ANDROID_TABLET)).toBe('tablet');
    expect(deviceFromUserAgent(CHROME_DESKTOP, '?1')).toBe('mobile');
    expect(deviceFromUserAgent('curl/8.7.1')).toBe('bot');
  });

  it('keeps the pathname only, decoded', () => {
    expect(sanitizePath('/search/?q=secret#x')).toBe('/search/');
    expect(sanitizePath('/business/%D7%A2%D7%95%D7%93%D7%93/')).toBe('/business/עודד/');
    expect(sanitizePath('https://bonimbait.com/blog/?utm_source=x')).toBe('/blog/');
    expect(sanitizePath('//evil.example/x')).toBeNull();
    expect(sanitizePath('javascript:alert(1)')).toBeNull();
    expect(sanitizePath('')).toBeNull();
  });

  it('strips referrer query strings and shortens internal ones', () => {
    const site = 'https://bonimbait.com';
    expect(sanitizeReferrer('https://www.google.com/search?q=private', site)).toBe('https://www.google.com/search');
    expect(sanitizeReferrer('https://bonimbait.com/blog/?page=2', site)).toBe('/blog/');
    expect(sanitizeReferrer('/videos/', site)).toBe('/videos/');
    expect(sanitizeReferrer('android-app://com.google.android.gm/', site)).toBeNull();
  });

  it('keeps only attribution params', () => {
    expect(cleanUtm({ utm_source: 'fb', utm_campaign: 'x', gclid: 'g', email: 'a@b.c', utm_medium: 3 })).toEqual({
      utm_source: 'fb',
      utm_campaign: 'x',
      gclid: 'g',
    });
    expect(cleanUtm('nope')).toEqual({});
  });

  it('trusts plausible client timestamps only', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(clampOccurredAt(now - 5000, now)).toBe('2026-10-14T11:59:55.000Z');
    expect(clampOccurredAt(now + 30_000, now)).toBe('2026-10-14T12:00:00.000Z'); // small skew -> now
    expect(clampOccurredAt(now - 3 * 86_400_000, now)).toBe('2026-10-14T12:00:00.000Z');
    expect(clampOccurredAt('yesterday', now)).toBe('2026-10-14T12:00:00.000Z');
  });
});
