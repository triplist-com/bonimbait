/**
 * The managed-project budget lock (20261014130000_qa_bonimos_budget_lock.sql)
 * against the LOCAL Supabase stack:
 *
 *   QA_RLS_TEST=1 npx vitest run tests/qa/budget-lock.test.ts
 *
 * In a managed project the approved budget, its planned lines and the payments
 * a payment approval recorded belong to the project manager. The client keeps
 * editing their own quotes and payments; self-managed projects are unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isForbidden, QA_STACK_ENABLED, serviceClient, signedInUser, type Db } from './stack';

const EMAILS = {
  client: 'qa-lock-client@bonimbait.test',
  manager: 'qa-lock-manager@bonimbait.test',
  self: 'qa-lock-self@bonimbait.test',
} as const;
type Who = keyof typeof EMAILS;

describe.skipIf(!QA_STACK_ENABLED)('Bonim.Os budget lock on the local stack', () => {
  let admin: Db;
  const ids = {} as Record<Who, string>;
  const as = {} as Record<Who, Db>;
  let managed = '';
  let selfProject = '';
  let approvedVersion = '';
  let plannedLine = '';
  let paidLine = '';
  let request = '';

  async function cleanup() {
    const people = Object.values(ids).filter(Boolean);
    if (!people.length) return;
    // The service role may close a managed project (the guard lets only it through).
    await admin.from('hub_projects').delete().in('created_by', people);
    await admin.from('bonimos_managers').delete().in('user_id', people);
  }

  beforeAll(async () => {
    admin = serviceClient();
    for (const who of Object.keys(EMAILS) as Who[]) {
      const u = await signedInUser(admin, EMAILS[who], 'member');
      ids[who] = u.id;
      as[who] = u.db;
    }
    await cleanup();

    // The client's own hub project, made managed by the service, with a manager.
    const p = await as.client.from('hub_projects').insert({ created_by: ids.client, stage: 'frame', size_m2: 180 }).select('id').single();
    if (p.error) throw p.error;
    managed = p.data.id as string;
    const roster = await admin.from('bonimos_managers').insert({ user_id: ids.manager, display_name: 'מנהלת בדיקה', title: 'מנהלת פרויקט' });
    if (roster.error) throw roster.error;
    const mode = await admin.from('hub_projects').update({ mode: 'managed' }).eq('id', managed);
    if (mode.error) throw mode.error;
    const member = await admin.from('hub_project_members').insert({ project_id: managed, user_id: ids.manager, role: 'manager', added_by: ids.client });
    if (member.error) throw member.error;

    // The manager approves a budget (basis manual) with a planned line.
    const v = await as.manager.rpc('hub_new_budget_version', {
      p_project: managed,
      p_label: 'תקציב מאושר',
      p_basis: 'manual',
      p_total_min: 200_000_000,
      p_total_max: 200_000_000,
      p_note: 'אחרי מכרז',
      p_planned: [{ category: 'frame', amount_agorot: 80_000_000 }],
    });
    if (v.error) throw v.error;
    approvedVersion = v.data as string;
    const planned = await admin.from('hub_budget_items').select('id').eq('version_id', approvedVersion).eq('kind', 'planned').single();
    if (planned.error) throw planned.error;
    plannedLine = planned.data.id as string;

    // A payment request through the whole state machine: requested, reviewed, approved, paid.
    const req = await as.manager.rpc('bonimos_request_payment', {
      p_project: managed,
      p_contractor: 'קבלן שלד לבדיקה',
      p_title: 'תשלום 1',
      p_category: 'frame',
      p_amount_agorot: 5_000_000,
    });
    if (req.error) throw req.error;
    request = req.data as string;
    for (const [who, action] of [['manager', 'review_approve'], ['client', 'client_approve'], ['client', 'mark_paid']] as const) {
      const t = await as[who].rpc('bonimos_payment_transition', { p_request: request, p_action: action });
      if (t.error) throw t.error;
    }
    const paid = await admin.from('bonimos_payment_requests').select('budget_item_id').eq('id', request).single();
    if (paid.error) throw paid.error;
    paidLine = paid.data.budget_item_id as string;
    expect(paidLine).toBeTruthy();

    // A self-managed project, for contrast.
    const s = await as.self.from('hub_projects').insert({ created_by: ids.self, stage: 'planning', size_m2: 200 }).select('id').single();
    if (s.error) throw s.error;
    selfProject = s.data.id as string;
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup();
  });

  describe('the client of a managed project', () => {
    it('cannot rewrite or delete the approved budget version', async () => {
      const flip = await as.client.from('hub_budget_versions').update({ basis: 'calculator' }).eq('id', approvedVersion).select('id');
      expect(isForbidden(flip.error)).toBe(true);
      const note = await as.client.from('hub_budget_versions').update({ note: 'שיניתי' }).eq('id', approvedVersion).select('id');
      expect(isForbidden(note.error)).toBe(true);
      const del = await as.client.from('hub_budget_versions').delete().eq('id', approvedVersion).select('id');
      expect(isForbidden(del.error)).toBe(true);
      const after = await admin.from('hub_budget_versions').select('basis, note').eq('id', approvedVersion).single();
      expect(after.data).toMatchObject({ basis: 'manual', note: 'אחרי מכרז' });
    });

    it('cannot change, delete or add planned lines once a budget is approved', async () => {
      const up = await as.client.from('hub_budget_items').update({ amount_agorot: 1 }).eq('id', plannedLine).select('id');
      expect(isForbidden(up.error)).toBe(true);
      const del = await as.client.from('hub_budget_items').delete().eq('id', plannedLine).select('id');
      expect(isForbidden(del.error)).toBe(true);
      const add = await as.client
        .from('hub_budget_items')
        .insert({ project_id: managed, version_id: approvedVersion, kind: 'planned', category: 'flooring', amount_agorot: 100 })
        .select('id');
      expect(isForbidden(add.error)).toBe(true);
      const after = await admin.from('hub_budget_items').select('amount_agorot').eq('id', plannedLine).single();
      expect(after.data?.amount_agorot).toBe(80_000_000);
    });

    it('cannot change or delete the payment a payment approval recorded', async () => {
      const up = await as.client.from('hub_budget_items').update({ amount_agorot: 1 }).eq('id', paidLine).select('id');
      expect(isForbidden(up.error)).toBe(true);
      const kind = await as.client.from('hub_budget_items').update({ kind: 'quote' }).eq('id', paidLine).select('id');
      expect(isForbidden(kind.error)).toBe(true);
      const del = await as.client.from('hub_budget_items').delete().eq('id', paidLine).select('id');
      expect(isForbidden(del.error)).toBe(true);
      const after = await admin.from('hub_budget_items').select('amount_agorot, kind').eq('id', paidLine).single();
      expect(after.data).toMatchObject({ amount_agorot: 5_000_000, kind: 'actual' });
    });

    it('cannot start a new budget version over the approved one (the RPC as the client)', async () => {
      const v = await as.client.rpc('hub_new_budget_version', {
        p_project: managed,
        p_label: 'הערכה שלי',
        p_basis: 'calculator',
        p_total_min: 100,
        p_total_max: 200,
      });
      expect(isForbidden(v.error)).toBe(true);
      const current = await admin.from('hub_budget_versions').select('id').eq('project_id', managed).eq('is_current', true).single();
      expect(current.data?.id).toBe(approvedVersion);
    });

    it('cannot delete the managed project (and with it the payment-approval log)', async () => {
      const del = await as.client.from('hub_projects').delete().eq('id', managed).select('id');
      expect(isForbidden(del.error)).toBe(true);
      const still = await admin.from('bonimos_payment_events').select('id').eq('request_id', request);
      expect((still.data ?? []).length).toBeGreaterThanOrEqual(4);
    });

    it('still adds, updates and deletes their own quotes and payments', async () => {
      const add = await as.client
        .from('hub_budget_items')
        .insert({ project_id: managed, kind: 'quote', category: 'windows', amount_agorot: 4_200_000, status: 'open', vendor: 'ספק לבדיקה' })
        .select('id')
        .single();
      expect(add.error).toBeNull();
      const id = add.data!.id as string;
      const up = await as.client.from('hub_budget_items').update({ status: 'accepted' }).eq('id', id).select('id');
      expect(up.error).toBeNull();
      expect(up.data).toHaveLength(1);
      const del = await as.client.from('hub_budget_items').delete().eq('id', id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
    });
  });

  describe('the project manager', () => {
    it('updates the approved budget and its planned lines', async () => {
      const note = await as.manager.from('hub_budget_versions').update({ note: 'אחרי מכרז, מעודכן' }).eq('id', approvedVersion).select('id');
      expect(note.error).toBeNull();
      expect(note.data).toHaveLength(1);
      const line = await as.manager.from('hub_budget_items').update({ amount_agorot: 81_000_000 }).eq('id', plannedLine).select('id');
      expect(line.error).toBeNull();
      expect(line.data).toHaveLength(1);
    });
  });

  describe('payment approvals outside managed mode', () => {
    it('are refused once a project is no longer managed', async () => {
      const req = await as.manager.rpc('bonimos_request_payment', {
        p_project: managed,
        p_contractor: 'קבלן שלד לבדיקה',
        p_title: 'תשלום 2',
        p_category: 'frame',
        p_amount_agorot: 1_000_000,
      });
      if (req.error) throw req.error;
      const off = await admin.from('hub_projects').update({ mode: 'self' }).eq('id', managed);
      if (off.error) throw off.error;
      try {
        const t = await as.manager.rpc('bonimos_payment_transition', { p_request: req.data, p_action: 'review_approve' });
        expect(isForbidden(t.error)).toBe(true);
        expect(t.error?.message).toMatch(/managed project/);
      } finally {
        const on = await admin.from('hub_projects').update({ mode: 'managed' }).eq('id', managed);
        if (on.error) throw on.error;
      }
    });
  });

  describe('a self-managed project', () => {
    it('keeps versioning and editing its estimates as before', async () => {
      const v = await as.self.rpc('hub_new_budget_version', {
        p_project: selfProject,
        p_label: 'הערכה ראשונית',
        p_basis: 'calculator',
        p_total_min: 250_000_000,
        p_total_max: 300_000_000,
        p_planned: [{ category: 'frame', amount_agorot: 90_000_000 }],
      });
      expect(v.error).toBeNull();
      const line = await as.self.from('hub_budget_items').select('id').eq('version_id', v.data as string).single();
      const del = await as.self.from('hub_budget_items').delete().eq('id', line.data!.id).select('id');
      expect(del.error).toBeNull();
      expect(del.data).toHaveLength(1);
    });

    it('caps the inputs stored on a budget version at 4 KB', async () => {
      const big = await as.self.rpc('hub_new_budget_version', {
        p_project: selfProject,
        p_label: 'הערכה ממתכנן התקציב',
        p_basis: 'planner',
        p_total_min: 250_000_000,
        p_total_max: 300_000_000,
        p_inputs: { planner_at: new Date().toISOString(), planner_inputs: { note: 'א'.repeat(5000) } },
      });
      expect(big.error?.code).toBe('23514');
    });
  });
});
