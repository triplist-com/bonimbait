import { describe, expect, it } from 'vitest';
import { summarizeBudget } from '@/lib/hub/budget';
import { STAGE_CONTENT } from '@/lib/hub/content';
import { DEMO_FIXTURES, loadDemoFixture } from '@/lib/demo/fixtures';
import { hubDemo } from '@/lib/demo/fixtures/hub';
import { DEMO_VIEWS } from '@/lib/demo/views';
import { STAGE_IDS } from '@/lib/hub/types';

const TODAY = '2026-10-15';

describe('hub demo fixture (משפחת לוי)', () => {
  const data = loadDemoFixture(hubDemo, { today: TODAY });

  it('matches the brief: 220 m² in the Sharon, at the היתר stage, ₪2.6M', () => {
    expect(data.mode).toBe('demo');
    expect(data.project).toMatchObject({ title: 'הבית של משפחת לוי', stage: 'permit', regionSlug: 'sharon', sizeM2: 220 });
    expect(data.project.budgetRangeNis?.[1]).toBe(2_600_000);
    expect(data.file).toMatchObject({ version: 1, stage: 'permit', regionSlug: 'sharon', sizeM2: 220 });
  });

  it('has saved items, a shortlist, a budget with actuals and a few tasks', () => {
    expect(data.saved.length).toBeGreaterThanOrEqual(4);
    expect(data.shortlist.length).toBeGreaterThanOrEqual(3);
    expect(data.budgetItems.some((i) => i.kind === 'actual')).toBe(true);
    expect(data.budgetItems.filter((i) => i.kind === 'quote' && i.category === 'frame')).toHaveLength(3);
    expect(data.tasks.length).toBeGreaterThanOrEqual(3);
    expect(data.documents.length).toBeGreaterThanOrEqual(3);
    for (const id of data.checklistDone) expect(id.split('.')[0] in STAGE_CONTENT).toBe(true);
  });

  it('tells a budget story: levies over, the shell quote under', () => {
    const s = summarizeBudget(data.budgetVersion!.planned, data.budgetItems);
    expect(s.categories.find((c) => c.id === 'fees')!.status).toBe('over');
    expect(s.categories.find((c) => c.id === 'frame')!.status).toBe('under');
    expect(s.categories.find((c) => c.id === 'design')!.status).toBe('on');
  });

  it('uses real content picks for every stage, and stays plain JSON', () => {
    for (const id of STAGE_IDS) {
      expect(data.picks[id].videos.length).toBeGreaterThan(0);
      expect(data.picks[id].articles.length).toBeGreaterThan(0);
    }
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('is deterministic and registered as ready', () => {
    expect(loadDemoFixture(hubDemo, { today: TODAY, seed: 'x' })).toEqual(loadDemoFixture(hubDemo, { today: TODAY, seed: 'x' }));
    expect(DEMO_FIXTURES.hub).toBe(hubDemo);
    expect(DEMO_VIEWS.find((v) => v.slug === 'hub')?.status).toBe('ready');
  });
});
