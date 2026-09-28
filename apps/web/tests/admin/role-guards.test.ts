/**
 * Every admin server action must refuse callers without the right role,
 * before touching the database. The action modules are discovered from
 * lib/admin/actions/, so a new action that skips adminAction() fails here.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/lib/db/types';

const state = vi.hoisted(() => ({ profile: null as null | { id: string; email: string; role: Role }, dbCalls: 0 }));

vi.mock('@/lib/auth/session', () => ({
  getProfile: async () => state.profile,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    state.dbCalls += 1;
    // Any query on this stub fails loudly: guarded actions must never get here.
    return new Proxy({}, { get: () => () => { throw new Error('db touched'); } });
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { FORBIDDEN_MESSAGE, SIGNED_OUT_MESSAGE, adminAction, authorize } from '@/lib/admin/guard';

const actionsDir = join(__dirname, '../../lib/admin/actions');
const modules = readdirSync(actionsDir).filter((f) => f.endsWith('.ts'));

/** Actions that need the admin role (editors are refused too). */
const ADMIN_ONLY = new Set([
  'approveBusinessRequest',
  'rejectBusinessRequest',
  'deleteRegion',
  'setOrderStatus',
  'changeMemberRole',
]);

async function loadActions(): Promise<Array<[string, (...args: unknown[]) => Promise<{ ok: boolean; error?: string }>]>> {
  const out: Array<[string, (...args: unknown[]) => Promise<{ ok: boolean; error?: string }>]> = [];
  for (const file of modules) {
    const mod = (await import(join(actionsDir, file))) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function') out.push([`${file}:${name}`, value as never]);
    }
  }
  return out;
}

const fd = () => {
  const f = new FormData();
  f.set('id', '00000000-0000-0000-0000-000000000000');
  f.set('title', 'x');
  f.set('name', 'x');
  f.set('status', 'published');
  return f;
};

beforeEach(() => {
  state.profile = null;
  state.dbCalls = 0;
});

describe('admin server actions refuse non-staff', () => {
  it('discovers the action modules', async () => {
    const actions = await loadActions();
    expect(modules.length).toBeGreaterThanOrEqual(6);
    expect(actions.length).toBeGreaterThanOrEqual(30);
  });

  it.each([
    ['signed out', null, SIGNED_OUT_MESSAGE],
    ['member', 'member', FORBIDDEN_MESSAGE],
    ['pro', 'pro', FORBIDDEN_MESSAGE],
  ] as const)('%s: every action refuses without touching the DB', async (_label, role, message) => {
    state.profile = role ? { id: 'u1', email: 'u@test', role } : null;
    for (const [name, action] of await loadActions()) {
      const res = await action(fd(), fd());
      expect(res, name).toEqual({ ok: false, error: message });
    }
    expect(state.dbCalls).toBe(0);
  });

  it('editor: admin-only actions refuse, the rest pass the guard', async () => {
    state.profile = { id: 'u1', email: 'e@test', role: 'editor' };
    for (const [name, action] of await loadActions()) {
      const short = name.split(':')[1];
      state.dbCalls = 0;
      const res = await action('00000000-0000-0000-0000-000000000000', fd());
      if (ADMIN_ONLY.has(short)) {
        expect(res, name).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
        expect(state.dbCalls, name).toBe(0);
      } else {
        // Past the guard: the (stub) DB is reached, or input validation answered first.
        expect(res.error, name).not.toBe(FORBIDDEN_MESSAGE);
      }
    }
  });
});

describe('guard helpers', () => {
  it('authorize follows the role hierarchy', async () => {
    state.profile = { id: 'a', email: 'a@test', role: 'admin' };
    expect((await authorize('editor')).ok).toBe(true);
    expect((await authorize('admin')).ok).toBe(true);
    state.profile = { id: 'e', email: 'e@test', role: 'editor' };
    expect((await authorize('editor')).ok).toBe(true);
    expect(await authorize('admin')).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
  });

  it('adminAction reports DB errors in Hebrew without leaking them', async () => {
    state.profile = { id: 'a', email: 'a@test', role: 'admin' };
    const failing = adminAction('editor', async () => {
      throw new Error('duplicate key value violates unique constraint "posts_slug_key"');
    });
    const res = await failing();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/כבר קיים/);
  });
});
