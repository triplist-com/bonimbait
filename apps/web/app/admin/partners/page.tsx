import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import type { Tone } from '@/lib/admin/labels';
import { israelMidnight } from '@/lib/command/period';
import { isEnabled } from '@/lib/flags';
import { revenueUserDb } from '@/lib/revenue/db';
import { loadPartnerTiers } from '@/lib/revenue/partner-tiers';
import { DEFAULT_MARGIN_RATE, HEALTH_LABELS, monthLabel, nextMonth, partnerHealthStatus, type HealthStatus } from '@/lib/revenue/report';
import { currentMonth } from '@/lib/revenue/report-server';
import type { PartnerOverviewRow } from '@/lib/revenue/types';

export const metadata = { title: 'בריאות שותפים' };

const TONES: Record<HealthStatus, Tone> = { healthy: 'green', watch: 'amber', at_risk: 'red', no_tier: 'gray' };
const ORDER: Record<HealthStatus, number> = { at_risk: 0, watch: 1, healthy: 2, no_tier: 3 };
const NUM = new Intl.NumberFormat('he-IL');
const NIS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });

type Row = PartnerOverviewRow & {
  name: string;
  tierName: string | null;
  priceAgorot: number | null;
  pace: number | null;
  roi: number | null;
  status: HealthStatus;
};

/**
 * Partner health across all partners, this month to date: exposure against
 * each tier's target (pro-rated), clicks, leads, quote requests, reported
 * deals and the ROI estimate (same method as the partner report).
 */
export default async function PartnerHealthPage() {
  if (!isEnabled('revenue')) notFound();
  const db = revenueUserDb();
  const month = currentMonth();
  const from = israelMidnight(`${month}-01`);
  const to = israelMidnight(`${nextMonth(month)}-01`);
  const elapsed = Math.min(1, Math.max(0.03, (Date.now() - from) / (to - from)));

  const [overview, tiers] = await Promise.all([
    db.rpc('revenue_partner_overview', { p_from: new Date(from).toISOString(), p_to: new Date(Math.min(Date.now(), to)).toISOString() }),
    loadPartnerTiers(db),
  ]);
  if (overview.error) throw new Error(overview.error.message);
  const base = (overview.data ?? []) as PartnerOverviewRow[];
  const ids = Array.from(new Set([...base.map((r) => r.business_id), ...Array.from(tiers.keys())]));
  const { data: names } = ids.length ? await db.from('businesses').select('id, name').in('id', ids) : { data: [] };
  const nameBy = new Map((names ?? []).map((b) => [b.id, b.name]));
  const byId = new Map(base.map((r) => [r.business_id, r]));

  const rows: Row[] = ids.map((id) => {
    const o = byId.get(id) ?? { business_id: id, impressions: 0, clicks: 0, leads: 0, quote_requests: 0, deals: 0, deal_value_agorot: 0 };
    const t = tiers.get(id);
    const target = t?.monthlyImpressionTarget ? t.monthlyImpressionTarget * elapsed : null;
    const pace = target ? Number(o.impressions) / target : null;
    const roi = t && Number(o.deal_value_agorot) > 0 ? Math.round(((Number(o.deal_value_agorot) * DEFAULT_MARGIN_RATE) / t.priceAgorot) * 10) / 10 : null;
    return {
      ...o,
      impressions: Number(o.impressions),
      clicks: Number(o.clicks),
      leads: Number(o.leads),
      quote_requests: Number(o.quote_requests),
      deals: Number(o.deals),
      deal_value_agorot: Number(o.deal_value_agorot),
      name: nameBy.get(id) ?? 'עסק',
      tierName: t?.tierName ?? null,
      priceAgorot: t?.priceAgorot ?? null,
      pace,
      roi,
      status: partnerHealthStatus({ onTier: Boolean(t), roiMultiple: roi, leads: Number(o.leads), pace }),
    };
  });
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.impressions - a.impressions || a.name.localeCompare(b.name, 'he'));

  const onTier = rows.filter((r) => r.tierName);
  const mrr = onTier.reduce((s, r) => s + (r.priceAgorot ?? 0), 0) / 100;
  const sum = (k: 'impressions' | 'leads' | 'deals') => rows.reduce((s, r) => s + r[k], 0);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="בריאות שותפים"
        description={`${monthLabel(month)}, עד היום. כל שותף מול היעד של המסלול שלו, והדוח החודשי שלו בלחיצה.`}
        actions={
          <Link href="/admin/partners/campaigns/" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            קמפיינים
          </Link>
        }
      />

      <section aria-label="סיכום" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['שותפים במסלול', NUM.format(onTier.length)],
          ['הכנסה חודשית ממסלולים', NIS.format(mrr)],
          ['חשיפות נצפות החודש', NUM.format(sum('impressions'))],
          ['פניות לשותפים', NUM.format(sum('leads'))],
          ['עסקאות שדווחו', NUM.format(sum('deals'))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="text-sm text-gray-600">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              <bdi>{value}</bdi>
            </p>
          </div>
        ))}
      </section>

      <DataTable
        rows={rows}
        rowKey={(r) => r.business_id}
        empty="עוד אין שותפים. מנויים וקמפיינים יופיעו כאן."
        columns={[
          {
            key: 'n',
            header: 'שותף',
            render: (r) => (
              <Link href={`/admin/partners/${r.business_id}/report/`} className="font-medium hover:text-primary hover:underline">
                {r.name}
              </Link>
            ),
          },
          { key: 't', header: 'מסלול', render: (r) => r.tierName ?? '—' },
          { key: 's', header: 'מצב', render: (r) => <StatusBadge label={HEALTH_LABELS[r.status]} tone={TONES[r.status]} /> },
          {
            key: 'i',
            header: 'חשיפות',
            render: (r) => (
              <span className="num">
                {NUM.format(r.impressions)}
                {r.pace !== null && <span className="block text-xs text-gray-500">{Math.round(r.pace * 100)}% מהיעד</span>}
              </span>
            ),
          },
          {
            key: 'c',
            header: 'לחיצות',
            className: 'hidden md:table-cell',
            render: (r) => (
              <span className="num">
                {NUM.format(r.clicks)}
                {r.impressions > 0 && <span className="block text-xs text-gray-500">{((r.clicks / r.impressions) * 100).toFixed(1)}%</span>}
              </span>
            ),
          },
          { key: 'q', header: 'הצעות מחיר', className: 'hidden lg:table-cell', render: (r) => <span className="num">{NUM.format(r.quote_requests)}</span> },
          { key: 'l', header: 'פניות', render: (r) => <span className="num">{NUM.format(r.leads)}</span> },
          { key: 'd', header: 'עסקאות', render: (r) => <span className="num">{NUM.format(r.deals)}</span> },
          { key: 'r', header: 'החזר', render: (r) => (r.roi !== null ? <span className="num font-semibold">×{r.roi}</span> : '—') },
        ]}
      />
      <p className="text-xs text-gray-500">
        החזר: {Math.round(DEFAULT_MARGIN_RATE * 100)}% רווח גולמי מערך העסקאות שדווחו, חלקי מחיר המסלול. יעד החשיפות מתחלק לפי הימים שעברו בחודש.
      </p>
    </div>
  );
}
