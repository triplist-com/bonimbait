import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PAYMENT_TRANSITIONS,
  applyTransition,
  approvalCounts,
  availableActions,
  checkTransition,
  effectiveAmount,
  isMyTurn,
  sortRequests,
  waitingOn,
  type TransitionInput,
} from '@/lib/bonimos/approvals';
import { PAYMENT_ACTIONS, PAYMENT_STATUSES, type PaymentRequestView, type PaymentStatus } from '@/lib/bonimos/types';

const TODAY = '2026-10-15';

function step(over: Partial<TransitionInput>): TransitionInput {
  return { status: 'pending_review', action: 'review_approve', role: 'manager', requested: 96_000, today: TODAY, ...over };
}

function request(over: Partial<PaymentRequestView> = {}): PaymentRequestView {
  return {
    id: 'r1',
    number: 3,
    contractor: 'קבלן שלד לדוגמה',
    title: 'תשלום 3: עמודים וקירות קומת קרקע',
    category: 'frame',
    stage: 'frame',
    milestoneId: null,
    attachment: null,
    requested: 96_000,
    approved: null,
    status: 'pending_review',
    dueOn: null,
    paidOn: null,
    note: null,
    createdBy: 'manager-1',
    createdAt: '2026-10-12T07:00:00.000Z',
    updatedAt: '2026-10-12T07:00:00.000Z',
    events: [
      {
        id: 'e0',
        action: 'requested',
        fromStatus: null,
        toStatus: 'pending_review',
        actorId: 'manager-1',
        actorRole: 'manager',
        amount: 96_000,
        note: null,
        createdAt: '2026-10-12T07:00:00.000Z',
      },
    ],
    ...over,
  };
}

describe('the payment approval state machine', () => {
  it('only the manager reviews, only the client approves', () => {
    expect(checkTransition(step({ role: 'owner' }))).toEqual({ ok: false, error: 'role' });
    expect(checkTransition(step({ status: 'pending_client', action: 'client_approve', role: 'manager' }))).toEqual({ ok: false, error: 'role' });
    expect(checkTransition(step({ status: 'pending_client', action: 'client_approve', role: 'owner' }))).toMatchObject({ ok: true, to: 'approved' });
    expect(checkTransition(step({ status: 'pending_client', action: 'client_return', role: 'manager', note: 'x' }))).toEqual({ ok: false, error: 'role' });
  });

  it('every action only moves from its states', () => {
    for (const action of PAYMENT_ACTIONS) {
      const rule = PAYMENT_TRANSITIONS[action];
      for (const status of PAYMENT_STATUSES) {
        const res = checkTransition(
          step({ status, action, role: rule.roles[0], note: 'סיבה', amount: action === 'review_approve' ? 90_000 : null }),
        );
        if (rule.from.includes(status)) expect(res, `${action} from ${status}`).toMatchObject({ ok: true, to: rule.to });
        else expect(res, `${action} from ${status}`).toEqual({ ok: false, error: 'state' });
      }
    }
  });

  it('a rejection and a client question need a reason', () => {
    expect(checkTransition(step({ action: 'review_reject', note: '  ' }))).toEqual({ ok: false, error: 'note_required' });
    expect(checkTransition(step({ action: 'review_reject', note: 'העבודה לא הושלמה' }))).toMatchObject({ ok: true, to: 'rejected', note: 'העבודה לא הושלמה' });
    expect(checkTransition(step({ status: 'pending_client', action: 'client_return', role: 'owner' }))).toEqual({ ok: false, error: 'note_required' });
  });

  it('the manager may approve less than requested, never more', () => {
    expect(checkTransition(step({}))).toMatchObject({ ok: true, amount: 96_000 });
    expect(checkTransition(step({ amount: 90_000 }))).toMatchObject({ ok: true, amount: 90_000, to: 'pending_client' });
    expect(checkTransition(step({ amount: 96_001 }))).toEqual({ ok: false, error: 'amount' });
    expect(checkTransition(step({ amount: 0 }))).toEqual({ ok: false, error: 'amount' });
    expect(checkTransition(step({ amount: Number.NaN }))).toEqual({ ok: false, error: 'amount' });
  });

  it('a payment is marked paid today or in the past', () => {
    const paid = step({ status: 'approved', action: 'mark_paid', role: 'owner' });
    expect(checkTransition(paid)).toMatchObject({ ok: true, to: 'paid', paidOn: TODAY });
    expect(checkTransition({ ...paid, paidOn: '2026-10-01' })).toMatchObject({ ok: true, paidOn: '2026-10-01' });
    expect(checkTransition({ ...paid, paidOn: '2026-10-16' })).toEqual({ ok: false, error: 'date' });
    expect(checkTransition({ ...paid, role: 'manager' })).toMatchObject({ ok: true });
  });

  it('the manager, or whoever recorded it, may cancel an open request', () => {
    expect(checkTransition(step({ action: 'cancel', role: 'manager' }))).toMatchObject({ ok: true, to: 'cancelled' });
    expect(checkTransition(step({ action: 'cancel', role: 'owner' }))).toEqual({ ok: false, error: 'role' });
    expect(checkTransition(step({ action: 'cancel', role: 'owner', isCreator: true }))).toMatchObject({ ok: true });
    expect(checkTransition(step({ status: 'approved', action: 'cancel', role: 'manager' }))).toEqual({ ok: false, error: 'state' });
  });

  it('shows each role its own buttons, primary first', () => {
    expect(availableActions('pending_review', 'manager')).toEqual(['review_approve', 'review_reject', 'cancel']);
    expect(availableActions('pending_review', 'owner')).toEqual([]);
    expect(availableActions('pending_review', 'owner', true)).toEqual(['cancel']);
    expect(availableActions('pending_client', 'owner')).toEqual(['client_approve', 'client_return']);
    expect(availableActions('pending_client', 'manager')).toEqual(['cancel']);
    expect(availableActions('approved', 'owner')).toEqual(['mark_paid']);
    expect(availableActions('approved', 'manager')).toEqual(['mark_paid']);
    for (const done of ['paid', 'rejected', 'cancelled'] as PaymentStatus[]) {
      expect(availableActions(done, 'manager')).toEqual([]);
      expect(availableActions(done, 'owner', true)).toEqual([]);
    }
  });

  it('knows whose turn it is', () => {
    expect(waitingOn('pending_review')).toBe('manager');
    expect(waitingOn('pending_client')).toBe('client');
    expect(waitingOn('approved')).toBe('payment');
    expect(waitingOn('paid')).toBeNull();
    expect(isMyTurn('pending_review', 'manager')).toBe(true);
    expect(isMyTurn('pending_review', 'owner')).toBe(false);
    expect(isMyTurn('pending_client', 'owner')).toBe(true);
    expect(isMyTurn('approved', 'owner')).toBe(false);
  });

  it('runs a full flow in memory with its audit log (the demo)', () => {
    const at = (h: number) => `2026-10-1${h}T08:00:00.000Z`;
    let r = request();
    r = applyTransition(r, { action: 'review_approve', role: 'manager', amount: 90_000, note: 'חסרים שני עמודים', actorId: 'manager-1', at: at(3), eventId: 'e1', today: TODAY });
    expect(r).toMatchObject({ status: 'pending_client', approved: 90_000 });
    r = applyTransition(r, { action: 'client_return', role: 'owner', note: 'מתי ישלימו?', actorId: 'client-1', at: at(4), eventId: 'e2', today: TODAY });
    expect(r).toMatchObject({ status: 'pending_review', approved: null });
    r = applyTransition(r, { action: 'review_approve', role: 'manager', amount: 96_000, actorId: 'manager-1', at: at(4), eventId: 'e3', today: TODAY });
    r = applyTransition(r, { action: 'client_approve', role: 'owner', actorId: 'client-1', at: at(5), eventId: 'e4', today: TODAY });
    r = applyTransition(r, { action: 'mark_paid', role: 'owner', actorId: 'client-1', at: at(5), eventId: 'e5', today: TODAY });
    expect(r).toMatchObject({ status: 'paid', approved: 96_000, paidOn: TODAY });
    expect(r.events.map((e) => [e.action, e.fromStatus, e.toStatus])).toEqual([
      ['requested', null, 'pending_review'],
      ['review_approve', 'pending_review', 'pending_client'],
      ['client_return', 'pending_client', 'pending_review'],
      ['review_approve', 'pending_review', 'pending_client'],
      ['client_approve', 'pending_client', 'approved'],
      ['mark_paid', 'approved', 'paid'],
    ]);
    expect(r.events[1]).toMatchObject({ amount: 90_000, note: 'חסרים שני עמודים', actorRole: 'manager' });
    expect(r.events[5]).toMatchObject({ amount: 96_000 });
    expect(() => applyTransition(r, { action: 'cancel', role: 'manager', actorId: 'm', at: at(6), eventId: 'x', today: TODAY })).toThrow(/state/);
  });

  it('counts the queues, sorts the viewer\'s turn first and uses the approved amount', () => {
    const list = [
      request({ id: 'a', number: 1, status: 'paid' }),
      request({ id: 'b', number: 2, status: 'pending_client' }),
      request({ id: 'c', number: 3, status: 'pending_review' }),
      request({ id: 'd', number: 4, status: 'approved' }),
    ];
    expect(approvalCounts(list)).toEqual({ pendingReview: 1, pendingClient: 1, approvedUnpaid: 1 });
    expect(sortRequests(list, 'owner').map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(sortRequests(list, 'manager').map((r) => r.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(effectiveAmount({ requested: 96_000, approved: 90_000 })).toBe(90_000);
    expect(effectiveAmount({ requested: 96_000, approved: null })).toBe(96_000);
  });
});

describe('the SQL state machine matches this module', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../../../supabase/migrations/20261014126000_bonimos_core.sql', import.meta.url)), 'utf8');
  const fn = sql.slice(sql.indexOf('create or replace function public.bonimos_payment_transition'), sql.indexOf('-- Site photos'));

  it('each branch moves from the same states to the same state, for the same roles', () => {
    for (const action of PAYMENT_ACTIONS) {
      const start = fn.search(new RegExp(`p_action = '${action}' then`));
      expect(start, action).toBeGreaterThan(0);
      const rest = fn.slice(start + 10);
      const end = rest.search(/\n\s+(elsif p_action|else\n)/);
      const branch = rest.slice(0, end);
      const rule = PAYMENT_TRANSITIONS[action];
      expect(branch, `${action} target`).toContain(`v_to := '${rule.to}'`);
      for (const from of rule.from) expect(branch, `${action} from ${from}`).toContain(`'${from}'`);
      if (rule.creatorMay) expect(branch, `${action} role or creator`).toContain(`v_role = '${rule.roles[0]}' or r.created_by = auth.uid()`);
      else if (rule.roles.length === 1) expect(branch, `${action} role`).toContain(`v_role <> '${rule.roles[0]}'`);
      else expect(branch, `${action} any member`).not.toContain('v_role <>');
      if (rule.noteRequired) expect(branch, `${action} note`).toContain('v_note is null');
    }
  });
});
