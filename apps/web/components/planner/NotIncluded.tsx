import { Armchair, Landmark, LifeBuoy, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { rangeText } from '@/lib/planner/format';
import type { PlannerEstimate, PriceBook } from '@/lib/planner/types';

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-ink-100 bg-white p-4 break-inside-avoid">
      <span aria-hidden="true" className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-ink-800 [&_svg]:size-[1.125rem]">
        {icon}
      </span>
      <div>
        <h3 className="text-title-sm text-ink-900">{title}</h3>
        <p className="mt-0.5 text-body-sm text-ink-600">{children}</p>
      </div>
    </li>
  );
}

/**
 * "What the number leaves out": the owner's warning that m² × price is only part
 * of the picture (VAT, the plot, moving-in, contingency). Server-safe.
 */
export function NotIncluded({ estimate, book }: { estimate: PlannerEstimate; book: PriceBook }) {
  const vat = estimate.totalWithVat;
  const [withLo, withHi] = book.contingencyPct.withBudget;
  const [withoutLo, withoutHi] = book.contingencyPct.withoutBudget;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      <Item icon={<Receipt />} title={`מע״מ ${estimate.vatRatePct}%`}>
        כל הסכומים לפני מע״מ. כולל מע״מ: <span className="font-semibold text-ink-800">{rangeText(vat)}</span>.
      </Item>
      <Item icon={<Landmark />} title="המגרש ומס הרכישה">
        מס רכישה של <span className="num">5%–6%</span> על המגרש, ועוד עורך דין ותיווך. בודקים אגרות והיטלים עוד לפני הקנייה.
      </Item>
      <Item icon={<Armchair />} title="אכלוס">
        ריהוט, מכשירי חשמל ווילונות: <span className="font-semibold text-ink-800">{rangeText(estimate.movingIn)}</span> לבית בגודל הזה.
      </Item>
      <Item icon={<LifeBuoy />} title="בלת״מים (רזרבה)">
        עם תקציב מקצועי מספיקים <span className="num">{withLo}%–{withHi}%</span>, כלומר{' '}
        <span className="font-semibold text-ink-800">{rangeText(estimate.contingency.withBudget)}</span>. בלי תקציב מסודר צריך{' '}
        <span className="num">{withoutLo}%–{withoutHi}%</span>.
      </Item>
    </ul>
  );
}
