import Link from 'next/link';
import { ArrowLeft, Lock, MonitorPlay } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SUGGESTED_ADVISOR_NAME, type ResolvedPillar } from '@/lib/pitch/pillars';
import PillarIcon from './PillarIcon';

function PillarCard({ pillar, index, advisorIsDefault }: { pillar: ResolvedPillar; index: number; advisorIsDefault: boolean }) {
  const [demo, ...moreDemos] = pillar.demos;
  const titleId = `pillar-${pillar.id}`;
  return (
    <li className="flex w-[84%] sm:w-auto">
      <article
        aria-labelledby={titleId}
        className="flex w-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card transition-shadow duration-300 hover:shadow-card-hover sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100">
            <PillarIcon name={pillar.icon} className="size-6" />
          </span>
          <span className="num text-sm font-bold text-ink-300" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        <h3 id={titleId} className="mt-5 text-title-lg text-ink-900">
          {pillar.name}
          {pillar.subname && <span className="block text-base font-bold text-primary-700">{pillar.subname}</span>}
        </h3>
        {pillar.id === 'P1' && advisorIsDefault && (
          <p className="mt-1 text-xs text-ink-500">השם לבחירתכם, למשל ״{SUGGESTED_ADVISOR_NAME}״.</p>
        )}
        <p className="mt-3 text-body-sm text-ink-700">{pillar.valueLine}</p>

        <div className="mt-4 rounded-2xl bg-sand-50 p-3.5 text-sm leading-6 text-ink-700 ring-1 ring-inset ring-sand-200">
          <span className="font-bold text-ink-900">בהדגמה: </span>
          {pillar.wow}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          {demo && (
            <ButtonLink href={demo.href} size="sm" variant="secondary" iconStart={<MonitorPlay aria-hidden="true" />}>
              פתחו הדגמה
            </ButtonLink>
          )}
          {pillar.anchor && (
            <ButtonLink href={pillar.anchor} size="sm" variant="secondary" iconEnd={<ArrowLeft aria-hidden="true" className="ltr:rotate-180" />}>
              לפרטים
            </ButtonLink>
          )}
          {pillar.links.map((link) => (
            <ButtonLink
              key={link.href}
              href={link.href}
              size="sm"
              variant="outline"
              prefetch={false}
              iconStart={link.staffOnly ? <Lock aria-hidden="true" /> : undefined}
              title={link.staffOnly ? 'דורש כניסה כמנהל' : undefined}
            >
              {link.label}
            </ButtonLink>
          ))}
          {pillar.status === 'soon' && (
            <Badge tone="sand" dot>
              בקרוב
            </Badge>
          )}
        </div>
        {moreDemos.length > 0 && (
          <p className="mt-3 text-xs text-ink-500">
            עוד בהדגמה:{' '}
            {moreDemos.map((d, i) => (
              <span key={d.slug}>
                {i > 0 && ' · '}
                <Link href={d.href} className="link">
                  {d.title}
                </Link>
              </span>
            ))}
          </p>
        )}
      </article>
    </li>
  );
}

/** Section 3: the pillars in demo order, with registry-driven demo links. */
export default function PillarGrid({ pillars, advisorIsDefault }: { pillars: ResolvedPillar[]; advisorIsDefault: boolean }) {
  const live = pillars.filter((p) => p.demos.length > 0).length;
  return (
    <Section tone="white" id="pillars" labelledBy="pillars-title" className="scroll-mt-8 md:scroll-mt-0">
      <SectionHeader
        id="pillars-title"
        eyebrow={
          <>
            בונים בית <span dir="ltr">OS</span>
          </>
        }
        title="שמונה חלקים, מערכת אחת"
        highlight="מערכת אחת"
        description="כל חלק מחובר לכסף: שאלה הופכת לתיק פרויקט, תיק הופך לפגישה, פגישה הופכת לתוכנית ליווי. מסכי ההדגמה רצים על נתונים לדוגמה; מסכי האתר הם המוצר עצמו."
      />
      {live > 0 && (
        <p className="-mt-4 mb-8 text-sm text-ink-500 sm:-mt-6">
          <span className="num font-semibold text-ink-700">{live}</span> מתוך <span className="num">{pillars.length}</span> חלקים
          עם מסך הדגמה פתוח כרגע. השאר מצטרפים כשהם מוכנים.
        </p>
      )}
      <ol className="rail -mx-4 scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {pillars.map((pillar, i) => (
          <PillarCard key={pillar.id} pillar={pillar} index={i} advisorIsDefault={advisorIsDefault} />
        ))}
      </ol>
    </Section>
  );
}
