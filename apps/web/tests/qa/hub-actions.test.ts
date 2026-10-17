/**
 * QA fixes in the hub's server actions (app/my-home/actions.ts):
 * - FLAG_HUB=false refuses every action (kill switch);
 * - a budget line a Bonim.Os payment approval recorded can't be deleted from
 *   the hub (friendly message; the database refuses it too);
 * - the database's managed-budget refusal reads as that same message;
 * - a document's signed URL is looked up inside the member's own project.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callsTo, fakeDb, hasEq, type FakeCall, type FakeDb, type FakeResult } from './fake-db';

const PROJECT = '6a1f3c20-5d1e-4c8a-9b7e-2f4d6c8e0a11';
const ITEM = '0b7c9e21-3a4f-4d5e-8f60-718293a4b5c6';
const DOC = '1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  mode: 'managed' as 'self' | 'managed',
  hub: null as unknown,
  bonimos: null as unknown,
  signedUrlPath: null as string | null,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/analytics/server', () => ({ trackServer: async () => undefined }));
vi.mock('@/lib/auth/session', () => ({ getUser: async () => state.user }));
vi.mock('@/lib/supabase/env', () => ({ isSupabaseConfigured: () => true }));
vi.mock('@/lib/hub/signup', () => ({ recordSignupCompleted: async () => true }));
vi.mock('@/lib/hub/db', () => ({ hubUserDb: () => (state.hub as FakeDb).client }));
vi.mock('@/lib/bonimos/db', () => ({ bonimosUserDb: () => (state.bonimos as FakeDb).client }));
vi.mock('@/lib/hub/server', () => ({
  getPrimaryProject: async () => ({ id: PROJECT, mode: state.mode, stage: 'frame', region_id: null }),
  createBudgetVersion: async () => 'v',
  importLocalHub: async () => ({ projectId: null, onboarded: false }),
  saveProjectFromDraft: async () => ({ project: { id: PROJECT } }),
  setSavedItem: async () => undefined,
  syncProfileFromProject: async () => undefined,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          state.signedUrlPath = path;
          return { data: { signedUrl: `http://127.0.0.1:54321/sign/${path}` }, error: null };
        },
      }),
    },
  }),
}));

import { deleteBudgetItemAction, documentUrlAction, toggleSavedAction } from '@/app/my-home/actions';

let hub: FakeDb;
let bonimos: FakeDb;
let hubRespond: (call: FakeCall) => FakeResult;
let linkedItems: string[];

beforeEach(() => {
  vi.stubEnv('FLAG_HUB', 'true');
  state.user = { id: 'e9b8c7d6-0000-4000-8000-000000000001' };
  state.mode = 'managed';
  state.signedUrlPath = null;
  linkedItems = [ITEM];
  hubRespond = () => ({ data: null, error: null });
  hub = fakeDb((call) => hubRespond(call));
  bonimos = fakeDb((call) => {
    if (call.table !== 'bonimos_payment_requests') return { data: [] };
    const asked = call.ops.find(([name, args]) => name === 'eq' && args[0] === 'budget_item_id')?.[1][1];
    return { data: linkedItems.includes(String(asked)) ? [{ id: 'req-1' }] : [] };
  });
  state.hub = hub;
  state.bonimos = bonimos;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the hub kill switch (FLAG_HUB)', () => {
  it('refuses actions while the hub is off, before touching the database', async () => {
    vi.stubEnv('FLAG_HUB', 'false');
    const res = await toggleSavedAction({ kind: 'video', ref: 'vluNH7GTkU4', title: 'פרק 109', saved: true });
    expect(res).toMatchObject({ ok: false, error: 'unavailable' });
    expect((await deleteBudgetItemAction(ITEM)).ok).toBe(false);
    expect(hub.calls).toHaveLength(0);
  });
});

describe('deleting a budget line in a managed project', () => {
  it('refuses a payment that a payment approval recorded, without deleting', async () => {
    const res = await deleteBudgetItemAction(ITEM);
    expect(res).toMatchObject({ ok: false, error: 'locked' });
    if (!res.ok) expect(res.message).toContain('מנהל הפרויקט');
    expect(callsTo(hub, 'hub_budget_items', 'delete')).toHaveLength(0);
  });

  it('deletes the client\'s own line, scoped to their project and never a planned line', async () => {
    linkedItems = [];
    const res = await deleteBudgetItemAction(ITEM);
    expect(res.ok).toBe(true);
    const [del] = callsTo(hub, 'hub_budget_items', 'delete');
    expect(hasEq(del, 'id', ITEM)).toBe(true);
    expect(hasEq(del, 'project_id', PROJECT)).toBe(true);
    expect(del.ops.some(([name, args]) => name === 'neq' && args[0] === 'kind' && args[1] === 'planned')).toBe(true);
  });

  it('shows the database\'s managed-budget refusal as the same friendly message', async () => {
    linkedItems = [];
    hubRespond = (call) =>
      call.ops.some(([name]) => name === 'delete')
        ? { error: { code: '42501', message: 'This line was recorded from a payment approval; the project manager updates it' } }
        : { data: null };
    const res = await deleteBudgetItemAction(ITEM);
    expect(res).toMatchObject({ ok: false, error: 'locked' });
  });

  it('skips the approval lookup in a self-managed project', async () => {
    state.mode = 'self';
    const res = await deleteBudgetItemAction(ITEM);
    expect(res.ok).toBe(true);
    expect(bonimos.calls).toHaveLength(0);
  });
});

describe('opening a document', () => {
  it('looks the document up inside the member\'s own project', async () => {
    hubRespond = (call) => (call.table === 'hub_documents' ? { data: { storage_path: `${PROJECT}/a.pdf`, file_name: 'תוכנית.pdf' } } : { data: null });
    const res = await documentUrlAction(DOC);
    expect(res.ok).toBe(true);
    const [lookup] = callsTo(hub, 'hub_documents', 'select');
    expect(hasEq(lookup, 'id', DOC)).toBe(true);
    expect(hasEq(lookup, 'project_id', PROJECT)).toBe(true);
    expect(state.signedUrlPath).toBe(`${PROJECT}/a.pdf`);
  });

  it('refuses an id it can\'t find in that project', async () => {
    hubRespond = () => ({ data: null });
    const res = await documentUrlAction(DOC);
    expect(res).toMatchObject({ ok: false, error: 'invalid' });
    expect(state.signedUrlPath).toBeNull();
  });
});
