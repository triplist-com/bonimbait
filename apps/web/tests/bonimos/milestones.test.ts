import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { STAGE_IDS } from '@/lib/hub/types';
import {
  STAGE_MILESTONES,
  addDaysIso,
  barPosition,
  groupByStage,
  milestoneStatus,
  nextMilestone,
  scheduleSummary,
  scheduleTemplate,
  slipDays,
  timelineRange,
} from '@/lib/bonimos/milestones';
import type { MilestoneView } from '@/lib/bonimos/types';

const TODAY = '2026-10-15';

function ms(id: string, over: Partial<MilestoneView>): MilestoneView {
  return {
    id,
    stage: 'frame',
    title: id,
    plannedStart: '2026-10-01',
    plannedEnd: '2026-10-20',
    actualStart: null,
    actualEnd: null,
    note: null,
    sortOrder: 0,
    ...over,
  };
}

describe('milestone status and slip', () => {
  it('done, late, in progress, due soon, upcoming', () => {
    expect(milestoneStatus(ms('a', { actualStart: '2026-10-01', actualEnd: '2026-10-22' }), TODAY)).toBe('done');
    expect(milestoneStatus(ms('b', { plannedEnd: '2026-10-14' }), TODAY)).toBe('late');
    expect(milestoneStatus(ms('c', { actualStart: '2026-10-03' }), TODAY)).toBe('in_progress');
    expect(milestoneStatus(ms('d', { plannedStart: '2026-10-25', plannedEnd: '2026-11-20' }), TODAY)).toBe('due_soon');
    expect(milestoneStatus(ms('e', { plannedStart: '2026-12-01', plannedEnd: '2026-12-20' }), TODAY)).toBe('upcoming');
    // Started and past its planned end: late, not just "in progress".
    expect(milestoneStatus(ms('f', { actualStart: '2026-10-01', plannedEnd: '2026-10-10' }), TODAY)).toBe('late');
  });

  it('slip is days behind plan (negative = ahead)', () => {
    expect(slipDays(ms('a', { actualStart: '2026-10-01', actualEnd: '2026-10-23' }), TODAY)).toBe(3);
    expect(slipDays(ms('b', { actualStart: '2026-10-01', actualEnd: '2026-10-18' }), TODAY)).toBe(-2);
    expect(slipDays(ms('c', { plannedEnd: '2026-10-11' }), TODAY)).toBe(4);
    expect(slipDays(ms('d', {}), TODAY)).toBe(0);
  });

  it('the next milestone is the earliest planned end that is not done', () => {
    const list = [
      ms('done', { plannedEnd: '2026-09-01', actualStart: '2026-08-01', actualEnd: '2026-09-02' }),
      ms('later', { plannedEnd: '2026-12-01' }),
      ms('next', { plannedEnd: '2026-10-27' }),
    ];
    expect(nextMilestone(list)?.id).toBe('next');
    expect(nextMilestone([list[0]])).toBeNull();
  });

  it('summarises the schedule', () => {
    const s = scheduleSummary(
      [
        ms('a', { actualStart: '2026-09-01', actualEnd: '2026-09-25', plannedEnd: '2026-09-22' }),
        ms('b', { actualStart: '2026-09-25', actualEnd: '2026-10-05', plannedEnd: '2026-10-08' }),
        ms('c', { plannedEnd: '2026-10-12' }),
        ms('d', { actualStart: '2026-10-10', plannedEnd: '2026-10-30' }),
      ],
      TODAY,
    );
    expect(s).toEqual({ total: 4, done: 2, late: 1, inProgress: 1, onTimeShare: 0.5, maxSlip: 3 });
  });
});

describe('the Gantt-lite geometry', () => {
  const list = [
    ms('p1', { stage: 'permit', plannedStart: '2026-07-01', plannedEnd: '2026-08-15', actualStart: '2026-07-03', actualEnd: '2026-08-20' }),
    ms('f1', { stage: 'frame', plannedStart: '2026-09-01', plannedEnd: '2026-09-30', actualStart: '2026-09-02', actualEnd: '2026-10-02' }),
    ms('f2', { stage: 'frame', plannedStart: '2026-10-01', plannedEnd: '2026-10-27', actualStart: '2026-10-03' }),
    ms('f3', { stage: 'frame', plannedStart: '2026-11-01', plannedEnd: '2027-01-10' }),
  ];

  it('groups by stage in the owner\'s order, with spans', () => {
    const groups = groupByStage([...list].reverse());
    expect(groups.map((g) => [g.stage, g.milestones.map((m) => m.id)])).toEqual([
      ['permit', ['p1']],
      ['frame', ['f1', 'f2', 'f3']],
    ]);
    expect(groups[0]).toMatchObject({ plannedStart: '2026-07-01', plannedEnd: '2026-08-15', actualEnd: '2026-08-20', done: 1 });
    expect(groups[1]).toMatchObject({ plannedStart: '2026-09-01', plannedEnd: '2027-01-10', actualStart: '2026-09-02', actualEnd: null, done: 1 });
  });

  it('covers whole months from the first date to the last, with today on it', () => {
    const r = timelineRange(list, TODAY);
    expect(r.start).toBe('2026-07-01');
    expect(r.end).toBe('2027-01-31');
    expect(r.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    expect(r.months.reduce((a, m) => a + m.widthPct, 0)).toBeCloseTo(100, 6);
    expect(r.months[0].startPct).toBe(0);
    expect(r.todayPct).toBeGreaterThan(r.months[3].startPct);
    expect(r.todayPct).toBeLessThan(r.months[4].startPct);
  });

  it('places bars inside the range, never thinner than the minimum', () => {
    const r = timelineRange(list, TODAY);
    const full = barPosition(r, r.start, r.end);
    expect(full.startPct).toBe(0);
    expect(full.widthPct).toBeCloseTo(100, 6);
    const day = barPosition(r, '2026-10-15', '2026-10-15');
    expect(day.widthPct).toBe(1.2);
    const clipped = barPosition(r, '2026-01-01', '2026-07-10');
    expect(clipped.startPct).toBe(0);
    const late = barPosition(r, '2027-01-31', '2027-01-31');
    expect(late.startPct + late.widthPct).toBeLessThanOrEqual(100);
  });
});

describe('a first schedule from the price book', () => {
  const drafts = scheduleTemplate('frame', '2026-10-15', DEFAULT_PRICE_BOOK.timelineMonths);

  it('runs from the current stage to the keys with the owner\'s milestones', () => {
    const stages = Array.from(new Set(drafts.map((d) => d.stage)));
    expect(stages).toEqual(STAGE_IDS.slice(STAGE_IDS.indexOf('frame')));
    expect(drafts.filter((d) => d.stage === 'frame').map((d) => d.title)).toEqual([...STAGE_MILESTONES.frame]);
    expect(drafts[0].plannedStart).toBe('2026-10-15');
  });

  it('is back to back, ordered, and sized by the price book months', () => {
    for (let i = 1; i < drafts.length; i += 1) {
      expect(drafts[i].plannedStart > drafts[i - 1].plannedEnd, `${drafts[i].title}`).toBe(true);
      expect(drafts[i].sortOrder).toBeGreaterThan(drafts[i - 1].sortOrder);
    }
    for (const d of drafts) expect(d.plannedStart <= d.plannedEnd).toBe(true);
    // The shell is 4–5 months in the price book: about 137 days for its 5 milestones.
    const frame = drafts.filter((d) => d.stage === 'frame');
    const frameDays = (Date.parse(frame.at(-1)!.plannedEnd) - Date.parse(frame[0].plannedStart)) / 86_400_000 + 1;
    expect(frameDays).toBeGreaterThanOrEqual(130);
    expect(frameDays).toBeLessThanOrEqual(140);
    // Moving in is a moment in the price book ([0, 0]): it still gets real time.
    expect(drafts.filter((d) => d.stage === 'moving-in')).toHaveLength(3);
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});
