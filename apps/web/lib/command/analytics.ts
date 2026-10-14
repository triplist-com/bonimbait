/**
 * Leads analytics (/admin/insights/leads/): breakdowns by source, UTM, type,
 * stage, region and score band, plus speed-to-lead. Pure and client-safe.
 */
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { REGION_BUCKETS, SCORE_BANDS, STAGE_BUCKETS, UNKNOWN, scoreBand, sourceGroupKey, sourceGroupLabel } from './dimensions';
import { isCountableLead } from './leads';
import { expectedValueTable, leadExpectedValue } from './pipeline';
import { fillDaily, inRange, israelDay, minutesBetween, periodDelta, periodWindow } from './period';
import type { Delta, ExpectedValue, LeadFact, PeriodDays, Point } from './types';

export type BreakdownRow = { key: string; label: string; count: number; share: number; valueAgorot: number };

export type SpeedToLead = {
  /** Leads whose first status change was recorded. */
  measured: number;
  /** Still 'new' (never touched). */
  untouched: number;
  /** Still 'new' and older than a day. */
  overdue: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  within1h: number | null;
  within24h: number | null;
  byType: { type: string; label: string; measured: number; medianMinutes: number | null; untouched: number }[];
};

export type LeadsAnalytics = {
  period: { days: PeriodDays; from: string; to: string };
  total: Delta;
  daily: Point[];
  bySource: BreakdownRow[];
  byUtm: BreakdownRow[];
  byType: BreakdownRow[];
  byStage: BreakdownRow[];
  byRegion: BreakdownRow[];
  byScoreBand: BreakdownRow[];
  speed: SpeedToLead;
};

function breakdown(
  leads: readonly LeadFact[],
  keyOf: (l: LeadFact) => { key: string; label: string },
  value: (l: LeadFact) => number,
  order?: ReadonlyArray<{ key: string; label: string }>,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const o of order ?? []) rows.set(o.key, { key: o.key, label: o.label, count: 0, share: 0, valueAgorot: 0 });
  for (const l of leads) {
    const { key, label } = keyOf(l);
    const row = rows.get(key) ?? { key, label, count: 0, share: 0, valueAgorot: 0 };
    row.count += 1;
    row.valueAgorot += value(l);
    rows.set(key, row);
  }
  const total = leads.length || 1;
  const list = Array.from(rows.values()).map((r) => ({ ...r, share: r.count / total }));
  // Fixed orders (stages, bands) keep their order; open-ended ones sort by count.
  return order ? list : list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'he'));
}

/** Nearest-rank percentile of sorted values. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank];
}

export function speedToLead(leads: readonly LeadFact[], nowMs: number): SpeedToLead {
  const minutes: number[] = [];
  let untouched = 0;
  let overdue = 0;
  const perType = new Map<string, { values: number[]; untouched: number }>();
  for (const l of leads) {
    const t = perType.get(l.type) ?? { values: [], untouched: 0 };
    if (l.firstResponseAt) {
      const m = minutesBetween(l.createdAt, l.firstResponseAt);
      minutes.push(m);
      t.values.push(m);
    } else if (l.status === 'new') {
      untouched += 1;
      t.untouched += 1;
      if (nowMs - Date.parse(l.createdAt) > 24 * 60 * 60_000) overdue += 1;
    }
    perType.set(l.type, t);
  }
  const sorted = [...minutes].sort((a, b) => a - b);
  const share = (limit: number) => (sorted.length ? sorted.filter((m) => m <= limit).length / sorted.length : null);
  return {
    measured: sorted.length,
    untouched,
    overdue,
    medianMinutes: percentile(sorted, 0.5),
    p90Minutes: percentile(sorted, 0.9),
    within1h: share(60),
    within24h: share(24 * 60),
    byType: LEAD_TYPES.filter((t) => perType.has(t)).map((t) => {
      const v = [...perType.get(t)!.values].sort((a, b) => a - b);
      return { type: t, label: LEAD_TYPE_LABELS[t], measured: v.length, medianMinutes: percentile(v, 0.5), untouched: perType.get(t)!.untouched };
    }),
  };
}

export function buildLeadsAnalytics(
  input: { now: string; periodDays: PeriodDays; leads: readonly LeadFact[]; expectedValues: readonly ExpectedValue[]; regionNames: Record<string, string> },
): LeadsAnalytics {
  const nowMs = Date.parse(input.now);
  const window = periodWindow(nowMs, input.periodDays);
  const table = expectedValueTable(input.expectedValues);
  const cur = input.leads.filter((l) => isCountableLead(l) && inRange(l.createdAt, window.from, window.to));
  const prev = input.leads.filter((l) => isCountableLead(l) && inRange(l.createdAt, window.prevFrom, window.prevTo));
  const value = (l: LeadFact) => leadExpectedValue(l, table);
  const daily = new Map<string, number>();
  for (const l of cur) daily.set(israelDay(l.createdAt), (daily.get(israelDay(l.createdAt)) ?? 0) + 1);

  const regionOrder = REGION_BUCKETS.map((r) => ({ key: r.key, label: input.regionNames[r.key] ?? r.label }));
  return {
    period: { days: window.days, from: window.from, to: window.to },
    total: periodDelta(cur.length, prev.length),
    daily: fillDaily(window.dayList, daily),
    bySource: breakdown(cur, (l) => ({ key: sourceGroupKey(l.source), label: sourceGroupLabel(l.source) }), value),
    byUtm: breakdown(
      cur.filter((l) => l.source.medium === 'campaign'),
      (l) => ({
        key: `${l.source.source ?? UNKNOWN}|${l.source.campaign ?? ''}`,
        label: [l.source.source ?? 'לא ידוע', l.source.campaign].filter(Boolean).join(' / '),
      }),
      value,
    ),
    byType: breakdown(cur, (l) => ({ key: l.type, label: LEAD_TYPE_LABELS[l.type] ?? l.type }), value),
    byStage: breakdown(
      cur,
      (l) => ({ key: l.stage ?? UNKNOWN, label: STAGE_BUCKETS.find((s) => s.key === l.stage)?.label ?? 'לא צוין' }),
      value,
      [...STAGE_BUCKETS, { key: UNKNOWN, label: 'לא צוין' }],
    ),
    byRegion: breakdown(
      cur,
      (l) => ({ key: l.regionSlug ?? UNKNOWN, label: regionOrder.find((r) => r.key === l.regionSlug)?.label ?? 'לא צוין' }),
      value,
      [...regionOrder, { key: UNKNOWN, label: 'לא צוין' }],
    ),
    byScoreBand: breakdown(
      cur,
      (l) => {
        const id = scoreBand(l.score);
        return { key: id, label: SCORE_BANDS.find((b) => b.id === id)!.label };
      },
      value,
      SCORE_BANDS.map((b) => ({ key: b.id, label: b.label })),
    ),
    speed: speedToLead(cur, nowMs),
  };
}
