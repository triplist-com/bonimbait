/**
 * buildCommandCenter(): raw inputs -> the "חדר הבקרה" view model. Pure and
 * deterministic, so the real admin (lib/command/load.ts) and the demo fixture
 * (lib/demo/fixtures/command.ts) go through exactly the same math.
 */
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { HOT_SCORE, regionLabel, scoreBand, stageLabel } from './dimensions';
import { isCountableLead, isOpenLead } from './leads';
import { expectedValueTable, leadExpectedValue, pipelineSummary, type ExpectedValueTable } from './pipeline';
import { partnersSummary } from './partners';
import { fillDaily, inRange, israelDay, israelMidnight, minutesBetween, periodDelta, periodWindow, sumPoints, type PeriodWindow } from './period';
import type {
  CommandCenterData,
  CommandInputs,
  DailyEventCount,
  HotLead,
  LeadFact,
  PlanMixRow,
  Point,
  UnansweredItem,
} from './types';

export type BuildOptions = {
  isDemo?: boolean;
  /** Link for a lead row; null renders it without a link (demo). */
  leadHref?: (id: string) => string | null;
};

const DAY_MS = 86_400_000;

/** Share of today (Israel) that has passed: prorates the previous period's last day. */
function elapsedTodayShare(nowMs: number): number {
  const midnight = israelMidnight(israelDay(nowMs));
  return Math.min(1, Math.max(0, (nowMs - midnight) / DAY_MS));
}

/** Totals of daily-bucketed data for both periods, with the previous last day prorated. */
export function dailyTotals(
  window: Pick<PeriodWindow, 'dayList' | 'prevDayList'>,
  byDay: ReadonlyMap<string, number>,
  lastDayShare: number,
): { current: number; previous: number; series: Point[] } {
  const series = fillDaily(window.dayList, byDay);
  const prev = fillDaily(window.prevDayList, byDay);
  const previous = prev.length ? sumPoints(prev.slice(0, -1)) + prev[prev.length - 1].value * lastDayShare : 0;
  return { current: sumPoints(series), previous: Math.round(previous * 100) / 100, series };
}

function eventsByDay(events: readonly DailyEventCount[], name: string, measure: 'events' | 'visitors'): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) if (e.name === name) map.set(e.day, (map.get(e.day) ?? 0) + e[measure]);
  return map;
}

function sortHotLeads(a: LeadFact, b: LeadFact): number {
  const sa = a.score ?? -1;
  const sb = b.score ?? -1;
  if (sa !== sb) return sb - sa;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export function toHotLead(
  lead: LeadFact,
  ctx: { nowMs: number; table: ExpectedValueTable; regionNames: Record<string, string>; leadHref?: (id: string) => string | null },
): HotLead {
  return {
    id: lead.id,
    ref: lead.ref,
    href: ctx.leadHref ? ctx.leadHref(lead.id) : `/admin/leads/${lead.id}/`,
    type: lead.type,
    typeLabel: LEAD_TYPE_LABELS[lead.type] ?? lead.type,
    status: lead.status,
    score: lead.score,
    band: scoreBand(lead.score),
    scoreReasons: lead.scoreReasons.slice(0, 3),
    stageLabel: stageLabel(lead.stage),
    regionName: regionLabel(lead.regionSlug, ctx.regionNames),
    sizeM2: lead.sizeM2,
    budgetLabel: lead.budgetLabel,
    sourceLabel: lead.source.label,
    minutesAgo: minutesBetween(lead.createdAt, ctx.nowMs),
    expectedValueAgorot: leadExpectedValue(lead, ctx.table),
  };
}

function planMix(inputs: CommandInputs, window: PeriodWindow, table: ExpectedValueTable): CommandCenterData['planMix'] {
  const rows = new Map<string, PlanMixRow>();
  for (const p of [...inputs.plans].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const ev = table.get(`plan:${p.slug}`);
    rows.set(p.slug, {
      slug: p.slug,
      name: p.name,
      leads: 0,
      orders: 0,
      paidAgorot: 0,
      expectedValueAgorot: ev ? Math.round(ev.dealValueAgorot * ev.closeRate) : 0,
    });
  }
  for (const lead of inputs.leads) {
    if (!lead.planSlug || !isCountableLead(lead) || !inRange(lead.createdAt, window.from, window.to)) continue;
    const row = rows.get(lead.planSlug);
    if (row) row.leads += 1;
  }
  let paidCur = 0;
  let paidPrev = 0;
  for (const order of inputs.orders) {
    const cur = inRange(order.createdAt, window.from, window.to);
    const prev = inRange(order.createdAt, window.prevFrom, window.prevTo);
    if (!cur && !prev) continue;
    const planTotal = order.planItems.reduce((a, i) => a + i.totalAgorot, 0);
    if (order.status === 'paid') {
      if (cur) paidCur += planTotal;
      else paidPrev += planTotal;
    }
    if (!cur || (order.status !== 'paid' && order.status !== 'pending')) continue;
    for (const slug of Array.from(new Set(order.planItems.map((i) => i.planSlug)))) {
      const row = rows.get(slug);
      if (!row) continue;
      row.orders += 1;
      if (order.status === 'paid') row.paidAgorot += order.planItems.filter((i) => i.planSlug === slug).reduce((a, i) => a + i.totalAgorot, 0);
    }
  }
  const list = Array.from(rows.values());
  return {
    rows: list,
    totalLeads: list.reduce((a, r) => a + r.leads, 0),
    totalOrders: list.reduce((a, r) => a + r.orders, 0),
    paidAgorot: paidCur,
    paidDelta: periodDelta(paidCur, paidPrev),
  };
}

function unanswered(inputs: CommandInputs): CommandCenterData['unanswered'] {
  if (inputs.insights && inputs.insights.topics.length > 0) {
    const open = inputs.insights.topics.filter((t) => t.level !== 'covered');
    const ordered = [...open].sort((a, b) => (a.level === b.level ? b.asks - a.asks : a.level === 'gap' ? -1 : 1));
    const items: UnansweredItem[] = ordered.slice(0, 6).map((t) => ({
      id: t.id,
      label: t.label,
      example: t.examples[0]?.q ?? null,
      asks: t.asks,
      trendPct: t.trendPct,
      level: t.level,
      suggestedTitle: t.suggestedTitle,
    }));
    return {
      source: 'insights',
      totalAsks: open.reduce((a, t) => a + t.asks, 0),
      items,
      runAt: inputs.insights.run.finishedAt ?? inputs.insights.run.startedAt,
    };
  }
  if (inputs.topQuestions.length > 0) {
    const items: UnansweredItem[] = inputs.topQuestions.slice(0, 6).map((q, i) => ({
      id: `q-${i}`,
      label: q.question,
      example: null,
      asks: q.asks,
      trendPct: null,
      level: null,
      suggestedTitle: null,
    }));
    return { source: 'questions', totalAsks: inputs.topQuestions.reduce((a, q) => a + q.asks, 0), items, runAt: null };
  }
  return { source: 'none', totalAsks: 0, items: [], runAt: null };
}

/** Too little real activity to read the dashboard (the admin then offers demo data). */
export const SPARSE_MIN_LEADS = 5;
export const SPARSE_MIN_QUESTIONS = 30;

export function buildCommandCenter(inputs: CommandInputs, opts: BuildOptions = {}): CommandCenterData {
  const nowMs = Date.parse(inputs.now);
  const window = periodWindow(nowMs, inputs.periodDays);
  const share = elapsedTodayShare(nowMs);
  const table = expectedValueTable(inputs.expectedValues);

  const curLeads = inputs.leads.filter((l) => isCountableLead(l) && inRange(l.createdAt, window.from, window.to));
  const prevLeads = inputs.leads.filter((l) => isCountableLead(l) && inRange(l.createdAt, window.prevFrom, window.prevTo));

  // Consultations: Calendly bookings (one per visitor per day) plus consultation leads.
  const booked = dailyTotals(window, eventsByDay(inputs.events, 'consult_booked', 'visitors'), share);
  const requests = periodDelta(
    curLeads.filter((l) => l.type === 'consultation').length,
    prevLeads.filter((l) => l.type === 'consultation').length,
  );

  // Leads by score, recency second.
  const openLeads = curLeads.filter(isOpenLead).sort(sortHotLeads);
  const scored = curLeads.filter((l) => l.score != null);
  const hotCur = curLeads.filter((l) => (l.score ?? -1) >= HOT_SCORE).length;
  const hotPrev = prevLeads.filter((l) => (l.score ?? -1) >= HOT_SCORE).length;
  const hotCtx = { nowMs, table, regionNames: inputs.regionNames, leadHref: opts.leadHref };
  const hotList = openLeads.slice(0, 8).map((l) => toHotLead(l, hotCtx));

  // AI: $ per UTC budget day, questions per Israel day.
  const costByDay = new Map(inputs.aiUsage.map((u) => [u.day, u.costUsd]));
  const cost = dailyTotals(window, costByDay, share);
  const questions = dailyTotals(window, eventsByDay(inputs.events, 'answer_requested', 'events'), share);
  const answered = sumPoints(fillDaily(window.dayList, eventsByDay(inputs.events, 'answer_completed', 'events')));
  const answerCalls = inputs.aiUsage.filter((u) => window.dayList.includes(u.day)).reduce((a, u) => a + u.answerCalls, 0);
  const capShare = inputs.aiBudgetUsd > 0 ? inputs.aiSpentTodayUsd / inputs.aiBudgetUsd : 0;
  const perQuestionBase = answered > 0 ? answered : answerCalls;

  const leadsDaily = new Map<string, number>();
  for (const l of curLeads) leadsDaily.set(israelDay(l.createdAt), (leadsDaily.get(israelDay(l.createdAt)) ?? 0) + 1);

  const questionEvents = questions.current + sumPoints(fillDaily(window.dayList, eventsByDay(inputs.events, 'search_submitted', 'events')));

  return {
    isDemo: Boolean(opts.isDemo),
    generatedAt: new Date(nowMs).toISOString(),
    period: { days: window.days, from: window.from, to: window.to, prevFrom: window.prevFrom, prevTo: window.prevTo },
    sparse: curLeads.length < SPARSE_MIN_LEADS && questionEvents < SPARSE_MIN_QUESTIONS,
    pipeline: pipelineSummary(inputs.leads, table, window),
    consults: {
      booked: periodDelta(booked.current, Math.round(booked.previous)),
      requests,
      daily: booked.series,
    },
    planMix: planMix(inputs, window, table),
    topLeads: {
      hotCount: periodDelta(hotCur, hotPrev),
      scoredShare: curLeads.length > 0 ? scored.length / curLeads.length : 0,
      avgScore: scored.length > 0 ? Math.round(scored.reduce((a, l) => a + (l.score ?? 0), 0) / scored.length) : null,
      top: hotList.slice(0, 3),
      usesScores: scored.length > 0,
    },
    partners: partnersSummary(inputs.partners, window.days),
    ai: {
      budgetUsd: inputs.aiBudgetUsd,
      spentTodayUsd: Math.round(inputs.aiSpentTodayUsd * 1e6) / 1e6,
      capShare,
      capStatus: inputs.aiBudgetUsd <= 0 ? 'off' : capShare >= 1 ? 'reached' : capShare >= 0.8 ? 'near' : 'ok',
      cost: periodDelta(Math.round(cost.current * 1e4) / 1e4, Math.round(cost.previous * 1e4) / 1e4),
      questions: periodDelta(questions.current, Math.round(questions.previous)),
      costPerQuestionUsd: perQuestionBase > 0 ? cost.current / perQuestionBase : null,
      daysAtCap: inputs.aiBudgetUsd > 0 ? cost.series.filter((p) => p.value >= inputs.aiBudgetUsd).length : 0,
      dailyCost: cost.series.map((p) => ({ date: p.date, value: Math.round(p.value * 1e4) / 1e4 })),
      dailyQuestions: questions.series,
    },
    leads: { total: periodDelta(curLeads.length, prevLeads.length), daily: fillDaily(window.dayList, leadsDaily) },
    hotLeads: hotList,
    unanswered: unanswered(inputs),
    pending: inputs.pending,
  };
}
