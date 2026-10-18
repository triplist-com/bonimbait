import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, result: { ok: true, lead: { ref: 'BB-26-000123' }, notification: null } as unknown }));

vi.mock('next/headers', () => ({ headers: () => new Headers({ 'x-forwarded-for': '203.0.113.7' }) }));
vi.mock('@/lib/auth/session', () => ({ getUser: async () => null }));
vi.mock('@/lib/leads/submit', () => ({
  submitLead: async (input: Record<string, unknown>) => {
    state.calls.push(input);
    return state.result;
  },
}));
// The price book comes from the seed (no DB in tests).
vi.mock('@/lib/planner/price-book', async () => {
  const { DEFAULT_PRICE_BOOK } = await import('@/lib/planner/defaults');
  return { loadPriceBook: async () => ({ id: null, book: DEFAULT_PRICE_BOOK, createdAt: null, createdBy: null, note: null, origin: 'default' }) };
});

import { requestBudgetReport } from '@/lib/planner/actions';
import { INITIAL_REPORT_REQUEST, splitContact } from '@/lib/planner/report-request';
import { validateLead } from '@/lib/leads/schemas';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  state.calls = [];
  state.result = { ok: true, lead: { ref: 'BB-26-000123' }, notification: null };
});

describe('budget_report lead type', () => {
  it('is a registered lead type with a Hebrew label', () => {
    expect(LEAD_TYPES).toContain('budget_report');
    expect(LEAD_TYPE_LABELS.budget_report).toBe('דוח תקציב מהמחשבון');
  });

  it('needs an email or a phone, and validates whichever is given', () => {
    expect(validateLead('budget_report', {})).toEqual({ ok: false, fieldErrors: { email: 'השאירו אימייל או טלפון' } });
    expect(validateLead('budget_report', { email: 'a@b.co' }).ok).toBe(true);
    const phone = validateLead('budget_report', { phone: '+972 54-430-0202', region: 'sharon' });
    expect(phone.ok && phone.lead.phone).toBe('0544300202');
    expect(phone.ok && phone.lead.regionSlug).toBe('sharon');
    expect(validateLead('budget_report', { phone: '12' }).ok).toBe(false);
    expect(validateLead('budget_report', { email: 'nope' }).ok).toBe(false);
  });

  it('splits one contact field into email or phone', () => {
    expect(splitContact(' a@b.co ')).toEqual({ email: 'a@b.co' });
    expect(splitContact('050-1234567')).toEqual({ phone: '050-1234567' });
    expect(splitContact('  ')).toEqual({});
    expect(INITIAL_REPORT_REQUEST).toEqual({ status: 'idle' });
  });
});

describe('requestBudgetReport', () => {
  it('recomputes the estimate server-side and sends a budget_report lead with it', async () => {
    const res = await requestBudgetReport(INITIAL_REPORT_REQUEST, form({ _query: 'm2=220&floors=2&region=sharon&finish=standard', contact: 'a@b.co', full_name: 'דנה' }));
    expect(res).toMatchObject({ status: 'success', ref: 'BB-26-000123' });
    expect(state.calls).toHaveLength(1);
    const call = state.calls[0];
    expect(call.type).toBe('budget_report');
    expect(call.payload).toEqual({ full_name: 'דנה', email: 'a@b.co', region: 'sharon' });
    expect(call.context).toMatchObject({
      cta_source: 'planner_report',
      total_min: 2_430_000,
      total_max: 3_290_000,
      size_m2: 220,
      floors: 2,
      finish_level: 'standard',
      extras: null,
      price_book_as_of: '2026-07-16',
      report_path: '/calculator/report/?m2=220&floors=2&region=sharon&finish=standard',
    });
    expect(call.ip).toBe('203.0.113.7');
  });

  it('refuses missing answers without calling the pipeline', async () => {
    const res = await requestBudgetReport(INITIAL_REPORT_REQUEST, form({ _query: 'm2=220', contact: 'a@b.co' }));
    expect(res.status).toBe('error');
    expect(state.calls).toHaveLength(0);
  });

  it('puts email/phone errors on the one visible field', async () => {
    state.result = { ok: false, error: 'validation', message: 'נא לתקן את השדות המסומנים', fieldErrors: { email: 'השאירו אימייל או טלפון' } };
    const res = await requestBudgetReport(INITIAL_REPORT_REQUEST, form({ _query: 'm2=220&floors=2&region=sharon&finish=standard', contact: '' }));
    expect(res.status).toBe('error');
    expect(res.fieldErrors?.contact).toBe('השאירו אימייל או טלפון');
  });
});
