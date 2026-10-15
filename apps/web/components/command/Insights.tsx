import Link from 'next/link';
import { FileText, PlayCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatCount, formatShare } from '@/lib/command/format';
import type { InsightTopic, NearestContent } from '@/lib/command/types';
import { CoverageBadge } from './badges';
import { TrendText } from './UnansweredList';

/** Low-coverage topics ranked by volume (the brief's "next 10 videos"). */
export function nextVideos(topics: readonly InsightTopic[], limit = 10): InsightTopic[] {
  return topics
    .filter((t) => t.level !== 'covered')
    .sort((a, b) => b.asks - a.asks || (a.level === b.level ? 0 : a.level === 'gap' ? -1 : 1))
    .slice(0, limit);
}

function NearestLink({ item, linkable }: { item: NearestContent; linkable: boolean }) {
  const Icon = item.kind === 'video' ? PlayCircle : FileText;
  const body = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
      <span className="min-w-0">
        <span className="text-ink-800">{item.title}</span>{' '}
        <span className="whitespace-nowrap text-xs text-ink-500">
          ({item.kind === 'video' ? 'סרטון' : 'מאמר'} · דמיון <bdi dir="ltr">{item.similarity.toFixed(2)}</bdi>)
        </span>
      </span>
    </>
  );
  return (
    <li>
      {linkable ? (
        <Link href={item.href} className="flex items-start gap-1.5 rounded hover:text-primary-700 hover:underline">
          {body}
        </Link>
      ) : (
        <span className="flex items-start gap-1.5">{body}</span>
      )}
    </li>
  );
}

export function NextVideos({ topics, linkContent = true }: { topics: readonly InsightTopic[]; linkContent?: boolean }) {
  if (topics.length === 0) {
    return <p className="text-sm text-ink-500">אין כרגע נושאים בלי תשובה. כל מה שבונים שאלו בתקופה מכוסה בתוכן הקיים.</p>;
  }
  return (
    <ol className="grid gap-3 lg:grid-cols-2">
      {topics.map((t, i) => (
        <li key={t.id} className="flex">
          <Card padding="none" className="w-full p-4 sm:p-5">
            <div className="flex gap-3 sm:gap-4">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-base font-extrabold text-primary-700 sm:size-10"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-title-sm text-ink-900 sm:text-title">
                  <span className="sr-only">{i + 1}. </span>
                  {t.suggestedTitle ?? t.label}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                  <span>
                    נושא: <span className="font-semibold text-ink-800">{t.label}</span>
                  </span>
                  <span>
                    <bdi dir="ltr" className="font-bold text-ink-900">{formatCount(t.asks)}</bdi> שאלות
                  </span>
                  <TrendText pct={t.trendPct} />
                  <CoverageBadge level={t.level} size="sm" />
                </p>
                {t.examples.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-ink-700">
                    {t.examples.slice(0, 3).map((e) => (
                      <li key={e.q}>
                        ״{e.q}״ <span className="text-xs text-ink-500">({formatCount(e.asks)})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                  <p className="font-semibold text-ink-800">{t.levelReason ?? (t.nearest.length ? 'התוכן הקרוב ביותר שיש היום' : 'אין עדיין תוכן קרוב')}</p>
                  {t.nearest.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {t.nearest.map((n) => (
                        <NearestLink key={`${n.kind}:${n.id}`} item={n} linkable={linkContent} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** Every topic of the run, covered ones included, as rows that also read well on a phone. */
export function TopicsTable({ topics }: { topics: readonly InsightTopic[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-card">
      <table className="w-full min-w-[40rem] text-start text-sm">
        <caption className="sr-only">כל הנושאים שבונים שאלו עליהם, לפי מספר השאלות</caption>
        <thead className="bg-ink-50 text-xs text-ink-600">
          <tr>
            <th scope="col" className="px-3 py-2 text-start font-semibold">נושא</th>
            <th scope="col" className="px-3 py-2 text-start font-semibold">שאלות</th>
            <th scope="col" className="px-3 py-2 text-start font-semibold">מגמה</th>
            <th scope="col" className="px-3 py-2 text-start font-semibold">כיסוי</th>
            <th scope="col" className="px-3 py-2 text-start font-semibold">התוכן הקרוב ביותר</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {topics.map((t) => (
            <tr key={t.id} className={cn(t.level === 'gap' && 'bg-primary-50/40')}>
              <td className="px-3 py-2.5 align-top">
                <p className="font-semibold text-ink-900">{t.label}</p>
                {t.examples[0] && <p className="mt-0.5 text-xs text-ink-500">״{t.examples[0].q}״</p>}
              </td>
              <td className="px-3 py-2.5 align-top font-bold tabular-nums text-ink-900">
                <bdi dir="ltr">{formatCount(t.asks)}</bdi>
              </td>
              <td className="px-3 py-2.5 align-top">
                <TrendText pct={t.trendPct} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <CoverageBadge level={t.level} size="sm" />
                <p className="mt-1 text-xs text-ink-500">
                  <bdi dir="ltr">{formatShare(t.coverage)}</bdi> · דמיון <bdi dir="ltr">{t.topSimilarity.toFixed(2)}</bdi>
                </p>
              </td>
              <td className="max-w-[16rem] px-3 py-2.5 align-top text-xs text-ink-700">
                {t.nearest[0] ? (
                  <Link href={t.nearest[0].href} className="hover:text-primary-700 hover:underline">
                    {t.nearest[0].title}
                  </Link>
                ) : (
                  <span className="text-ink-500">אין</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
