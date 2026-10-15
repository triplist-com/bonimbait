/**
 * Database rows -> Bonim.Os view models (lib/bonimos/types.ts), and the
 * manager-workspace summary of one project. Agorot become whole shekels
 * here. Pure and client-safe (the demo builds the same views from fixtures;
 * lib/bonimos/server.ts feeds these from the database).
 */
import { budgetCategory, isBudgetCategoryId, type BudgetCategoryId } from '@/lib/hub/budget';
import { daysBetween } from '@/lib/hub/format';
import type { HubBudgetItemRow, HubBudgetItemView, HubBudgetVersionRow, HubDocumentRow, HubDocumentView } from '@/lib/hub/types';
import { approvalCounts } from './approvals';
import { projectBudget } from './budget';
import { nextMilestone } from './milestones';
import type {
  ActivityView,
  BonimosActivityRow,
  BonimosMilestoneRow,
  BonimosPaymentEventRow,
  BonimosPaymentRequestRow,
  BonimosPersonRow,
  BudgetVersionPlan,
  ManagerProjectSummary,
  MilestoneView,
  PaymentRequestView,
  PersonView,
} from './types';

export function toNis(agorot: number | null | undefined): number {
  return Math.round((agorot ?? 0) / 100);
}

/** Every budget version with its planned lines (whole shekels per category), oldest first. */
export function versionPlans(versions: readonly HubBudgetVersionRow[], items: readonly HubBudgetItemRow[]): BudgetVersionPlan[] {
  const planned = new Map<string, Partial<Record<BudgetCategoryId, number>>>();
  for (const i of items) {
    if (i.kind !== 'planned' || !i.version_id || !isBudgetCategoryId(i.category)) continue;
    const plan = planned.get(i.version_id) ?? {};
    plan[i.category] = (plan[i.category] ?? 0) + toNis(i.amount_agorot);
    planned.set(i.version_id, plan);
  }
  return [...versions]
    .sort((a, b) => a.version_no - b.version_no)
    .map((v) => ({
      id: v.id,
      versionNo: v.version_no,
      label: v.label,
      basis: v.basis,
      note: v.note,
      createdAt: v.created_at,
      createdBy: v.created_by,
      isCurrent: v.is_current,
      totalMin: toNis(v.total_min_agorot),
      totalMax: toNis(v.total_max_agorot),
      planned: planned.get(v.id) ?? {},
    }));
}

/** Quotes and actuals (planned lines live in versions), newest first. */
export function budgetItemViews(items: readonly HubBudgetItemRow[]): HubBudgetItemView[] {
  return items
    .filter((i) => i.kind !== 'planned' && budgetCategory(i.category))
    .sort((a, b) => (b.occurred_on ?? b.created_at).localeCompare(a.occurred_on ?? a.created_at))
    .map((i) => ({
      id: i.id,
      kind: i.kind as 'quote' | 'actual',
      category: i.category,
      label: i.label,
      vendor: i.vendor,
      amount: toNis(i.amount_agorot),
      status: i.status,
      occurredOn: i.occurred_on,
      createdAt: i.created_at,
    }));
}

export function milestoneView(m: BonimosMilestoneRow): MilestoneView {
  return {
    id: m.id,
    stage: m.stage,
    title: m.title,
    plannedStart: m.planned_start,
    plannedEnd: m.planned_end,
    actualStart: m.actual_start,
    actualEnd: m.actual_end,
    note: m.note,
    sortOrder: m.sort_order,
  };
}

export function documentView(d: HubDocumentRow): HubDocumentView {
  return {
    id: d.id,
    fileName: d.file_name,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    category: d.category,
    stage: d.stage,
    note: d.note,
    createdAt: d.created_at,
  };
}

/** Requests with their audit events (oldest first) and attachment, newest request first. */
export function paymentViews(
  requests: readonly BonimosPaymentRequestRow[],
  events: readonly BonimosPaymentEventRow[],
  documents: readonly Pick<HubDocumentRow, 'id' | 'file_name' | 'mime_type'>[],
): PaymentRequestView[] {
  const docs = new Map(documents.map((d) => [d.id, d]));
  const byRequest = new Map<string, BonimosPaymentEventRow[]>();
  for (const e of events) {
    const list = byRequest.get(e.request_id) ?? [];
    list.push(e);
    byRequest.set(e.request_id, list);
  }
  return [...requests]
    .sort((a, b) => b.number - a.number)
    .map((r) => {
      const doc = r.attachment_id ? docs.get(r.attachment_id) : undefined;
      return {
        id: r.id,
        number: r.number,
        contractor: r.contractor,
        title: r.title,
        category: r.category,
        stage: r.stage,
        milestoneId: r.milestone_id,
        attachment: doc ? { id: doc.id, fileName: doc.file_name, mimeType: doc.mime_type } : null,
        requested: toNis(r.requested_agorot),
        approved: r.approved_agorot == null ? null : toNis(r.approved_agorot),
        status: r.status,
        dueOn: r.due_on,
        paidOn: r.paid_on,
        note: r.note,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        events: (byRequest.get(r.id) ?? [])
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((e) => ({
            id: e.id,
            action: e.action,
            fromStatus: e.from_status,
            toStatus: e.to_status,
            actorId: e.actor_id,
            actorRole: e.actor_role,
            amount: e.amount_agorot == null ? null : toNis(e.amount_agorot),
            note: e.note,
            createdAt: e.created_at,
          })),
      };
    });
}

export function activityView(a: BonimosActivityRow): ActivityView {
  return {
    id: a.id,
    kind: a.kind,
    action: a.action,
    actorId: a.actor_id,
    body: a.body,
    refId: a.ref_id,
    meta: a.meta ?? {},
    createdAt: a.created_at,
  };
}

export function personView(p: BonimosPersonRow): PersonView {
  return { userId: p.user_id, role: p.role, name: p.name, title: p.title, phone: p.phone, email: p.email };
}

/** The client's display name on a manager's list (the owner's name, or the project's title). */
export function clientNameOf(people: readonly Pick<PersonView, 'role' | 'name'>[], fallback: string): string {
  return people.find((p) => p.role === 'owner')?.name ?? fallback;
}

/** One project's line on the manager's workspace (and the client's hub band). */
export function projectSummaryParts(input: {
  versions: readonly BudgetVersionPlan[];
  items: ReadonlyArray<Pick<HubBudgetItemView, 'kind' | 'category' | 'amount' | 'status'>>;
  milestones: readonly MilestoneView[];
  payments: ReadonlyArray<Pick<PaymentRequestView, 'status'>>;
  today: string;
}): Pick<ManagerProjectSummary, 'budget' | 'nextMilestone' | 'approvals'> {
  const { version, health } = projectBudget(input.versions, input.items);
  const next = nextMilestone(input.milestones);
  return {
    budget: {
      versionNo: version?.versionNo ?? null,
      approved: health.approved,
      forecast: health.forecast,
      variance: health.variance,
      variancePct: health.variancePct,
      status: health.status,
    },
    nextMilestone: next
      ? {
          id: next.id,
          title: next.title,
          stage: next.stage,
          plannedEnd: next.plannedEnd,
          daysLeft: daysBetween(input.today, next.plannedEnd),
          late: next.plannedEnd < input.today,
        }
      : null,
    approvals: approvalCounts(input.payments),
  };
}
