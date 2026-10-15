import { CalendarCheck, Calculator, MessageCircle, Route, Sparkles, Star, type LucideIcon } from 'lucide-react';
import { VALUE_STRIP, type ValueIcon } from '@/lib/home/content';

const ICONS: Record<ValueIcon, LucideIcon> = {
  answer: Sparkles,
  roadmap: Route,
  budget: Calculator,
  pros: Star,
  community: MessageCircle,
  consult: CalendarCheck,
};

/** Six things a builder gets here (copy in lib/home/content.ts). */
export default function ValueStrip() {
  return (
    <section aria-labelledby="value-title" className="pb-6 pt-14 sm:pt-20">
      <div className="container-page">
        <h2 id="value-title" className="mx-auto mb-8 max-w-2xl text-center text-headline-sm text-ink-900">
          כל מה שצריך כדי לבנות, <span className="text-primary-600">במקום אחד</span>
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {VALUE_STRIP.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.text} className="flex flex-col items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:gap-4 sm:p-5">
                <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 sm:size-12">
                  <Icon className="size-5 sm:size-6" />
                </span>
                <span className="text-[0.9375rem] font-semibold leading-snug text-ink-900 sm:text-[1.0625rem]">{item.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
