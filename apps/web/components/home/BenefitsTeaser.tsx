import Link from 'next/link';
import { ArrowLeft, Gift } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Badge } from '@/components/ui/Badge';
import type { HomeBenefit } from '@/lib/home/data';

/** Community benefits shop teaser. */
export default function BenefitsTeaser({ items }: { items: HomeBenefit[] }) {
  if (items.length === 0) return null;
  return (
    <Section tone="sand" labelledBy="benefits-title">
      <SectionHeader
        id="benefits-title"
        eyebrow={
          <>
            <Gift aria-hidden="true" className="size-4" />
            חנות ההטבות
          </>
        }
        title="הטבות בלעדיות לחברי הקהילה"
        highlight="בלעדיות"
        description="הנחות ומתנות מספקים שעברו את הסינון שלנו. כוח הקנייה של אלפי משפחות בונות."
        action={{ href: '/הטבות-לקהילה/', label: 'לכל ההטבות' }}
      />
      <ul className="rail -mx-4 scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {items.map((p) => (
          <li key={p.slug} className="w-[82%] sm:w-auto">
            <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-sand-200 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="relative aspect-[16/10] overflow-hidden bg-sand-100">
                {p.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- product images from Storage
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                )}
                {p.tag && (
                  <Badge tone="ink" size="sm" className="absolute start-3 top-3">
                    {p.tag}
                  </Badge>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-bold text-primary-700">לחברי קהילת בונים בית</p>
                <h3 className="mt-1.5 text-title text-ink-900">
                  <Link href={`/product/${p.slug}/`} prefetch={false} className="after:absolute after:inset-0 after:content-['']">
                    {p.name}
                  </Link>
                </h3>
                {p.subtitle && <p className="mt-2 line-clamp-2 text-sm text-ink-600">{p.subtitle}</p>}
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-bold text-ink-900 group-hover:text-primary-700">
                  לפרטי ההטבה
                  <ArrowLeft aria-hidden="true" className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
                </span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </Section>
  );
}
