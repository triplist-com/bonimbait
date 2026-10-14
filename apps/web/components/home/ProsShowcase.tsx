import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { Badge } from '@/components/ui/Badge';
import { initials } from '@/components/ui/Avatar';
import type { HomePro } from '@/lib/home/data';
import { SmartImage } from '@/components/ui/SmartImage';

function ProCard({ pro }: { pro: HomePro }) {
  const href = `/business/${pro.slug}/`;
  return (
    <li className="w-[72%] sm:w-[44%] lg:w-auto">
      <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-sand-50 to-sand-100">
          {pro.photo ? (
            <SmartImage
              src={pro.photo}
              alt=""
              fit="contain"
              sizes="(min-width: 1024px) 18rem, 72vw"
              className="object-bottom p-3 pb-0 transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-4xl font-extrabold text-primary-300">
              {initials(pro.name)}
            </span>
          )}
          {pro.specialty && (
            <Badge tone="outline" size="sm" className="absolute start-3 top-3 shadow-xs">
              {pro.specialty}
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h3 className="text-title text-ink-900">
            <Link href={href} prefetch={false} className="after:absolute after:inset-0 after:content-[''] group-hover:text-primary-700">
              {pro.name}
            </Link>
          </h3>
          {pro.region && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{pro.region}</span>
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            {pro.reviewCount > 0 ? (
              <RatingStars value={pro.ratingAvg} scale={10} count={pro.reviewCount} size="sm" />
            ) : (
              <span className="text-xs text-ink-500">עדיין אין חוות דעת</span>
            )}
            {pro.ratingPercent !== null && pro.reviewCount > 0 && (
              <span className="num rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">{pro.ratingPercent}%</span>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

/** "נבחרת המומלצים" teaser with community ratings. */
export default function ProsShowcase({ pros, total }: { pros: HomePro[]; total: number }) {
  if (pros.length === 0) return null;
  return (
    <Section tone="paper" labelledBy="pros-title">
      <SectionHeader
        id="pros-title"
        eyebrow="בעלי מקצוע שבדקנו"
        title="נבחרת המומלצים"
        highlight="נבחרת"
        description={
          total > 0
            ? `${total.toLocaleString('he-IL')} בעלי מקצוע וספקים, עם דירוג וחוות דעת של בונים כמוכם.`
            : 'בעלי מקצוע וספקים, עם דירוג וחוות דעת של בונים כמוכם.'
        }
        action={{ href: '/recommended/', label: 'לכל בעלי המקצוע' }}
      />
      <ul className="rail -mx-4 scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
        {pros.slice(0, 8).map((p) => (
          <ProCard key={p.slug} pro={p} />
        ))}
      </ul>
    </Section>
  );
}
