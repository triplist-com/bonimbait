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

import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';

const MEMBER = '00000000-0000-4000-8000-00000000aaaa';

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
