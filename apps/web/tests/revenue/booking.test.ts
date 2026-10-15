import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb, type FakeDb } from './fake-db';

const LEAD_ID = '00000000-0000-4000-8000-00000000c0de';

const state: { db: FakeDb | null; submit: ReturnType<typeof vi.fn> } = { db: null, submit: vi.fn() };

vi.mock('next/headers', () => ({ headers: () => new Headers({ referer: 'http://localhost:3113/%D7%91%D7%9C%D7%95%D7%92/' }) }));
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null }));
vi.mock('@/lib/guard/rateLimit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/leads/submit', () => ({ submitLead: (...args: unknown[]) => state.submit(...args) }));
vi.mock('@/lib/revenue/db', () => ({
  isServiceRoleConfigured: () => true,
  revenueAdminDb: () => state.db,
}));

const { bookingToken, verifyBookingToken } = await import('@/lib/revenue/booking-token');
const { calendlyBookingUrl, calendlyScheduledDetails } = await import('@/lib/revenue/calendly');
const { markConsultBooked, startConsultBooking } = await import('@/lib/revenue/actions/booking');

describe('Calendly URL and messages', () => {
  const base = 'https://calendly.com/tzuri-galili-bonimbayit/demo45min';

  it('prefills name and email and passes the lead ref in utm_content', () => {
    const url = new URL(calendlyBookingUrl(base, 'post-footer', { name: ' דנה לוי ', email: 'dana@example.com', leadRef: 'BB-26-000123' })!);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      hide_event_type_details: '1',
      hide_gdpr_banner: '1',
      primary_color: 'e61559',
      utm_source: 'post-footer',
      utm_medium: 'website',
      utm_campaign: 'management',
      utm_content: 'BB-26-000123',
      name: 'דנה לוי',
      email: 'dana@example.com',
    });
  });

  it('drops a malformed ref or email and refuses non-https bases', () => {
    const url = new URL(calendlyBookingUrl(base, 'site', { leadRef: 'x"><script>', email: 'nope' })!);
    expect(url.searchParams.has('utm_content')).toBe(false);
    expect(url.searchParams.has('email')).toBe(false);
    expect(calendlyBookingUrl('http://calendly.com/x', 'site')).toBeNull();
    expect(calendlyBookingUrl('', 'site')).toBeNull();
    expect(calendlyBookingUrl('not a url', 'site')).toBeNull();
  });

  it('reads the scheduled event and invitee from Calendly only', () => {
    expect(
      calendlyScheduledDetails({
        event: 'calendly.event_scheduled',
        payload: {
          event: { uri: 'https://api.calendly.com/scheduled_events/ABC123' },
          invitee: { uri: 'https://api.calendly.com/scheduled_events/ABC123/invitees/XYZ' },
        },
      }),
    ).toEqual({ event: 'https://api.calendly.com/scheduled_events/ABC123', invitee: 'https://api.calendly.com/scheduled_events/ABC123/invitees/XYZ' });
    expect(calendlyScheduledDetails({ payload: { event: { uri: 'https://evil.example/x' } } })).toEqual({ event: undefined, invitee: undefined });
    expect(calendlyScheduledDetails(null)).toEqual({});
  });
});

describe('booking tokens', () => {
  it('verifies only the lead it was issued for', () => {
    const token = bookingToken(LEAD_ID, 'k');
    expect(token).toHaveLength(32);
    expect(verifyBookingToken(LEAD_ID, token, 'k')).toBe(true);
    expect(verifyBookingToken('00000000-0000-4000-8000-000000000bad', token, 'k')).toBe(false);
    expect(verifyBookingToken(LEAD_ID, token, 'other-secret')).toBe(false);
    expect(verifyBookingToken(LEAD_ID, token.slice(1), 'k')).toBe(false);
    expect(verifyBookingToken(LEAD_ID, null, 'k')).toBe(false);
  });
});

describe('startConsultBooking', () => {
  beforeEach(() => state.submit.mockReset());

  it('creates the consultation lead with the file before Calendly, mapping the stage', async () => {
    state.submit.mockResolvedValue({
      ok: true,
      lead: { id: LEAD_ID, ref: 'BB-26-000777', payload: { project_score: { score: 82 } } },
      notification: null,
    });
    const res = await startConsultBooking({
      fullName: 'דנה',
      phone: '050-1234567',
      email: 'dana@example.com',
      stage: 'permit',
      region: 'sharon',
      projectFile: { sizeM2: 220, questions: [{ q: 'כמה עולים חלונות?', at: '2026-10-10T08:00:00.000Z' }] },
      source: 'post-footer',
      mode: 'calendly',
    });
    expect(res).toEqual({ status: 'created', ref: 'BB-26-000777', token: bookingToken(LEAD_ID), score: 82 });
    const input = state.submit.mock.calls[0][0];
    expect(input).toMatchObject({
      type: 'consultation',
      payload: { full_name: 'דנה', phone: '050-1234567', email: 'dana@example.com', region: 'sharon', construction_stage: 'tender' },
      context: { cta_source: 'post-footer', booking_mode: 'calendly' },
      sourceUrl: '/בלוג/',
    });
    expect(input.projectFile).toMatchObject({ version: 1, stage: 'permit', sizeM2: 220 });
  });

  it('keeps the visitor moving when leads are unavailable, and reports field errors', async () => {
    state.submit.mockResolvedValue({ ok: false, error: 'unavailable', message: 'לא ניתן לשלוח' });
    expect(await startConsultBooking({ fullName: 'x', phone: '0501234567', source: 'site', mode: 'calendly' })).toEqual({
      status: 'unavailable',
      message: 'לא ניתן לשלוח',
    });
    state.submit.mockResolvedValue({ ok: false, error: 'validation', message: 'נא לתקן', fieldErrors: { phone: 'טלפון' } });
    expect(await startConsultBooking({ fullName: 'x', phone: '1', source: 'site', mode: 'callback' })).toEqual({
      status: 'error',
      message: 'נא לתקן',
      fieldErrors: { phone: 'טלפון' },
    });
    // The 'infrastructure' stage has no profile stage: only the file keeps it.
    state.submit.mockResolvedValue({ ok: true, lead: null, notification: null });
    expect((await startConsultBooking({ fullName: 'x', phone: '0501234567', stage: 'infrastructure', source: 'site', mode: 'calendly' })).status).toBe('unavailable');
    const input = state.submit.mock.calls.at(-1)![0];
    expect(input.payload.construction_stage).toBeUndefined();
    expect(input.projectFile.stage).toBe('infrastructure');
  });
});

describe('markConsultBooked', () => {
  const leadRow = (over: Record<string, unknown> = {}) => ({
    id: LEAD_ID,
    ref: 'BB-26-000777',
    type: 'consultation',
    booked_at: null,
    payload: { project_file: { version: 1 } },
    ...over,
  });

  it('marks the lead booked with the Calendly URIs', async () => {
    state.db = fakeDb({ leads: [leadRow()] });
    const res = await markConsultBooked({
      ref: 'BB-26-000777',
      token: bookingToken(LEAD_ID),
      calendly: { event: 'calendly.event_scheduled', payload: { event: { uri: 'https://api.calendly.com/scheduled_events/E1' } } },
    });
    expect(res).toEqual({ ok: true });
    const write = state.db.writes.find((w) => w.table === 'leads' && w.op === 'update')!;
    expect(write.values).toMatchObject({
      booked_at: expect.any(String),
      payload: { project_file: { version: 1 }, booking: { method: 'calendly', calendly_event: 'https://api.calendly.com/scheduled_events/E1' } },
    });
  });

  it('refuses a wrong token, another lead type or a bad ref, and is idempotent', async () => {
    state.db = fakeDb({ leads: [leadRow()] });
    expect(await markConsultBooked({ ref: 'BB-26-000777', token: bookingToken('00000000-0000-4000-8000-000000000bad') })).toEqual({ ok: false });
    expect(await markConsultBooked({ ref: 'nope', token: bookingToken(LEAD_ID) })).toEqual({ ok: false });
    state.db = fakeDb({ leads: [leadRow({ type: 'contact' })] });
    expect(await markConsultBooked({ ref: 'BB-26-000777', token: bookingToken(LEAD_ID) })).toEqual({ ok: false });
    state.db = fakeDb({ leads: [leadRow({ booked_at: '2026-10-14T10:00:00Z' })] });
    expect(await markConsultBooked({ ref: 'BB-26-000777', token: bookingToken(LEAD_ID) })).toEqual({ ok: true });
    expect(state.db.writes).toHaveLength(0);
  });
});
