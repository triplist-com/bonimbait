import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';
import { formatPrice, parseStringList, type ServicePlanWithPrices } from '@/lib/db/commerce';

/** Lowest price of a plan, as "₪6,900" (prices exclude VAT). */
function priceLine(plan: ServicePlanWithPrices): { prefix: string | null; price: string } | null {
  const amounts = plan.prices.map((p) => p.price_agorot).filter((n) => n > 0);
  if (amounts.length === 0) return null;
  const min = Math.min(...amounts);
  return { prefix: amounts.length > 1 ? 'החל מ-' : null, price: formatPrice(min) };
}

/** Service plans teaser: three tracks, link to the full comparison. */
export default function PlansTeaser({ plans }: { plans: ServicePlanWithPrices[] }) {
  if (plans.length === 0) return null;
  return (
    <Section tone="white" labelledBy="plans-title">
      <SectionHeader
        id="plans-title"
        eyebrow="ניהול ופיקוח"
        title="ליווי מקצועי, בלי הפתעות בתקציב"
        highlight="בלי הפתעות"
        description="מתקציב מדויק ועד ניהול מלא עד המפתח. בוחרים את המסלול שמתאים לכם, ואפשר להתחיל מפגישת ייעוץ ללא עלות."
        action={{ href: '/membership-tiers/', label: 'להשוואת המסלולים' }}
      />
      <ul className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const featured = plan.is_featured;
          const price = priceLine(plan);
          const highlights = parseStringList(plan.highlights).slice(0, 4);
          return (
            <li key={plan.id}>
              <article
                className={cn(
                  'group relative flex h-full flex-col rounded-[1.75rem] p-6 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 sm:p-7',
                  featured ? 'bg-ink-950 text-white shadow-lift' : 'border border-ink-100 bg-paper hover:shadow-card-hover',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn('text-sm font-semibold', featured ? 'text-white/60' : 'text-ink-500')}>{plan.track_label}</span>
                  {featured && <span className="rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">הליווי המלא</span>}
                </div>
                <h3 className={cn('mt-2 text-title-lg', featured ? 'text-white' : 'text-ink-900')}>
                  <Link href="/membership-tiers/#plans" prefetch={false} className="after:absolute after:inset-0 after:content-['']">
                    {plan.name}
                  </Link>
                </h3>
                {plan.subtitle && <p className={cn('text-sm', featured ? 'text-primary-300' : 'text-primary-700')}>{plan.subtitle}</p>}
                {price && (
                  <p className="mt-5 flex items-baseline gap-1.5">
                    {price.prefix && <span className={cn('text-sm', featured ? 'text-white/70' : 'text-ink-600')}>{price.prefix}</span>}
                    <span className="text-4xl font-extrabold tabular-nums tracking-tight">{price.price}</span>
                  </p>
                )}
                <p className={cn('mt-1 text-xs', featured ? 'text-white/50' : 'text-ink-500')}>לא כולל מע״מ</p>
                <ul className="mt-6 space-y-2.5">
                  {highlights.map((h) => (
                    <li key={h} className={cn('flex items-start gap-2.5 text-sm', featured ? 'text-white/85' : 'text-ink-700')}>
                      <Check aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', featured ? 'text-primary-300' : 'text-primary-600')} />
                      {h}
                    </li>
                  ))}
                </ul>
                <span
                  className={cn(
                    'mt-auto inline-flex items-center gap-1.5 pt-7 text-sm font-bold',
                    featured ? 'text-white' : 'text-ink-900 group-hover:text-primary-700',
                  )}
                >
                  לפרטי המסלול
                  <ArrowLeft aria-hidden="true" className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
                </span>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
