/**
 * Business reviews — live-site scale: 0–10 overall plus four sub-scores
 * (תמורה למחיר, זמינות ושירותיות, יחסי אנוש, אמינות ואיכות עבודה).
 * Members submit (always 'pending', enforced by the reviews_guard trigger);
 * staff moderate; public sees 'approved' only. author_name may be null
 * (anonymous migrated reviews).
 */
import { type DbClient, type Paginated, pageRange, unwrap } from './client';
import type { BusinessReviewStatsRow, ReviewRow, ReviewStatus, TablesInsert } from './types';

export const REVIEW_SCORE_LABELS = {
  score_value: 'תמורה למחיר',
  score_availability: 'זמינות ושירותיות',
  score_attitude: 'יחסי אנוש',
  score_reliability: 'אמינות ואיכות עבודה',
} as const;

export type ReviewScores = {
  score_value: number;
  score_availability: number;
  score_attitude: number;
  score_reliability: number;
};

export type PublicReview = Pick<
  ReviewRow,
  | 'id'
  | 'author_name'
  | 'rating'
  | 'score_value'
  | 'score_availability'
  | 'score_attitude'
  | 'score_reliability'
  | 'title'
  | 'body'
  | 'images'
  | 'published_at'
  | 'created_at'
>;

const PUBLIC_COLUMNS =
  'id, author_name, rating, score_value, score_availability, score_attitude, score_reliability, title, body, images, published_at, created_at';

function assertScore(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`${name} must be between 0 and 10`);
  }
}

/** Overall rating = mean of the four sub-scores, rounded to 0.1. */
export function overallFromScores(scores: ReviewScores): number {
  const values = [scores.score_value, scores.score_availability, scores.score_attitude, scores.score_reliability];
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export async function listApprovedReviews(db: DbClient, businessId: string): Promise<PublicReview[]> {
  return unwrap(
    await db
      .from('reviews')
      .select(PUBLIC_COLUMNS)
      .eq('business_id', businessId)
      .eq('status', 'approved')
      .order('published_at', { ascending: false, nullsFirst: false }),
  );
}

/** Aggregates per business; businesses without approved reviews are omitted. */
export async function getReviewStats(
  db: DbClient,
  businessIds: string[],
): Promise<Map<string, BusinessReviewStatsRow>> {
  if (businessIds.length === 0) return new Map();
  const rows = unwrap(await db.from('business_review_stats').select('*').in('business_id', businessIds));
  return new Map(rows.map((r) => [r.business_id, r]));
}

/** Member submission. The business must be published and not owned by the author. */
export async function submitReview(
  db: DbClient,
  input: { businessId: string; authorName: string | null; scores: ReviewScores; title?: string | null; body?: string | null },
): Promise<ReviewRow> {
  for (const [name, value] of Object.entries(input.scores)) assertScore(name, value);
  return unwrap(
    await db
      .from('reviews')
      .insert({
        business_id: input.businessId,
        author_name: input.authorName,
        rating: overallFromScores(input.scores),
        ...input.scores,
        title: input.title ?? null,
        body: input.body ?? null,
      })
      .select('*')
      .single(),
  );
}

export async function listMyReviews(db: DbClient, userId: string): Promise<ReviewRow[]> {
  return unwrap(await db.from('reviews').select('*').eq('member_id', userId).order('created_at', { ascending: false }));
}

// Admin -----------------------------------------------------------------------

export async function listReviewsForModeration(
  db: DbClient,
  opts: { status?: ReviewStatus; businessId?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<ReviewRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('reviews')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  query = query.eq('status', opts.status ?? 'pending');
  if (opts.businessId) query = query.eq('business_id', opts.businessId);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

export async function moderateReview(
  db: DbClient,
  id: string,
  status: Exclude<ReviewStatus, 'pending'>,
  moderatorId: string,
): Promise<ReviewRow> {
  const now = new Date().toISOString();
  return unwrap(
    await db
      .from('reviews')
      .update({
        status,
        moderated_by: moderatorId,
        moderated_at: now,
        published_at: status === 'approved' ? now : null,
      })
      .eq('id', id)
      .select('*')
      .single(),
  );
}

/** Import loader (service role): insert migrated reviews as-is. */
export async function insertMigratedReviews(db: DbClient, rows: TablesInsert<'reviews'>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = unwrap(
    await db
      .from('reviews')
      .insert(rows.map((r) => ({ ...r, source: 'migrated' as const })))
      .select('id'),
  );
  return inserted.length;
}
