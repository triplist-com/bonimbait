/**
 * Partner campaigns in the admin (/admin/partners/campaigns/): parse the
 * editor's form into a partner_campaigns row. Pure and client-safe (tested).
 */
import { REGIONS } from '@/lib/constants/community';
import { israelDay, israelMidnight } from '@/lib/command/period';
import { BUILD_STAGES } from '@/lib/stages';
import { TOPICS } from './topics';
import { OFFER_PLACEMENTS, type CampaignStatus, type PartnerCampaignRow } from './types';

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['draft', 'active', 'paused', 'ended'];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  paused: 'מושהה',
  ended: 'הסתיים',
};

export const PLACEMENT_LABELS: Record<(typeof OFFER_PLACEMENTS)[number], string> = {
  video: 'עמודי וידאו',
  article: 'מאמרים',
  directory: 'נבחרת המומלצים',
  answer: 'תשובות באתר',
  hub: 'הבית שלי',
  planner: 'מחשבון התקציב',
};

export type CampaignInput = Pick<
  PartnerCampaignRow,
  | 'business_id'
  | 'name'
  | 'status'
  | 'starts_at'
  | 'ends_at'
  | 'topics'
  | 'stages'
  | 'region_slugs'
  | 'placements'
  | 'headline'
  | 'body'
  | 'cta_label'
  | 'target_url'
  | 'image_url'
  | 'priority'
>;

export type CampaignFormValues = {
  business_id?: string;
  name?: string;
  status?: string;
  starts_on?: string;
  ends_on?: string;
  topics?: string[];
  stages?: string[];
  region_slugs?: string[];
  placements?: string[];
  headline?: string;
  body?: string;
  cta_label?: string;
  target_url?: string;
  image_url?: string;
  priority?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickAllowed(list: string[] | undefined, allowed: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const v of list ?? []) if (allowed.has(v) && !out.includes(v)) out.push(v);
  return out;
}

/** An internal path ("/product/x/"), never another site. */
export function isInternalPath(value: string): boolean {
  return /^\/(?!\/)[^\s\\]*$/.test(value) && value.length <= 500;
}

export function parseCampaignForm(values: CampaignFormValues): { ok: true; campaign: CampaignInput } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {};
  const businessId = (values.business_id ?? '').trim();
  if (!UUID_RE.test(businessId)) e.business_id = 'יש לבחור את השותף';
  const name = (values.name ?? '').trim();
  if (name.length < 2 || name.length > 120) e.name = 'שם הקמפיין: 2 עד 120 תווים';
  const status = (values.status ?? 'draft') as CampaignStatus;
  if (!CAMPAIGN_STATUSES.includes(status)) e.status = 'סטטוס לא מוכר';

  const startsOn = (values.starts_on ?? '').trim();
  const endsOn = (values.ends_on ?? '').trim();
  if (startsOn && !DATE_RE.test(startsOn)) e.starts_on = 'תאריך לא תקין';
  if (endsOn && !DATE_RE.test(endsOn)) e.ends_on = 'תאריך לא תקין';
  if (startsOn && endsOn && DATE_RE.test(startsOn) && DATE_RE.test(endsOn) && endsOn < startsOn) e.ends_on = 'הסיום לפני ההתחלה';

  const headline = (values.headline ?? '').trim();
  if (headline.length < 2 || headline.length > 120) e.headline = 'כותרת: 2 עד 120 תווים';
  const body = (values.body ?? '').trim();
  if (body.length > 400) e.body = 'עד 400 תווים';
  const cta = (values.cta_label ?? '').trim() || 'לפרטים';
  if (cta.length > 40) e.cta_label = 'עד 40 תווים';
  const target = (values.target_url ?? '').trim();
  if (!isInternalPath(target)) e.target_url = 'כתובת פנימית באתר, למשל /product/שם-המוצר/';
  const image = (values.image_url ?? '').trim();
  if (image && (!/^https:\/\//.test(image) || image.length > 1000)) e.image_url = 'כתובת תמונה שמתחילה ב-https://';
  const priorityRaw = (values.priority ?? '').trim();
  const priority = priorityRaw === '' ? 0 : Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < -100 || priority > 100) e.priority = 'מספר שלם בין -100 ל-100';

  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return {
    ok: true,
    campaign: {
      business_id: businessId,
      name,
      status,
      starts_at: startsOn ? new Date(israelMidnight(startsOn)).toISOString() : null,
      // Inclusive end date: the campaign runs to the end of that Israel day.
      ends_at: endsOn ? new Date(israelMidnight(endsOn) + 86_400_000).toISOString() : null,
      topics: pickAllowed(values.topics, new Set(TOPICS.map((t) => t.key))),
      stages: pickAllowed(values.stages, new Set(BUILD_STAGES.map((s) => s.id))),
      region_slugs: pickAllowed(values.region_slugs, new Set(REGIONS.map((r) => r.slug))),
      placements: pickAllowed(values.placements, new Set(OFFER_PLACEMENTS)),
      headline,
      body: body || null,
      cta_label: cta,
      target_url: target,
      image_url: image || null,
      priority,
    },
  };
}

/** The form's date fields for a stored campaign (Israel dates; the end is inclusive). */
export function campaignDates(c: Pick<PartnerCampaignRow, 'starts_at' | 'ends_at'>): { starts_on: string; ends_on: string } {
  return {
    starts_on: c.starts_at ? israelDay(c.starts_at) : '',
    ends_on: c.ends_at ? israelDay(Date.parse(c.ends_at) - 1) : '',
  };
}
