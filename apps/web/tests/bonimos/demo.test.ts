import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_FIXTURES, loadDemoFixture } from '@/lib/demo/fixtures';
import { bonimosDemo } from '@/lib/demo/fixtures/bonimos';
import { DEMO_VIEWS } from '@/lib/demo/views';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { estimateFromProfile } from '@/lib/planner/engine';
import { approvalCounts } from '@/lib/bonimos/approvals';
import { formatPct, plannedFromStageRows, projectBudget } from '@/lib/bonimos/budget';
import { milestoneStatus, nextMilestone } from '@/lib/bonimos/milestones';

const TODAY = '2026-10-15';

describe('Bonim.Os demo fixture', () => {
  const data = loadDemoFixture(bonimosDemo, { today: TODAY });
  const p = data.project;

  it('is the brief\'s project: 180 m² in the Shfela, at the shell stage, managed', () => {
    expect(p.mode).toBe('demo');
    expect(p.project).toMatchObject({ sizeM2: 180, regionSlug: 'shfela', stage: 'frame', mode: 'managed' });
    expect(p.people.map((x) => x.role).sort()).toEqual(['manager', 'owner']);
    const [manager, client] = [p.people.find((x) => x.role === 'manager')!, p.people.find((x) => x.role === 'owner')!];
    expect(manager.name.split(' ')[0]).not.toBe(client.name.split(' ')[0]);
    expect(p.viewer.role).toBe('manager');
  });

  it('runs +2.1% over the approved budget, version 3', () => {
    const { version, health } = projectBudget(p.versions, p.budgetItems);
    expect(version?.versionNo).toBe(3);
    expect(formatPct(health.variancePct)).toBe('+2.1%');
    expect(health.status).toBe('over');
    expect(p.versions.map((v) => v.basis)).toEqual(['planner', 'manual', 'manual']);
    expect(p.versions.slice(1).every((v) => v.note && v.note.length > 10)).toBe(true);
    // v1 is growth's planner estimate for this house.
    expect(p.versions[0].planned).toEqual(plannedFromStageRows(estimateFromProfile({ sizeM2: 180, regionSlug: 'shfela' }, DEFAULT_PRICE_BOOK).stages));
  });

  it('has a next milestone in progress, a pending payment approval and the manager\'s turn too', () => {
    const next = nextMilestone(p.milestones)!;
    expect(next.title).toBe('קומת קרקע ותקרה');
    expect(milestoneStatus(next, TODAY)).toBe('in_progress');
    expect(next.plannedEnd > TODAY).toBe(true);
    expect(approvalCounts(p.payments)).toEqual({ pendingReview: 1, pendingClient: 1, approvedUnpaid: 0 });
    const waiting = p.payments.find((r) => r.status === 'pending_client')!;
    expect(waiting).toMatchObject({ requested: 96_000, approved: 90_000 });
    expect(waiting.attachment?.id && p.documents.some((d) => d.id === waiting.attachment!.id)).toBe(true);
    // Every paid request is an actual in the budget.
    for (const r of p.payments.filter((x) => x.status === 'paid')) {
      expect(p.budgetItems.some((i) => i.kind === 'actual' && i.amount === r.approved && i.label?.includes(`#${r.number}`)), `#${r.number}`).toBe(true);
    }
    // Audit trails are well formed: each event starts where the last one ended.
    for (const r of p.payments) {
      expect(r.events[0].action).toBe('requested');
      for (let i = 1; i < r.events.length; i += 1) expect(r.events[i].fromStatus).toBe(r.events[i - 1].toStatus);
      expect(r.events.at(-1)!.toStatus).toBe(r.status);
    }
  });

  it('shows a few site photos (generated illustrations that exist) and a living log', () => {
    expect(p.photos.length).toBeGreaterThanOrEqual(4);
    for (const ph of p.photos) {
      expect(ph.url).toMatch(/^\/bonimos\/demo\/[a-z-]+\.svg$/);
      expect(existsSync(fileURLToPath(new URL(`../../public${ph.url}`, import.meta.url))), ph.url).toBe(true);
      expect(ph.caption).toBeTruthy();
    }
    const people = new Set(p.people.map((x) => x.userId));
    for (const a of p.activity) expect(a.actorId === null || people.has(a.actorId), a.action).toBe(true);
    expect(p.activity.some((a) => a.kind === 'note')).toBe(true);
    expect([...p.activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt))).toEqual(p.activity);
  });

  it('lists the project in the manager\'s workspace, plain JSON, deterministic and ready', () => {
    expect(data.workspace.some((w) => w.id === p.project.id && w.budget.variancePct != null && formatPct(w.budget.variancePct) === '+2.1%')).toBe(true);
    expect(data.workspace).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(loadDemoFixture(bonimosDemo, { today: TODAY, seed: 'x' })).toEqual(loadDemoFixture(bonimosDemo, { today: TODAY, seed: 'x' }));
    expect(DEMO_FIXTURES.bonimos).toBe(bonimosDemo);
    expect(DEMO_VIEWS.find((v) => v.slug === 'bonimos')).toMatchObject({ status: 'ready', pillar: 'P7', squad: 'bonimos' });
  });
});
