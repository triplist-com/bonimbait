import { describe, expect, it } from 'vitest';
import { CHECKLIST_ITEM_IDS, STAGE_CONTENT, durationLabel, findChecklistItem, isChecklistItemId } from '@/lib/hub/content';
import {
  checklistProgress,
  isStageComplete,
  journeyProgress,
  nextStage,
  paceCheck,
  stageStatus,
  weeklyActions,
} from '@/lib/hub/roadmap';
import { STAGE_IDS } from '@/lib/hub/types';

// Same rule as the hub_checklist_state.item_id CHECK constraint.
const ITEM_ID_RE = /^[a-z][a-z-]*\.[a-z0-9][a-z0-9-]*$/;

describe('stage content', () => {
  it('covers the owner\'s 7 stages with 6-10 checklist items each', () => {
    expect(Object.keys(STAGE_CONTENT)).toEqual([...STAGE_IDS]);
    for (const id of STAGE_IDS) {
      const s = STAGE_CONTENT[id];
      expect(s.checklist.length).toBeGreaterThanOrEqual(6);
      expect(s.checklist.length).toBeLessThanOrEqual(10);
      expect(s.questions.length).toBeGreaterThanOrEqual(2);
      expect(s.duration.minMonths).toBeLessThanOrEqual(s.duration.maxMonths);
      expect(s.whatHappens.length).toBeGreaterThan(40);
      expect(s.watchOut.length).toBeGreaterThan(20);
    }
  });

  it('uses stable, unique, DB-valid item ids prefixed with their stage', () => {
    const all = STAGE_IDS.flatMap((id) => STAGE_CONTENT[id].checklist.map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
    expect(CHECKLIST_ITEM_IDS.size).toBe(all.length);
    for (const id of STAGE_IDS) {
      for (const item of STAGE_CONTENT[id].checklist) {
        expect(item.id).toMatch(ITEM_ID_RE);
        expect(item.id.length).toBeLessThanOrEqual(80);
        expect(item.id.startsWith(`${id}.`)).toBe(true);
      }
    }
    expect(isChecklistItemId('permit.compare-quotes')).toBe(true);
    expect(isChecklistItemId('permit.nope')).toBe(false);
    expect(findChecklistItem('frame.rebar')?.stage).toBe('frame');
  });

  it('links only inside the site, with trailing slashes', () => {
    for (const id of STAGE_IDS) {
      for (const item of STAGE_CONTENT[id].checklist) {
        if (!item.link) continue;
        expect(item.link.href).toMatch(/^\/[^/].*\/$/);
        expect(item.link.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('writes no "AI" into builder copy', () => {
    const text = JSON.stringify(STAGE_CONTENT);
    expect(text).not.toMatch(/\bAI\b|בינה מלאכותית/);
  });

  it('labels durations in Hebrew, with the range isolated LTR', () => {
    expect(durationLabel('planning')).toBe('⁦3–⁠8⁩ חודשים');
  });
});

describe('roadmap', () => {
  it('marks stages before the current one as done', () => {
    expect(stageStatus('purchase', 'permit')).toBe('done');
    expect(stageStatus('permit', 'permit')).toBe('current');
    expect(stageStatus('frame', 'permit')).toBe('upcoming');
    expect(stageStatus('frame', null)).toBe('upcoming');
    expect(nextStage('permit')).toBe('frame');
    expect(nextStage('moving-in')).toBeNull();
  });

  it('counts checklist progress per stage and for the journey', () => {
    const done = new Set(['permit.submit', 'permit.fees', 'frame.rebar']);
    expect(checklistProgress('permit', done)).toEqual({ done: 2, total: STAGE_CONTENT.permit.checklist.length });
    expect(journeyProgress(new Set())).toBe(0);
    expect(journeyProgress(new Set(CHECKLIST_ITEM_IDS))).toBe(1);
  });

  it('suggests the next 3 open items of the current stage this week', () => {
    const actions = weeklyActions('permit', new Set(['permit.submit']));
    expect(actions.map((a) => a.id)).toEqual(['permit.fees', 'permit.tender', 'permit.compare-quotes']);
    expect(actions.every((a) => a.stage === 'permit')).toBe(true);
  });

  it('rolls into the next stage when the current one is almost done', () => {
    const permitIds = STAGE_CONTENT.permit.checklist.map((i) => i.id);
    const done = new Set(permitIds.slice(0, -1));
    const actions = weeklyActions('permit', done);
    expect(actions[0].id).toBe(permitIds[permitIds.length - 1]);
    expect(actions.slice(1).every((a) => a.stage === 'frame')).toBe(true);
    expect(isStageComplete('permit', new Set(permitIds))).toBe(true);
    expect(weeklyActions('moving-in', new Set(CHECKLIST_ITEM_IDS))).toEqual([]);
  });
});

describe('paceCheck', () => {
  const today = '2026-10-15';
  it('is unknown without a target', () => {
    expect(paceCheck('permit', null, today).status).toBe('unknown');
  });
  it('flags a target that already passed', () => {
    expect(paceCheck('finishing', '2026-01', today).status).toBe('past');
  });
  it('flags a tight target for the stage', () => {
    const check = paceCheck('permit', '2027-03', today);
    expect(check.status).toBe('tight');
    expect(check.monthsLeft).toBe(5);
  });
  it('is on track inside the typical range, roomy beyond it', () => {
    expect(paceCheck('permit', '2028-10', today).status).toBe('on-track');
    expect(paceCheck('moving-in', '2029-01', today).status).toBe('roomy');
    expect(paceCheck('permit', '2028-10', today).daysLeft).toBeGreaterThan(700);
  });
});
