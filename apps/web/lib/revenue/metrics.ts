import 'server-only';

/**
 * revenue_business_metrics() reads every visitor's question text and every
 * lead's project-file questions with the patterns it is given, so it is
 * SERVICE-ROLE ONLY (20261014131000_qa_revenue_metrics_service_only.sql):
 * with caller-supplied patterns it would be a counting oracle over other
 * people's questions. The portal and the partner report call it through
 * here: the caller's own session must own the business (or be staff), and
 * the patterns are built on the server (topicPatterns()).
 */
import type { RevenueDb } from './db';
import { revenueAdminDb } from './db';

export class MetricsForbiddenError extends Error {
  constructor() {
    super('revenue metrics: the caller neither owns the business nor is staff');
  }
}

/** The caller (their RLS-bound session) owns the business, or is staff. */
export async function canReadBusinessMetrics(userDb: RevenueDb, businessId: string): Promise<boolean> {
  const [own, staff] = await Promise.all([
    userDb.rpc('revenue_owns_business', { p_business: businessId }),
    userDb.rpc('is_staff'),
  ]);
  return own.data === true || staff.data === true;
}

/**
 * The metrics of one business for [from, to), for a caller who owns it or is
 * staff. Throws MetricsForbiddenError otherwise. `patterns` must come from
 * topicPatterns() (server-built), never from a request.
 */
export async function businessMetrics(
  userDb: RevenueDb,
  businessId: string,
  range: { from: string; to: string },
  patterns: string[],
  opts: { authorized?: boolean } = {},
) {
  if (!opts.authorized && !(await canReadBusinessMetrics(userDb, businessId))) throw new MetricsForbiddenError();
  return revenueAdminDb().rpc('revenue_business_metrics', {
    p_business_id: businessId,
    p_from: range.from,
    p_to: range.to,
    p_patterns: patterns,
  });
}
