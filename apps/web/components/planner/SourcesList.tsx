import Link from 'next/link';
import { FileText, Mic } from 'lucide-react';
import { absoluteUrl } from '@/lib/site';
import { shortDate } from '@/lib/planner/format';
import { momentClock } from '@/lib/planner/warnings';
import type { PriceBook } from '@/lib/planner/types';

/**
 * Where the numbers come from: the owner's 2026 articles and podcast moments,
 * dated. `print` shows full URLs (the report is read on paper). Server-safe.
 */
export function SourcesList({ book, print = false, all = false }: { book: PriceBook; print?: boolean; all?: boolean }) {
  const sources = all ? book.sources : book.sources.filter((s) => s.primary);
  return (
    <ul className="space-y-3">
      {sources.map((s) => {
        const Icon = s.kind === 'podcast' ? Mic : FileText;
        return (
          <li key={s.id} className="flex gap-3 break-inside-avoid">
            <span aria-hidden="true" className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 [&_svg]:size-4">
              <Icon />
            </span>
            <div className="min-w-0">
              <Link href={s.href} className="font-semibold text-ink-900 underline-offset-4 hover:text-primary-700 hover:underline">
                {s.title}
              </Link>
              <p className="text-sm text-ink-600">
                <span>{s.kind === 'podcast' ? 'פודקאסט' : 'מאמר'}</span>
                {' · '}
                <time dateTime={s.date} className="num">
                  {shortDate(s.date)}
                </time>
                {s.startSec !== undefined && (
                  <>
                    {' · '}
                    <span>
                      מדקה <span className="num">{momentClock(s.startSec)}</span>
                    </span>
                  </>
                )}
              </p>
              {s.quote && <p className="mt-0.5 text-sm text-ink-700">&quot;{s.quote}&quot;</p>}
              {print && (
                <p dir="ltr" className="mt-0.5 break-all text-start text-xs text-ink-500">
                  {absoluteUrl(s.href)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
