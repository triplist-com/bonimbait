/**
 * ADMIN_EMAILS promotes an account only after its owner proved the address
 * (lib/auth/roles.ts isProvenAdminEmail): a confirmed email, or a Google
 * identity that verified the same address. Anyone can sign up with an
 * unclaimed admin address, so an unconfirmed session must never become admin,
 * and getProfile() returns the stored role (the database is the source of truth).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  stored: null as Record<string, unknown> | null,
  promoted: [] as string[],
}));

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T>(fn: T) => fn }));
vi.mock('next/navigation', () => ({ redirect: () => undefined }));
vi.mock('@/lib/supabase/env', () => ({ isSupabaseConfigured: () => true }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.stored, error: null }) }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  isServiceRoleConfigured: () => true,
  createAdminClient: () => ({
    from: () => ({
      upsert: async () => ({ error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          neq: async () => {
            state.promoted.push(id);
            if (state.stored) state.stored = { ...state.stored, ...patch };
            return { error: null };
          },
        }),
      }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.stored, error: null }) }) }),
    }),
  }),
}));

import { isProvenAdminEmail } from '@/lib/auth/roles';
import { getProfile } from '@/lib/auth/session';

const ADMIN = 'owner@bonimbait.test';

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', `${ADMIN}, second@bonimbait.test`);
  state.promoted = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isProvenAdminEmail', () => {
  it('needs the address in ADMIN_EMAILS and proven', () => {
    expect(isProvenAdminEmail({ email: ADMIN, email_confirmed_at: '2026-10-17T10:00:00Z' })).toBe(true);
    expect(isProvenAdminEmail({ email: 'OWNER@BonimBait.test', email_confirmed_at: '2026-10-17T10:00:00Z' })).toBe(true);
    expect(isProvenAdminEmail({ email: ADMIN, email_confirmed_at: null })).toBe(false);
    expect(isProvenAdminEmail({ email: ADMIN })).toBe(false);
    expect(isProvenAdminEmail({ email: 'someone@bonimbait.test', email_confirmed_at: '2026-10-17T10:00:00Z' })).toBe(false);
    expect(isProvenAdminEmail(null)).toBe(false);
  });

  it('accepts a Google identity that verified the same address', () => {
    const google = (email: string, verified: boolean) => ({
      email: ADMIN,
      identities: [{ provider: 'google', identity_data: { email, email_verified: verified } }],
    });
    expect(isProvenAdminEmail(google(ADMIN, true))).toBe(true);
    expect(isProvenAdminEmail(google(ADMIN, false))).toBe(false);
    expect(isProvenAdminEmail(google('other@gmail.com', true))).toBe(false);
    expect(
      isProvenAdminEmail({ email: ADMIN, identities: [{ provider: 'email', identity_data: { email: ADMIN, email_verified: true } }] }),
    ).toBe(false);
  });
});

describe('getProfile', () => {
  it('never promotes an unconfirmed session with an admin address', async () => {
    state.user = { id: 'u-1', email: ADMIN, email_confirmed_at: null, identities: [] };
    state.stored = { id: 'u-1', email: ADMIN, role: 'member' };
    const profile = await getProfile();
    expect(profile?.role).toBe('member');
    expect(state.promoted).toEqual([]);
  });

  it('promotes a confirmed admin address in the database, and returns the stored role', async () => {
    state.user = { id: 'u-2', email: ADMIN, email_confirmed_at: '2026-10-17T10:00:00Z', identities: [] };
    state.stored = { id: 'u-2', email: ADMIN, role: 'member' };
    const profile = await getProfile();
    expect(state.promoted).toEqual(['u-2']);
    expect(profile?.role).toBe('admin');
  });

  it('grants nothing the database doesn\'t hold', async () => {
    state.user = { id: 'u-3', email: 'member@bonimbait.test', email_confirmed_at: '2026-10-17T10:00:00Z', identities: [] };
    state.stored = { id: 'u-3', email: 'member@bonimbait.test', role: 'pro' };
    expect((await getProfile())?.role).toBe('pro');
    expect(state.promoted).toEqual([]);
  });
});
