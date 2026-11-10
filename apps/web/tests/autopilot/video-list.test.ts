import { describe, expect, it } from 'vitest';
import { listTimeoutMs } from '@/lib/autopilot/video-list';

describe('listTimeoutMs', () => {
  it('waits longer while next build pre-renders the homepage', () => {
    expect(listTimeoutMs({ NEXT_PHASE: 'phase-production-build' })).toBe(15_000);
  });

  it('stays short while serving requests', () => {
    expect(listTimeoutMs({})).toBe(1_500);
    expect(listTimeoutMs({ NEXT_PHASE: 'phase-production-server' })).toBe(1_500);
  });
});
