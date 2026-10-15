import Link from 'next/link';
import { chipClasses } from '@/components/ui/Chip';
import { PERIODS, type PeriodDays } from '@/lib/command/types';

const LABELS: Record<PeriodDays, string> = { 7: '7 ימים', 30: '30 יום', 90: '90 יום' };

/**
 * The one filter row above the dashboard: 7 / 30 / 90 days. Plain links, so
 * the period lives in the URL (shareable, back-button friendly) and the page
 * stays a Server Component.
 */
export default function PeriodSelector({ current, href }: { current: PeriodDays; href: (days: PeriodDays) => string }) {
  return (
    <nav aria-label="תקופה" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-600">תקופה:</span>
      {PERIODS.map((days) => (
        <Link
          key={days}
          href={href(days)}
          scroll={false}
          aria-current={days === current ? 'page' : undefined}
          className={chipClasses({ selected: days === current, size: 'sm' })}
        >
          {LABELS[days]}
        </Link>
      ))}
    </nav>
  );
}
