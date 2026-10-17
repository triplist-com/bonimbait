/**
 * Integration (advisor <- hub): who is asking. The browser's bb.hub.draft wins;
 * a signed-in member's project file fills what it lacks (a member's draft
 * moves into the account on login, so the browser usually has nothing).
 */
import { describe, expect, it, vi } from 'vitest';
import { builderContext } from '@/lib/advisor/builder-context';
import type { Member } from '@/lib/advisor/threads';

const member = { user: { id: '00000000-0000-4000-8000-00000000aaaa' }, db: {} } as unknown as Member;

describe('builderContext', () => {
  it('uses the request alone for anonymous visitors', async () => {
    const load = vi.fn();
    expect(await builderContext({ region: 'sharon' }, null, load)).toEqual({ regionSlug: 'sharon' });
    expect(load).not.toHaveBeenCalled();
  });

  it("fills a member's missing facts from their project file; the request wins what it has", async () => {
    const load = vi.fn(async () => ({ version: 1 as const, stage: 'frame' as const, regionSlug: 'center' }));
    expect(await builderContext({}, member, load)).toEqual({ regionSlug: 'center', stage: 'frame' });
    expect(load).toHaveBeenCalledWith(member.user.id);
    expect(await builderContext({ region: 'sharon' }, member, load)).toEqual({ regionSlug: 'sharon', stage: 'frame' });
  });

  it('skips the lookup when the request already knows both, and survives a failing lookup', async () => {
    const load = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await builderContext({ region: 'sharon', stage: 'permit' }, member, load)).toEqual({ regionSlug: 'sharon', stage: 'permit' });
    expect(load).not.toHaveBeenCalled();
    expect(await builderContext({ stage: 'permit' }, member, load)).toEqual({ stage: 'permit' });
  });
});
