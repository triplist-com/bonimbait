'use server';

/**
 * Partner campaigns (sponsored offers) in the admin, editors and up. Offers
 * render on ISR pages, so a change shows on those pages at their next
 * revalidation (within the hour); this instance's offer cache is dropped now.
 */
import { revalidatePath } from 'next/cache';
import { ActionError, adminAction } from '@/lib/admin/guard';
import { str } from '@/lib/admin/form';
import { asRevenueDb } from '../db';
import { invalidateOffers } from '../offers-server';
import { invalidateRoutingRules } from '../routing-server';
import { CAMPAIGN_STATUSES, parseCampaignForm, type CampaignFormValues } from '../campaign-form';
import type { CampaignStatus } from '../types';

const PATH = '/admin/partners/campaigns/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(fd: FormData, name: string): string[] {
  return fd.getAll(name).filter((v): v is string => typeof v === 'string');
}

function changed() {
  invalidateOffers();
  invalidateRoutingRules(); // rules may point at a campaign that just went live or ended
  revalidatePath(PATH);
  revalidatePath('/recommended/');
}

export const saveCampaign = adminAction('editor', async ({ db, profile }, fd: FormData) => {
  const values: CampaignFormValues = {
    business_id: str(fd, 'business_id', 64),
    name: str(fd, 'name', 200),
    status: str(fd, 'status', 20),
    starts_on: str(fd, 'starts_on', 12),
    ends_on: str(fd, 'ends_on', 12),
    topics: list(fd, 'topics'),
    stages: list(fd, 'stages'),
    region_slugs: list(fd, 'region_slugs'),
    placements: list(fd, 'placements'),
    headline: str(fd, 'headline', 200),
    body: str(fd, 'body', 600),
    cta_label: str(fd, 'cta_label', 60),
    target_url: str(fd, 'target_url', 600),
    image_url: str(fd, 'image_url', 1200),
    priority: str(fd, 'priority', 6),
  };
  const parsed = parseCampaignForm(values);
  if (!parsed.ok) throw new ActionError('נא לתקן את השדות המסומנים', parsed.fieldErrors);
  const rdb = asRevenueDb(db);
  const id = str(fd, 'id', 64);
  if (id) {
    if (!UUID_RE.test(id)) throw new ActionError('הקמפיין לא נמצא');
    const res = await rdb.from('partner_campaigns').update(parsed.campaign).eq('id', id).select('id').maybeSingle();
    if (res.error) throw new Error(res.error.message);
    if (!res.data) throw new ActionError('הקמפיין לא נמצא');
  } else {
    const res = await rdb.from('partner_campaigns').insert({ ...parsed.campaign, created_by: profile.id });
    if (res.error) throw new Error(res.error.message);
  }
  changed();
  return { ok: true, message: 'הקמפיין נשמר.', data: { redirect: PATH } };
});

export const setCampaignStatus = adminAction('editor', async ({ db }, id: string, status: CampaignStatus) => {
  if (!UUID_RE.test(id) || !CAMPAIGN_STATUSES.includes(status)) throw new ActionError('פעולה לא חוקית');
  const res = await asRevenueDb(db).from('partner_campaigns').update({ status }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
  changed();
  return { ok: true, message: 'הסטטוס עודכן.' };
});
