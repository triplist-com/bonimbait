'use server';

/**
 * "שלחו לי את הדוח": a builder leaves an email or a phone on the report page and
 * gets a `budget_report` lead through the existing pipeline (lib/leads/submit.ts:
 * validation, spam checks, rate limit, ref, attribution, notification).
 *
 * The estimate is recomputed here from the answers (the URL query) with the
 * current price book: the browser never decides what numbers the lead carries.
 */
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { submitLead } from '@/lib/leads/submit';
import { clientIpFromHeaders } from '@/lib/leads/spam';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { estimateBudget } from './engine';
import { loadPriceBook } from './price-book';
import { isCompleteInput, parsePlannerQuery, plannerQuery } from './prefill';
import { REPORT_PATH } from './share';
import { splitContact, type ReportRequestState } from './report-request';

export async function requestBudgetReport(_prev: ReportRequestState, fd: FormData): Promise<ReportRequestState> {
  const input = parsePlannerQuery(new URLSearchParams(String(fd.get('_query') ?? '')));
  if (!isCompleteInput(input)) {
    return { status: 'error', message: 'חסרים פרטי הבית. חזרו למחשבון ונסו שוב.', submittedAt: Date.now() };
  }
  const { book } = await loadPriceBook();
  const e = estimateBudget(input, book);
  const reportPath = `${REPORT_PATH}?${plannerQuery(e.input)}`;

  let memberId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      memberId = (await getUser())?.id ?? null;
    } catch {
      memberId = null;
    }
  }

  const contact = splitContact(String(fd.get('contact') ?? ''));
  const result = await submitLead({
    type: 'budget_report',
    payload: { full_name: fd.get('full_name'), ...contact, region: e.input.regionSlug },
    context: {
      cta_source: 'planner_report',
      estimate_id: e.estimateId,
      total_min: e.total.min,
      total_max: e.total.max,
      size_m2: e.input.sizeM2,
      floors: e.input.floors,
      finish_level: e.input.finishLevel,
      extras: e.input.extras.join(',') || null,
      price_book_as_of: e.validAsOf,
      report_path: reportPath,
    },
    sourceUrl: reportPath,
    memberId,
    ip: clientIpFromHeaders(headers()),
    spam: { honeypot: fd.get(HONEYPOT_FIELD) },
  });

  if (!result.ok) {
    // The one visible field is "contact": show email/phone errors there.
    const fe = result.fieldErrors ?? {};
    const contactError = fe.email ?? fe.phone;
    return {
      status: 'error',
      message: result.message,
      fieldErrors: contactError ? { ...fe, contact: contactError } : fe,
      submittedAt: Date.now(),
    };
  }
  return { status: 'success', ref: result.lead?.ref ?? null, submittedAt: Date.now() };
}
