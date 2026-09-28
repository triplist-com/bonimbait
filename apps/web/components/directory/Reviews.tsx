import type { PublicReview } from '@/lib/db/reviews';
import { REVIEW_SCORE_LABELS } from '@/lib/db/reviews';
import type { BusinessReviewStatsRow } from '@/lib/db/types';
import { formatHebrewDate, formatScore, reviewCountLabel } from '@/lib/directory/format';

type ScoreKey = keyof typeof REVIEW_SCORE_LABELS;
const SCORE_KEYS = Object.keys(REVIEW_SCORE_LABELS) as ScoreKey[];

/** Explanations shown under each category on the live profile ("שיטת הדירוג של בונים בית"). */
const SCORE_HELP: Record<ScoreKey, string> = {
  score_value:
    'עד כמה המחיר של בעל המקצוע היה הוגן ביחס לתמורה שקיבלתם, ביחס למפרט שלכם ולשירות שקיבלתם.',
  score_availability:
    'עד כמה בעל המקצוע היה זמין טלפונית והגיע מהר לתיקון או למענה, גם אחרי שהסתיים תהליך הבניה או השיפוץ.',
  score_attitude: 'עד כמה בעל המקצוע או הספק היו אדיבים, והאם החוויה מולם הייתה נעימה לאורך התהליך.',
  score_reliability:
    'עד כמה בעל המקצוע היה אמין ומקצועי, האם איכות העבודה ראויה והאם הציע פתרונות חכמים לבעיות בשטח.',
};

const AVG_KEY: Record<ScoreKey, keyof BusinessReviewStatsRow> = {
  score_value: 'score_value_avg',
  score_availability: 'score_availability_avg',
  score_attitude: 'score_attitude_avg',
  score_reliability: 'score_reliability_avg',
};

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Number(value) * 10));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="font-bold text-gray-900">{formatScore(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Aggregate block: overall percent (ציון משוקלל) + the four category averages. */
export function ScoreSummary({ stats }: { stats: BusinessReviewStatsRow | null }) {
  if (!stats || stats.review_count === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-gray-600">
        עדיין אין חוות דעת על בעל המקצוע. עבדתם איתו? היו הראשונים לדרג.
      </p>
    );
  }
  return (
    <div className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-card md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-50 px-6 py-4 text-center">
        <span className="text-sm text-emerald-800">ציון משוקלל</span>
        <span className="text-4xl font-extrabold text-emerald-700">{stats.rating_percent}%</span>
        <span className="text-sm text-emerald-800">{reviewCountLabel(stats.review_count)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SCORE_KEYS.map((key) => (
          <div key={key}>
            <ScoreBar label={REVIEW_SCORE_LABELS[key]} value={stats[AVG_KEY[key]] as number | null} />
            <p className="mt-1 text-xs leading-5 text-gray-500">{SCORE_HELP[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  const body = review.body?.trim() ?? '';
  const long = body.length > 280;
  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{review.author_name?.trim() || 'לקוח/ה של בונים בית'}</p>
          <p className="text-xs text-gray-500">{formatHebrewDate(review.published_at ?? review.created_at)}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-bold text-emerald-700">
          {formatScore(review.rating)}/10
        </span>
      </header>
      {review.title && <h3 className="mt-3 font-semibold text-gray-900">{review.title}</h3>}
      {body &&
        (long ? (
          <details className="group mt-2">
            <summary className="cursor-pointer list-none text-gray-700">
              <span className="whitespace-pre-line group-open:hidden">{body.slice(0, 260)}…</span>
              <span className="hidden whitespace-pre-line group-open:inline">{body}</span>
              <span className="ms-1 text-sm font-semibold text-primary group-open:hidden">קרא עוד</span>
            </summary>
          </details>
        ) : (
          <p className="mt-2 whitespace-pre-line text-gray-700">{body}</p>
        ))}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {SCORE_KEYS.map((key) => (
          <div key={key} className="flex justify-between gap-2 sm:block">
            <dt className="text-gray-500">{REVIEW_SCORE_LABELS[key]}</dt>
            <dd className="font-semibold text-gray-900">{formatScore(review[key])}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

const INITIAL = 6;

export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) return null;
  const head = reviews.slice(0, INITIAL);
  const rest = reviews.slice(INITIAL);
  return (
    <div className="space-y-4">
      {head.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-center font-semibold text-primary group-open:hidden">
            הצג עוד חוות דעת ({rest.length})
          </summary>
          <div className="space-y-4">
            {rest.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
