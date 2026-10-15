import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatCount, formatDeltaPct } from '@/lib/command/format';
import type { UnansweredItem } from '@/lib/command/types';
import { CoverageBadge } from './badges';

/** Week-over-week trend, arrow + sign + words. Rising questions are the point, so up is magenta, not "good" green. */
export function TrendText({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-ink-500">חדש השבוע</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={up ? 'inline-flex items-center gap-1 text-xs font-semibold text-primary-700' : 'inline-flex items-center gap-1 text-xs text-ink-600'}>
      <Icon className="size-3.5" aria-hidden="true" />
      <bdi dir="ltr">{formatDeltaPct(pct)}</bdi>
      <span className="font-normal text-ink-500">השבוע</span>
    </span>
  );
}

export default function UnansweredList({ items }: { items: readonly UnansweredItem[] }) {
  return (
    <ol className="divide-y divide-ink-100">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 font-semibold text-ink-900">{item.label}</p>
            <p className="flex items-center gap-3 text-sm">
              <span className="text-ink-700">
                <bdi dir="ltr" className="font-bold text-ink-900">{formatCount(item.asks)}</bdi> שאלות
              </span>
              {item.level && <TrendText pct={item.trendPct} />}
            </p>
          </div>
          {item.example && item.example !== item.label && <p className="mt-0.5 text-sm text-ink-600">״{item.example}״</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {item.level && <CoverageBadge level={item.level} size="sm" />}
            {item.suggestedTitle && (
              <p className="min-w-0 text-xs text-ink-600">
                <span className="font-semibold text-ink-700">סרטון מוצע: </span>
                {item.suggestedTitle}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
