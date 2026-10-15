import 'server-only';

import { isEnabled } from '@/lib/flags';
import { dailyBudgetUsd } from '@/lib/guard/aiBudget';
import { dailyTotals } from './build';
import { commandUserDb } from './db';
import { israelDay, israelMidnight, periodDelta, periodWindow, utcDayOf } from './period';
import type { Delta, PeriodDays, Point } from './types';

/**
 * /admin/search-stats/ on first-party analytics (platform_events), replacing
 * the dashboard that proxied to the retired FastAPI backend.
 */
export type SearchStats = {
  period: { days: PeriodDays; from: string; to: string };
  searches: Delta;
  questions: Delta;
  answered: Delta;
  /** Questions that got sources only (rate limit, budget, AI off) or failed. */
  unanswered: number;
  dailySearches: Point[];
  dailyQuestions: Point[];
  topSearches: { value: string; events: number; visitors: number }[];
  topQuestions: { question: string; asks: number; avgConfidence: number | null; zeroSourceAnswers: number }[];
  ai: { costUsd: number; spentTodayUsd: number; budgetUsd: number };
};

export async function loadSearchStats(periodDays: PeriodDays, now = Date.now()): Promise<SearchStats> {
  const db = commandUserDb();
  const window = periodWindow(now, periodDays);
  const nowIso = new Date(now).toISOString();
  const weekStart = new Date(now - 7 * 86_400_000).toISOString();
  const log = (label: string) => (err: { message: string }) => console.error(`[command] search stats ${label}: ${err.message}`);

  const [daily, topSearches, topQuestions, ai] = await Promise.all([
    db
      .rpc('platform_daily_counts', { p_from: window.prevFrom, p_to: nowIso, p_names: ['search_submitted', 'answer_requested', 'answer_completed'] })
      .then((r) => (r.error ? (log('daily')(r.error), []) : r.data ?? [])),
    db
      .rpc('platform_top_props', { p_name: 'search_submitted', p_prop: 'query', p_from: window.from, p_to: nowIso, p_limit: 20 })
      .then((r) => (r.error ? (log('top searches')(r.error), []) : r.data ?? [])),
    db
      .rpc('command_question_stats', { p_from: window.from, p_to: nowIso, p_week_start: weekStart, p_limit: 20 })
      .then((r) => (r.error ? (log('top questions')(r.error), []) : r.data ?? [])),
    db
      .from('ai_usage')
      .select('day, cost_usd')
      .gte('day', utcDayOf(window.from))
      .then((r) => (r.error ? (log('ai usage')(r.error), []) : r.data ?? [])),
  ]);

  const share = Math.min(1, Math.max(0, (now - israelMidnight(israelDay(now))) / 86_400_000));
  const byName = (name: string) => {
    const m = new Map<string, number>();
    for (const d of daily) if (d.name === name) m.set(d.day, (m.get(d.day) ?? 0) + Number(d.events));
    return dailyTotals(window, m, share);
  };
  const searches = byName('search_submitted');
  const questions = byName('answer_requested');
  const answered = byName('answer_completed');
  const today = utcDayOf(now);
  return {
    period: { days: periodDays, from: window.from, to: nowIso },
    searches: periodDelta(searches.current, Math.round(searches.previous)),
    questions: periodDelta(questions.current, Math.round(questions.previous)),
    answered: periodDelta(answered.current, Math.round(answered.previous)),
    unanswered: Math.max(0, questions.current - answered.current),
    dailySearches: searches.series,
    dailyQuestions: questions.series,
    topSearches: topSearches.map((r) => ({ value: r.value, events: Number(r.events), visitors: Number(r.visitors) })),
    topQuestions: topQuestions.map((r) => ({
      question: r.question,
      asks: Number(r.asks),
      avgConfidence: r.avg_confidence == null ? null : Number(r.avg_confidence),
      zeroSourceAnswers: Number(r.zero_source_answers),
    })),
    ai: {
      costUsd: ai.filter((r) => r.day >= utcDayOf(window.from)).reduce((a, r) => a + Number(r.cost_usd), 0),
      spentTodayUsd: ai.filter((r) => r.day === today).reduce((a, r) => a + Number(r.cost_usd), 0),
      budgetUsd: isEnabled('aiAnswers') ? dailyBudgetUsd() : 0,
    },
  };
}
