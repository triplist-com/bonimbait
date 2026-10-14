/**
 * Endpoint auth: the cron watcher needs `Bearer ${CRON_SECRET}` (401
 * otherwise, also when no secret is configured), the admin endpoints need a
 * staff session (401 signed out, 403 for members and pros), and refused
 * requests never reach detection or the pipeline.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/lib/db/types';

const state = vi.hoisted(() => ({
  profile: null as null | { id: string; email: string; role: Role },
  watch: vi.fn(),
  process: vi.fn(),
}));

vi.mock('@/lib/auth/session', async () => {
  const { hasRole } = await import('@/lib/auth/roles');
  return {
    // Same contract as the real checkRole (lib/auth/session.ts).
    checkRole: async (role: Role) => {
      if (!state.profile) return { ok: false, status: 401 };
      if (!hasRole(state.profile.role, role)) return { ok: false, status: 403 };
      return { ok: true, profile: state.profile };
    },
  };
});
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/autopilot/db', () => ({ serviceDb: () => ({}), asAutopilotDb: (c: object) => c }));
vi.mock('@/lib/autopilot/run', () => ({ runWatch: state.watch }));
vi.mock('@/lib/autopilot/pipeline', () => ({ processSource: state.process }));

import { GET as cron } from '@/app/api/cron/youtube-watch/route';
import { POST as check } from '@/app/api/admin/autopilot/check/route';
import { POST as processRoute } from '@/app/api/admin/autopilot/process/route';
import { POST as transcribeAudioRoute } from '@/app/api/admin/autopilot/transcribe-audio/route';
import { NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/autopilot/cron-auth';

const ID = '7f0c2d0e-1a2b-4c3d-8e9f-0123456789ab';
const REPORT = { inserted: [], alreadyKnown: 0, inStaticIndex: 0, feeds: [], checkedAt: 'x', autoProcess: { enabled: false, processed: [] } };

function cronRequest(auth?: string) {
  return new NextRequest('http://localhost/api/cron/youtube-watch', { headers: auth ? { authorization: auth } : {} });
}
function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  state.profile = null;
  state.watch.mockReset().mockResolvedValue(REPORT);
  state.process.mockReset().mockResolvedValue({ ok: true, status: 'indexed', message: 'ok', costMicros: 1 });
  process.env.CRON_SECRET = 'cron-test-secret';
  delete process.env.AUTOPILOT_AUDIO_TRANSCRIPTION;
});

describe('cron: /api/cron/youtube-watch', () => {
  it('returns 401 without a secret', async () => {
    const res = await cron(cronRequest());
    expect(res.status).toBe(401);
    expect(state.watch).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong secret', async () => {
    expect((await cron(cronRequest('Bearer nope'))).status).toBe(401);
    expect((await cron(cronRequest('cron-test-secret'))).status).toBe(401);
    expect(state.watch).not.toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET is not configured, whatever the header', async () => {
    delete process.env.CRON_SECRET;
    expect((await cron(cronRequest('Bearer undefined'))).status).toBe(401);
    expect((await cron(cronRequest('Bearer '))).status).toBe(401);
    expect(isAuthorizedCron('Bearer x', '')).toBe(false);
  });

  it('runs the watcher with the right secret', async () => {
    const res = await cron(cronRequest('Bearer cron-test-secret'));
    expect(res.status).toBe(200);
    expect(state.watch).toHaveBeenCalledWith(expect.anything(), { via: 'cron' });
    expect(await res.json()).toEqual(REPORT);
  });
});

describe('admin endpoints', () => {
  const cases = [
    ['check channel now', () => check()],
    ['process', () => processRoute(post('/api/admin/autopilot/process', { id: ID }))],
  ] as const;

  it.each(cases)('%s: 401 when signed out', async (_name, call) => {
    expect((await call()).status).toBe(401);
    expect(state.watch).not.toHaveBeenCalled();
    expect(state.process).not.toHaveBeenCalled();
  });

  it.each(cases)('%s: 403 for members and pros', async (_name, call) => {
    for (const role of ['member', 'pro'] as const) {
      state.profile = { id: 'u', email: 'u@bonimbait.test', role };
      expect((await call()).status).toBe(403);
    }
    expect(state.watch).not.toHaveBeenCalled();
    expect(state.process).not.toHaveBeenCalled();
  });

  it('lets editors check the channel (detection only, no auto-processing)', async () => {
    state.profile = { id: 'e', email: 'e@bonimbait.test', role: 'editor' };
    const res = await check();
    expect(res.status).toBe(200);
    expect(state.watch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ via: 'admin', config: expect.objectContaining({ autoProcess: false }) }));
  });

  it('lets admins process a source and validates the id', async () => {
    state.profile = { id: 'a', email: 'a@bonimbait.test', role: 'admin' };
    const ok = await processRoute(post('/api/admin/autopilot/process', { id: ID }));
    expect(ok.status).toBe(200);
    expect(state.process).toHaveBeenCalledWith(ID, expect.anything());
    expect((await processRoute(post('/api/admin/autopilot/process', { id: 'drop table' }))).status).toBe(400);
  });

  it('keeps audio transcription off unless enabled, and staff-only when on', async () => {
    state.profile = { id: 'a', email: 'a@bonimbait.test', role: 'admin' };
    expect((await transcribeAudioRoute(post('/api/admin/autopilot/transcribe-audio', { id: ID, path: `${ID}/a.mp3` }))).status).toBe(404);
    process.env.AUTOPILOT_AUDIO_TRANSCRIPTION = 'true';
    state.profile = { id: 'm', email: 'm@bonimbait.test', role: 'member' };
    expect((await transcribeAudioRoute(post('/api/admin/autopilot/transcribe-audio', { id: ID, path: `${ID}/a.mp3` }))).status).toBe(403);
    state.profile = { id: 'a', email: 'a@bonimbait.test', role: 'admin' };
    // Paths outside the source's folder are refused before any storage access.
    expect((await transcribeAudioRoute(post('/api/admin/autopilot/transcribe-audio', { id: ID, path: 'other/a.mp3' }))).status).toBe(400);
  });
});
