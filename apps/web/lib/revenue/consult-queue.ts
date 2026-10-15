import 'server-only';

/**
 * Loads "תור הייעוצים": consultation leads by score (highest first, then
 * newest), one tab at a time, with the counts for every tab. Runs with the
 * staff member's own session (RLS: staff full access).
 */
import { attributedPartnerId } from '@/lib/analytics/attribution';
import type { RevenueDb } from './db';
import { CONSULT_COLUMNS, consultLeadView, type ConsultLeadRow, type ConsultLeadView } from './consult-view';
import { CONSULT_TABS, stageFilter, type ConsultStage } from './consult-workflow';

export const QUEUE_PAGE_SIZE = 60;

export type ConsultQueueData = {
  tab: ConsultStage;
  items: ConsultLeadView[];
  counts: Record<ConsultStage, number>;
  selected: ConsultLeadView | null;
};

function tabQuery(db: RevenueDb, tab: ConsultStage, opts: { head?: boolean } = {}) {
  const f = stageFilter(tab);
  let q = opts.head
    ? db.from('leads').select('id', { count: 'exact', head: true })
    : db.from('leads').select(CONSULT_COLUMNS);
  q = q.eq('type', 'consultation').in('status', f.status);
  if (f.booked === true) q = q.not('booked_at', 'is', null);
  if (f.booked === false) q = q.is('booked_at', null);
  return q;
}

async function businessNames(db: RevenueDb, rows: ConsultLeadRow[]): Promise<Map<string, { name: string; slug: string }>> {
  const ids = new Set<string>();
  for (const r of rows) {
    const file = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>).project_file : null;
    const list = file && typeof file === 'object' ? (file as Record<string, unknown>).shortlistBusinessIds : null;
    if (Array.isArray(list)) list.forEach((id) => typeof id === 'string' && ids.add(id));
    // The partner whose offer the builder clicked before asking (the 4-hour last touch).
    const partner = attributedPartnerId(r.attribution);
    if (partner) ids.add(partner);
  }
  if (ids.size === 0) return new Map();
  const { data } = await db.from('businesses').select('id, name, slug').in('id', Array.from(ids).slice(0, 200));
  return new Map((data ?? []).map((b) => [b.id, { name: b.name, slug: b.slug }]));
}

export async function loadConsultQueue(db: RevenueDb, opts: { tab: ConsultStage; selectedId?: string | null }): Promise<ConsultQueueData> {
  const [list, ...countResults] = await Promise.all([
    tabQuery(db, opts.tab)
      .order('score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(QUEUE_PAGE_SIZE),
    ...CONSULT_TABS.map((t) => tabQuery(db, t, { head: true })),
  ]);
  if (list.error) throw new Error(list.error.message);
  const rows = (list.data ?? []) as unknown as ConsultLeadRow[];

  let selectedRow = opts.selectedId ? rows.find((r) => r.id === opts.selectedId) ?? null : rows[0] ?? null;
  if (opts.selectedId && !selectedRow && /^[0-9a-f-]{36}$/i.test(opts.selectedId)) {
    const one = await db.from('leads').select(CONSULT_COLUMNS).eq('id', opts.selectedId).eq('type', 'consultation').maybeSingle();
    selectedRow = (one.data as unknown as ConsultLeadRow | null) ?? null;
  }

  const now = new Date();
  const businesses = await businessNames(db, selectedRow ? [...rows, selectedRow] : rows);
  const counts = Object.fromEntries(CONSULT_TABS.map((t, i) => [t, countResults[i]?.count ?? 0])) as Record<ConsultStage, number>;
  counts.spam = 0;
  return {
    tab: opts.tab,
    items: rows.map((r) => consultLeadView(r, { now, businesses })),
    counts,
    selected: selectedRow ? consultLeadView(selectedRow, { now, businesses }) : null,
  };
}
