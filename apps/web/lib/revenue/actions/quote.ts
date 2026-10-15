'use server';

/**
 * "בקשת הצעת מחיר" on a business page: a business_contact lead of kind
 * 'quote_request' that carries the visitor's project file (scored, routed by
 * the rules like any lead), plus the quote_request analytics event the
 * partner report and the portal count.
 */
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/session';
import { trackServer } from '@/lib/analytics/server';
import { rateLimit } from '@/lib/guard/rateLimit';
import { submitLead } from '@/lib/leads/submit';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { sanitizeProjectFile, parseProjectFileField } from '@/lib/project-file/sanitize';
import { getStage, type BuildStage } from '@/lib/stages';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { revenuePublicDb } from '../db';

export type QuoteState =
  | { status: 'idle' }
  | { status: 'sent'; ref: string | null }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(fd: FormData, name: string, max = 200): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function requestQuoteAction(_prev: QuoteState, fd: FormData): Promise<QuoteState> {
  const businessId = field(fd, 'business_id', 64);
  if (!UUID_RE.test(businessId)) return { status: 'error', message: 'בעל המקצוע לא נמצא.' };
  const message = field(fd, 'message', 2000);
  if (message.length < 5) return { status: 'error', message: 'נא לתקן את השדות המסומנים', fieldErrors: { message: 'ספרו בקצרה מה צריך' } };

  const h = headers();
  const ip = clientIpFromHeaders(h);
  const rl = await rateLimit({ name: 'quote', limit: 5, windowSec: 3600 }, hashIp(ip));
  if (!rl.ok) return { status: 'error', message: 'נשלחו כבר כמה בקשות בשעה האחרונה. נסו שוב מאוחר יותר.' };

  // The business's trade (for routing and the event): its primary specialty.
  const db = revenuePublicDb();
  const biz = db
    ? await db.from('businesses').select('id, name, primary_specialty_id, specialties:primary_specialty_id(slug, name)').eq('id', businessId).eq('status', 'published').maybeSingle()
    : null;
  if (db && !biz?.data) return { status: 'error', message: 'בעל המקצוע לא נמצא.' };
  const specialty = (biz?.data?.specialties ?? null) as { slug: string; name: string } | null;

  const stage = getStage(field(fd, 'stage', 30) as BuildStage['id']);
  const file = sanitizeProjectFile(parseProjectFileField(fd.get('_project_file')));
  if (stage) file.stage = stage.id;
  const region = field(fd, 'region', 40);

  let memberId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      memberId = (await getUser())?.id ?? null;
    } catch {
      memberId = null;
    }
  }
  let referer: string | null = null;
  try {
    referer = h.get('referer') ? decodeURI(new URL(h.get('referer')!).pathname) : null;
  } catch {
    referer = null;
  }

  const result = await submitLead({
    type: 'business_contact',
    payload: {
      full_name: fd.get('full_name') ?? undefined,
      email: fd.get('email') ?? undefined,
      phone: fd.get('phone') ?? undefined,
      region: region || file.regionSlug || undefined,
      construction_stage: stage?.profileStage ?? undefined,
      message,
      terms: 'on',
    },
    context: { kind: 'quote_request', ...(specialty ? { specialty_slug: specialty.slug } : {}) },
    sourceUrl: referer,
    businessId,
    memberId,
    ip,
    spam: { honeypot: fd.get(HONEYPOT_FIELD) },
    projectFile: file,
  });
  if (!result.ok) {
    return result.error === 'validation'
      ? { status: 'error', message: result.message, fieldErrors: result.fieldErrors }
      : { status: 'error', message: result.message };
  }
  if (result.lead) {
    await trackServer(
      'quote_request',
      {
        specialty: specialty?.name ?? 'לא ידוע',
        stage: stage?.id ?? file.stage ?? 'unknown',
        region: region || file.regionSlug || 'unknown',
        business_id: businessId,
        lead_id: result.lead.id,
      },
      { ip, userId: memberId, path: referer },
    );
  }
  return { status: 'sent', ref: result.lead?.ref ?? null };
}
