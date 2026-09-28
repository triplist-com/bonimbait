'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { type ReviewFormState, submitReviewAction } from '@/app/business/[slug]/review/actions';
import { REVIEW_SCORE_LABELS } from '@/lib/db/reviews';

const input =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const IDLE: ReviewFormState = { status: 'idle' };
const SCORES = Object.entries(REVIEW_SCORE_LABELS) as Array<[keyof typeof REVIEW_SCORE_LABELS, string]>;

function Err({ state, name }: { state: ReviewFormState; name: string }) {
  const msg = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  return msg ? <span className="mt-1 block text-xs text-red-600">{msg}</span> : null;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-60 sm:w-auto sm:px-10"
    >
      {pending ? 'שולח…' : 'שליחת חוות דעת'}
    </button>
  );
}

export default function ReviewForm({ slug, defaultName }: { slug: string; defaultName: string }) {
  const [state, action] = useFormState(submitReviewAction, IDLE);
  return (
    <form action={action} className="relative space-y-6" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className="mb-3 font-semibold text-gray-900">דרגו מ-1 עד 10 *</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {SCORES.map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
              <select name={key} required defaultValue="" className={input}>
                <option value="" disabled>
                  בחרו ציון
                </option>
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <Err state={state} name={key} />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">שם (יוצג באתר) *</span>
        <input name="author_name" required maxLength={80} defaultValue={defaultName} autoComplete="name" className={input} />
        <Err state={state} name="author_name" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">כותרת</span>
        <input name="title" maxLength={120} className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">ספרו על החוויה שלכם *</span>
        <textarea name="body" required rows={6} maxLength={5000} className={input} />
        <Err state={state} name="body" />
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>אני מאשר/ת שעבדתי עם בעל המקצוע ושחוות הדעת משקפת את החוויה שלי.</span>
      </label>
      <Err state={state} name="confirm" />
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Submit />
    </form>
  );
}
