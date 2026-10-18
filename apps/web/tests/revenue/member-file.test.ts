/**
 * Integration (hub <-> revenue): a member's project file is their hub project,
 * and for a member who never onboarded, the stage and region they gave at
 * signup (profiles). The hub wins every fact it has.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  snapshot: vi.fn(),
  profile: null as null | { construction_stage: string | null; region_id: string | null },
  regions: new Map<string, string>([['r-1', 'sharon']]),
}));

vi.mock('@/lib/hub/server', () => ({ getMemberProjectSnapshot: h.snapshot }));
vi.mock('@/lib/supabase/admin', () => ({
  isServiceRoleConfigured: () => true,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () =>
            table === 'profiles'
              ? { data: h.profile, error: null }
              : { data: h.regions.has(value) ? { slug: h.regions.get(value) } : null, error: null },
        }),
      }),
    }),
  }),
}));

import { buildProjectSnapshot, consultFile } from '@/lib/hub/snapshot';
import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';
import { readProjectSnapshots } from '@/lib/project-file/collect';
import { buildProjectFile } from '@/lib/project-file/server';

const MEMBER = '00000000-0000-4000-8000-00000000aaaa';
const BIZ = '00000000-0000-4000-8000-0000000000b1';

afterEach(() => {
  h.snapshot.mockReset();
  h.profile = null;
});

describe('loadMemberProjectSnapshot (profile fallback)', () => {
  it("uses the profile's stage and region when the member has no hub project", async () => {
    h.snapshot.mockResolvedValueOnce(null);
    h.profile = { construction_stage: 'tender', region_id: 'r-1' };
    expect(await loadMemberProjectSnapshot(MEMBER)).toEqual({ version: 1, stage: 'permit', regionSlug: 'sharon' });
  });

  it('the hub project wins; the profile only fills what the project lacks', async () => {
    h.snapshot.mockResolvedValueOnce({ version: 1, stage: 'frame', sizeM2: 200, savedCount: 2, shortlistBusinessIds: [] });
    h.profile = { construction_stage: 'planning', region_id: 'r-1' };
    expect(await loadMemberProjectSnapshot(MEMBER)).toEqual({ version: 1, stage: 'frame', regionSlug: 'sharon', sizeM2: 200, savedCount: 2 });
  });

  it('null when neither says anything', async () => {
    h.snapshot.mockResolvedValueOnce(null);
    h.profile = { construction_stage: null, region_id: null };
    expect(await loadMemberProjectSnapshot(MEMBER)).toBeNull();
  });
});

describe('"תיק הפרויקט שלי" is exactly what the consult team sees (hub <-> revenue)', () => {
  it("the hub panel's file equals the file stored with a member's consult lead", async () => {
    // The member's hub project: planner-based budget v2, a saved video and a shortlisted pro.
    const hubFile = buildProjectSnapshot({
      project: { stage: 'permit', size_m2: 220, budget_min_agorot: 240_000_000, budget_max_agorot: 280_000_000, target_move_in: '2027-09-01' },
      regionSlug: 'sharon',
      currentVersion: {
        basis: 'planner',
        total_min_agorot: 255_000_000,
        total_max_agorot: 305_000_000,
        inputs: { planner_at: '2026-10-10T08:00:00.000Z', planner_inputs: { floors: 2 } },
        created_at: '2026-10-10T08:00:00.000Z',
      },
      saved: [
        { kind: 'video', ref: 'vluNH7GTkU4' },
        { kind: 'business', ref: BIZ },
      ],
    });
    // What's in their browser: questions to the advisor and a newer planner run.
    const store = new Map<string, string>([
      ['bb.advisor.recent', JSON.stringify([{ q: 'כמה עולים חלונות אלומיניום?', at: '2026-10-14T08:00:00.000Z' }])],
      ['bb.planner.last', JSON.stringify({ totalMin: 2_600_000, totalMax: 3_100_000, at: '2026-10-14T09:00:00.000Z', inputs: { sizeM2: 220 } })],
    ]);
    const browser = readProjectSnapshots({ getItem: (k: string) => store.get(k) ?? null });

    const shown = consultFile('member', hubFile, browser);
    h.snapshot.mockResolvedValueOnce(hubFile);
    const stored = await buildProjectFile({ clientFile: browser, memberId: MEMBER, visitor: { anonId: null, sessionId: null } });
    expect(shown).toEqual(stored.file);
    expect(shown).toMatchObject({
      stage: 'permit',
      regionSlug: 'sharon',
      sizeM2: 220,
      questions: [{ q: 'כמה עולים חלונות אלומיניום?', at: '2026-10-14T08:00:00.000Z' }],
      plannerEstimate: { totalMin: 2_600_000, at: '2026-10-14T09:00:00.000Z' }, // the newer run wins
      shortlistBusinessIds: [BIZ],
      savedCount: 1,
    });
  });

  it("the demo shows its fixture, never the visitor's browser", () => {
    const fixture = { version: 1 as const, stage: 'permit' as const, sizeM2: 220 };
    expect(consultFile('demo', fixture, { version: 1, stage: 'frame', questions: [{ q: 'x?', at: '2026-10-14T08:00:00.000Z' }] })).toEqual(fixture);
  });
});
