'use server';

import { redirect } from 'next/navigation';
import { countRecentAnonymousReviews, getPublishedBusinessBySlug } from '@/lib/db/businesses';
import { type ReviewScores, overallFromScores, submitReview } from '@/lib/db/reviews';
import { getUser } from '@/lib/auth/session';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { decodeSlug } from '@/lib/directory/format';

export type ReviewFormState = { status: 'idle' } | { status: 'error'; message: string; fieldErrors?: Record<string, string> };

const SCORE_FIELDS: Array<keyof ReviewScores> = ['score_value', 'score_availability', 'score_attitude', 'score_reliability'];
const ANON_PER_HOUR = 5;

function text(formData: FormData, name: string, max: number): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Review submission. Members insert under RLS (the reviews_guard trigger
 * forces status 'pending' and member_id = caller). Visitors without an
 * account may also review, as on the live site; those rows are inserted by
 * the server with status 'pending' and no member. Either way nothing is
 * public until an editor approves it.
 */
export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  if (text(formData, 'website_url', 200)) redirect('/thank-you-review/'); // honeypot

  const slug = decodeSlug(text(formData, 'slug', 300));
  const authorName = text(formData, 'author_name', 80);
  const title = text(formData, 'title', 120);
  const body = text(formData, 'body', 5000);

  const fieldErrors: Record<string, string> = {};
  const scores = {} as ReviewScores;
  for (const key of SCORE_FIELDS) {
    const n = Number(text(formData, key, 4));
    if (!Number.isInteger(n) || n < 1 || n > 10) fieldErrors[key] = 'נא לבחור ציון';
    scores[key] = n;
  }
  if (authorName.length < 2) fieldErrors.author_name = 'שדה חובה';
  if (body.length < 10) fieldErrors.body = 'נא לכתוב לפחות כמה מילים (10 תווים)';
  if (formData.get('confirm') !== 'on') fieldErrors.confirm = 'יש לאשר';
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', message: 'נא לתקן את השדות המסומנים', fieldErrors };

  const user = await getUser();
  try {
    const business = await getPublishedBusinessBySlug(createClient(), slug);
    if (!business) return { status: 'error', message: 'בעל המקצוע לא נמצא.' };

    if (user) {
      if (business.owner_member_id === user.id) {
        return { status: 'error', message: 'לא ניתן לכתוב חוות דעת על העסק שלך.' };
      }
      await submitReview(createClient(), {
        businessId: business.id,
        authorName,
        scores,
        title: title || null,
        body,
      });
    } else {
      if (!isServiceRoleConfigured()) return { status: 'error', message: 'לא ניתן לשלוח כרגע. נסו שוב מאוחר יותר.' };
      const admin = createAdminClient();
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      if ((await countRecentAnonymousReviews(admin, business.id, since)) >= ANON_PER_HOUR) {
        return { status: 'error', message: 'התקבלו חוות דעת רבות על העסק בשעה האחרונה. נסו שוב מאוחר יותר.' };
      }
      const { error } = await admin.from('reviews').insert({
        business_id: business.id,
        member_id: null,
        author_name: authorName,
        rating: overallFromScores(scores),
        ...scores,
        title: title || null,
        body,
        status: 'pending',
        source: 'member',
      });
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/reviews_one_per_member_key|duplicate key/i.test(message)) {
      return { status: 'error', message: 'כבר כתבת חוות דעת על בעל מקצוע זה. תודה!' };
    }
    console.error('submitReviewAction failed', err);
    return { status: 'error', message: 'אירעה שגיאה בשליחה. נסו שוב בעוד רגע.' };
  }

  redirect(`/thank-you-review/?b=${encodeURIComponent(slug)}`);
}
