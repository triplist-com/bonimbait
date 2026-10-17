/**
 * QA fixes in the Bonim.Os server actions:
 * - deactivating a manager ends their project assignments, as removing does
 *   (lib/admin/actions/bonimos.ts);
 * - FLAG_BONIMOS=false refuses the admin actions and every /manage action
 *   before any database work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callsTo, fakeDb, hasEq, type FakeDb } from './fake-db';

const MANAGER = '3f0e1d2c-4b5a-4968-8776-a5b4c3d2e1f0';
const PROJECT = '6a1f3c20-5d1e-4c8a-9b7e-2f4d6c8e0a11';

const state = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
  getUserCalls: 0,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined, unstable_cache: <T>(fn: T) => fn }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: async () => undefined }));
vi.mock('@/lib/auth/session', () => ({
  getProfile: async () => ({ id: 'a0000000-0000-4000-8000-000000000001', email: 'admin@bonimbait.test', role: 'admin', full_name: 'מנהלת האתר' }),
  getUser: async () => {
    state.getUserCalls += 1;
    return state.user;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => (state.admin as FakeDb).client }));
vi.mock('@/lib/bonimos/db', () => ({
  bonimosAdminDb: () => (state.admin as FakeDb).client,
  bonimosUserDb: () => (state.admin as FakeDb).client,
}));
vi.mock('@/lib/bonimos/admin', () => ({ findAccountByEmail: async () => ({ id: MANAGER, email: 'm@bonimbait.test', full_name: 'מנהלת' }) }));
// React's cache() only exists in Next's server build.
vi.mock('@/lib/planner/price-book', () => ({ loadPriceBook: async () => ({}) }));

import {
  addBonimosManager,
  assignBonimosManager,
  endBonimosClient,
  removeBonimosManager,
  startBonimosClient,
  unassignBonimosManager,
  updateBonimosManager,
} from '@/lib/admin/actions/bonimos';
import { addNoteAction, deleteNoteAction } from '@/app/manage/actions';

let db: FakeDb;

function rosterForm(active: boolean): FormData {
  const fd = new FormData();
  fd.set('display_name', 'מנהלת פרויקט לדוגמה');
  fd.set('title', 'מנהלת פרויקט');
  fd.set('phone', '050-1234567');
  fd.set('email', 'm@bonimbait.test');
  if (active) fd.set('active', 'on');
  return fd;
}

beforeEach(() => {
  vi.stubEnv('FLAG_BONIMOS', 'true');
  db = fakeDb(() => ({ data: null, error: null }));
  state.admin = db;
  state.user = { id: 'u-1' };
  state.getUserCalls = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deactivating a project manager', () => {
  it('ends every assignment of theirs, like removing them does', async () => {
    const res = await updateBonimosManager(MANAGER, rosterForm(false));
    expect(res.ok).toBe(true);
    const [ended] = callsTo(db, 'hub_project_members', 'delete');
    expect(ended).toBeDefined();
    expect(hasEq(ended, 'user_id', MANAGER)).toBe(true);
    expect(hasEq(ended, 'role', 'manager')).toBe(true);
    const [card] = callsTo(db, 'bonimos_managers', 'update');
    expect(card.ops.find(([name]) => name === 'update')?.[1][0]).toMatchObject({ active: false });
  });

  it('keeps the assignments of an active manager whose card is edited', async () => {
    const res = await updateBonimosManager(MANAGER, rosterForm(true));
    expect(res.ok).toBe(true);
    expect(callsTo(db, 'hub_project_members', 'delete')).toHaveLength(0);
  });

  it('still ends assignments when the manager is removed', async () => {
    const res = await removeBonimosManager(MANAGER);
    expect(res.ok).toBe(true);
    expect(callsTo(db, 'hub_project_members', 'delete')).toHaveLength(1);
    expect(callsTo(db, 'bonimos_managers', 'delete')).toHaveLength(1);
  });
});

describe('the Bonim.Os kill switch (FLAG_BONIMOS)', () => {
  beforeEach(() => {
    vi.stubEnv('FLAG_BONIMOS', 'false');
  });

  it('refuses every admin action before any database work', async () => {
    const fd = rosterForm(true);
    fd.set('manager_id', MANAGER);
    const results = await Promise.all([
      addBonimosManager(fd),
      updateBonimosManager(MANAGER, fd),
      removeBonimosManager(MANAGER),
      startBonimosClient(fd),
      assignBonimosManager(PROJECT, fd),
      unassignBonimosManager(PROJECT, fd),
      endBonimosClient(PROJECT),
    ]);
    for (const res of results) expect(res).toMatchObject({ ok: false, error: 'Bonim.Os לא פעיל באתר כרגע.' });
    expect(db.calls).toHaveLength(0);
  });

  it('refuses /manage actions before reading the session or the database', async () => {
    expect(await addNoteAction(PROJECT, 'הערה')).toMatchObject({ ok: false, error: 'not_found' });
    expect(await deleteNoteAction(PROJECT, MANAGER)).toMatchObject({ ok: false, error: 'not_found' });
    expect(state.getUserCalls).toBe(0);
    expect(db.calls).toHaveLength(0);
  });
});
