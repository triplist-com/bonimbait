import type { LeadListFilter } from '@/lib/db/leads';
import type { LeadStatus, LeadType } from '@/lib/db/types';
import { LEAD_TYPES } from '@/lib/leads/constants';

/** Legacy DB statuses shown under their workflow name. */
const STATUS_ALIASES: Record<string, LeadStatus[]> = {
  new: ['new'],
  contacted: ['contacted', 'in_progress'],
  won: ['won', 'qualified'],
  lost: ['lost', 'closed'],
  spam: ['spam'],
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export type LeadQuery = { type?: string; status?: string; from?: string; to?: string; business?: string; q?: string };

/** URL filters -> listLeads() filter (shared by the inbox and the CSV export). */
export function leadFilterFromQuery(q: LeadQuery): LeadListFilter {
  const filter: LeadListFilter = {};
  if (q.type && (LEAD_TYPES as readonly string[]).includes(q.type)) filter.type = q.type as LeadType;
  if (q.status && STATUS_ALIASES[q.status]) filter.status = STATUS_ALIASES[q.status];
  if (q.from && DATE.test(q.from)) filter.from = q.from;
  if (q.to && DATE.test(q.to)) filter.to = q.to;
  if (q.business && UUID.test(q.business)) filter.businessId = q.business;
  if (q.q) filter.q = q.q.slice(0, 100);
  return filter;
}
