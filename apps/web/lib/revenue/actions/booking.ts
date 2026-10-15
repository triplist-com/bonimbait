'use server';

/**
 * The consult booking flow (components/revenue/BookingSheet.tsx):
 *
 *   1. startConsultBooking()  creates the `consultation` lead WITH the project
 *                             file, BEFORE Calendly opens, and returns its ref
 *                             (for utm_content) and a booking token.
 *   2. Calendly opens prefilled (name, email, utm_content = ref).
 *   3. markConsultBooked()    on `calendly.event_scheduled`: sets leads.booked_at
 *                             for that lead only (the token proves the browser
 *                             created it).
 *
 * When Supabase isn't configured the first step reports 'unavailable' and the
 * sheet falls back to the plain Calendly embed, as before.
 */
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { submitLead } from '@/lib/leads/submit';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { rateLimit } from '@/lib/guard/rateLimit';
import type { Json } from '@/lib/db/types';
import { getStage, type BuildStage } from '@/lib/stages';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { sanitizeProjectFile } from '@/lib/project-file/sanitize';
import { bookingToken, verifyBookingToken } from '../booking-token';
import { isServiceRoleConfigured, revenueAdminDb } from '../db';
import { calendlyScheduledDetails } from '../calendly';

export type BookingMode = 'calendly' | 'callback';

export type StartBookingInput = {
  fullName: string;
  phone: string;
  email?: string;
  /** regions.slug, asked only when the file has none. */
  region?: string;
  /** lib/stages.ts id (the owner's 7 stages), asked only when the file has none. */
  stage?: string;
  /** collectProjectFile() in the browser (untrusted; sanitized and scored on the server). */
  projectFile?: unknown;
  /** Where the CTA sits (ConsultationCTA `source`). */
  source: string;
  mode: BookingMode;
  /** Honeypot value (must stay empty). */
  website?: string;
};

export type StartBookingResult =
  | { status: 'created'; ref: string; token: string; score: number | null }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

function isMemberRegion(slug: string): boolean {
  return MEMBER_REGIONS.some((r) => r.slug === slug);
}

function pathOf(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return decodeURI(new URL(referer).pathname).slice(0, 500);
  } catch {
    return null;
  }
}

export async function startConsultBooking(input: StartBookingInput): Promise<StartBookingResult> {
  const h = headers();
  let memberId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      memberId = (await getUser())?.id ?? null;
    } catch {
      memberId = null;
    }
  }
  // The sheet asks the owner's 7 stages; the lead column keeps the profile stage
  // (none for תשתיות), and the file keeps the stage id itself. When the file
  // already knows the stage and region (so the sheet didn't ask), the lead's own
  // columns are filled from it, so the inbox and dashboards see them too.
  const file = sanitizeProjectFile(input.projectFile);
  const stage = getStage(String(input.stage ?? '') as BuildStage['id']) ?? (file.stage ? getStage(file.stage) : undefined);
  if (stage) file.stage = stage.id;
  const region = input.region || (file.regionSlug && isMemberRegion(file.regionSlug) ? file.regionSlug : undefined);
  const result = await submitLead({
    type: 'consultation',
    payload: {
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      region,
      construction_stage: stage?.profileStage ?? undefined,
    },
    context: { cta_source: String(input.source ?? 'site').slice(0, 60), booking_mode: input.mode === 'callback' ? 'callback' : 'calendly' },
    sourceUrl: pathOf(h.get('referer')),
    memberId,
    ip: clientIpFromHeaders(h),
    spam: { honeypot: input.website },
    projectFile: file,
  });

  if (!result.ok) {
    if (result.error === 'unavailable') return { status: 'unavailable', message: result.message };
    return { status: 'error', message: result.fieldErrors?._form ?? result.message, fieldErrors: result.fieldErrors };
  }
  // A honeypot hit "succeeds" without a lead: behave normally, book nothing.
  if (!result.lead) return { status: 'unavailable', message: '' };
  const payload = result.lead.payload as { project_score?: { score?: unknown } } | null;
  const score = typeof payload?.project_score?.score === 'number' ? payload.project_score.score : null;
  return { status: 'created', ref: result.lead.ref, token: bookingToken(result.lead.id), score };
}

export type MarkBookedInput = { ref: string; token: string; calendly?: unknown };

/** Calendly said "scheduled": mark the visitor's own consultation lead booked. */
export async function markConsultBooked(input: MarkBookedInput): Promise<{ ok: boolean }> {
  try {
    if (!isServiceRoleConfigured() || typeof input?.ref !== 'string' || !/^BB-\d{2}-\d{6}$/.test(input.ref)) return { ok: false };
    const rl = await rateLimit({ name: 'consult_booked', limit: 10, windowSec: 600 }, hashIp(clientIpFromHeaders(headers())));
    if (!rl.ok) return { ok: false };

    const db = revenueAdminDb();
    const { data: lead } = await db.from('leads').select('id, type, booked_at, payload').eq('ref', input.ref).maybeSingle();
    if (!lead || lead.type !== 'consultation' || !verifyBookingToken(lead.id, input.token)) return { ok: false };
    if (lead.booked_at) return { ok: true }; // already booked: idempotent

    const at = new Date().toISOString();
    const details = calendlyScheduledDetails(input.calendly);
    const booking: Record<string, Json> = { status: 'booked', method: 'calendly', at };
    if (details.event) booking.calendly_event = details.event;
    if (details.invitee) booking.calendly_invitee = details.invitee;
    const base = lead.payload && typeof lead.payload === 'object' && !Array.isArray(lead.payload) ? lead.payload : {};
    const { error } = await db
      .from('leads')
      .update({ booked_at: at, payload: { ...base, booking } })
      .eq('id', lead.id)
      .is('booked_at', null);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    console.error(`[revenue] markConsultBooked failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false };
  }
}
