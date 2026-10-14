import 'server-only';

/**
 * 4-hour last-touch attribution: what brought a lead in.
 *
 *   const attribution = await lastTouchForVisitor(anonId, new Date());
 *   // -> { touch: 'partner_click', medium: 'partner', source: 'partner-42', minutes_before: 12, ... } | null
 *
 * Touches, newest wins (within 4h before the lead, inclusive):
 *   - partner_click   medium 'partner'    source = partner_id
 *   - source_clicked  medium 'ai_source'  source = '<kind>:<id>' (the video/article under an AI answer)
 *   - page_view       only ACQUISITION views: with UTM params ('campaign', source = utm_source)
 *                     or an external referrer ('referral', source = referrer host).
 *                     Internal navigation is not a touch: otherwise every lead would
 *                     be "attributed" to the page its form is on.
 * Same timestamp: partner_click > source_clicked > page_view. No touch: null (direct).
 * The result is stored on the lead (leads.attribution) by lib/leads/submit.ts.
 */
import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';

export const ATTRIBUTION_WINDOW_MS = 4 * 60 * 60 * 1000;
export const TOUCH_EVENTS = ['partner_click', 'source_clicked', 'page_view'] as const;
export type TouchEventName = (typeof TOUCH_EVENTS)[number];

/** A platform_events row, as selected for attribution. */
export type TouchRow = {
  name: string;
  occurred_at: string;
  path: string | null;
  referrer: string | null;
  utm: unknown;
  props: unknown;
};

export type LeadAttribution = {
  model: 'last_touch_4h';
  touch: TouchEventName;
  /** When the touch happened (ISO). */
  at: string;
  minutes_before: number;
  medium: 'partner' | 'ai_source' | 'campaign' | 'referral';
  source: string | null;
  campaign: string | null;
  /** Page the touch happened on. */
  path: string | null;
};

const PRIORITY: Record<TouchEventName, number> = { partner_click: 3, source_clicked: 2, page_view: 1 };

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
}

function isTouchName(name: string): name is TouchEventName {
  return (TOUCH_EVENTS as readonly string[]).includes(name);
}

function externalHost(referrer: string | null): string | null {
  if (!referrer || !/^https?:\/\//i.test(referrer)) return null; // internal referrers are stored as paths
  try {
    return new URL(referrer).host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** A page view that brought the visitor in: campaign UTMs or an external referrer. */
export function isAcquisitionView(row: Pick<TouchRow, 'utm' | 'referrer'>): boolean {
  return str(obj(row.utm).utm_source) !== null || externalHost(row.referrer) !== null;
}

function toMs(at: Date | string | number): number {
  return at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
}

function describe(row: TouchRow & { name: TouchEventName }, leadMs: number): LeadAttribution {
  const props = obj(row.props);
  const utm = obj(row.utm);
  const base = {
    model: 'last_touch_4h' as const,
    touch: row.name,
    at: new Date(toMs(row.occurred_at)).toISOString(),
    minutes_before: Math.max(0, Math.round((leadMs - toMs(row.occurred_at)) / 60_000)),
    path: row.path,
  };
  if (row.name === 'partner_click') {
    return { ...base, medium: 'partner', source: str(props.partner_id), campaign: str(props.offer_id) ?? str(utm.utm_campaign) };
  }
  if (row.name === 'source_clicked') {
    const kind = str(props.kind);
    const id = str(props.id);
    return { ...base, medium: 'ai_source', source: kind && id ? `${kind}:${id}` : id, campaign: null };
  }
  const utmSource = str(utm.utm_source);
  return utmSource
    ? { ...base, medium: 'campaign', source: utmSource, campaign: str(utm.utm_campaign) }
    : { ...base, medium: 'referral', source: externalHost(row.referrer), campaign: null };
}

/** Pure: the attributed touch for a lead at `leadAt`, or null. */
export function pickLastTouch(
  rows: readonly TouchRow[],
  leadAt: Date | string | number,
  windowMs: number = ATTRIBUTION_WINDOW_MS,
): LeadAttribution | null {
  const leadMs = toMs(leadAt);
  if (!Number.isFinite(leadMs)) return null;
  let best: (TouchRow & { name: TouchEventName }) | null = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    if (!isTouchName(row.name)) continue;
    const t = toMs(row.occurred_at);
    if (!Number.isFinite(t) || t > leadMs || t < leadMs - windowMs) continue;
    if (row.name === 'page_view' && !isAcquisitionView(row)) continue;
    const touch = row as TouchRow & { name: TouchEventName };
    if (t > bestMs || (t === bestMs && best && PRIORITY[touch.name] > PRIORITY[best.name])) {
      best = touch;
      bestMs = t;
    }
  }
  return best ? describe(best, leadMs) : null;
}

const MEDIUM_LABELS: Record<LeadAttribution['medium'], string> = {
  partner: 'לחיצה על שותף',
  ai_source: 'מקור בתשובת AI',
  campaign: 'קמפיין',
  referral: 'הפניה מאתר',
};

/** Hebrew one-liner for the admin, e.g. "קמפיין: facebook (spring) · 12 דק׳ לפני הפנייה". */
export function attributionLabelHe(value: unknown): string {
  const a = obj(value) as Partial<LeadAttribution>;
  if (!a.medium || !(a.medium in MEDIUM_LABELS)) return 'ישיר / לא ידוע';
  const what = [a.source, a.campaign ? `(${a.campaign})` : null].filter(Boolean).join(' ');
  const when = typeof a.minutes_before === 'number' ? ` · ${a.minutes_before} דק׳ לפני הפנייה` : '';
  return `${MEDIUM_LABELS[a.medium]}${what ? `: ${what}` : ''}${when}`;
}

/** The visitor's attributed touch for a lead happening at `leadAt`. Never throws. */
export async function lastTouchForVisitor(anonId: string | null | undefined, leadAt: Date = new Date()): Promise<LeadAttribution | null> {
  if (!anonId || !isPlatformDbConfigured()) return null;
  try {
    const since = new Date(leadAt.getTime() - ATTRIBUTION_WINDOW_MS).toISOString();
    const { data, error } = await withTimeout(
      platformAdminDb()
        .from('platform_events')
        .select('name, occurred_at, path, referrer, utm, props')
        .eq('anon_id', anonId)
        .in('name', [...TOUCH_EVENTS])
        .gte('occurred_at', since)
        .lte('occurred_at', leadAt.toISOString())
        .order('occurred_at', { ascending: false })
        .limit(300),
      1500,
      'attribution lookup',
    );
    if (error) throw new Error(error.message);
    return pickLastTouch((data ?? []) as TouchRow[], leadAt);
  } catch (err) {
    console.error(`[analytics] attribution lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
