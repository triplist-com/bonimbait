import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { SocialIcon } from '@/components/ui/SocialIcon';
import { COMMUNITY_STATS, WHATSAPP_COMMUNITY_PATH } from '@/lib/brand';
import { cn } from '@/lib/cn';

/** WhatsApp community CTA (links to the Leads workstream's join page). */
export default function CommunityCTA({ compact = false }: { compact?: boolean }) {
  const whatsapp = COMMUNITY_STATS.find((s) => s.id === 'whatsapp');
  return (
    <section
      aria-label="הצטרפות לקהילה"
      data-floating-cta="hide"
      className={cn('relative isolate overflow-hidden rounded-3xl border border-sand-200 bg-sand-50', compact ? 'p-6' : 'p-8 sm:p-12')}
    >
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-2xl bg-whatsapp text-ink-950 shadow-card">
          <SocialIcon id="whatsapp" className="size-8" />
        </span>
        <div>
          <h2 className={cn('mb-2 text-ink-900', compact ? 'text-title-lg' : 'text-headline-sm')}>בונים בית? אתם לא לבד</h2>
          <p className="max-w-2xl text-body text-ink-600">
            {whatsapp ? (
              <>
                <span className="num font-bold text-ink-900">{whatsapp.value}</span> משפחות בונות ומשפצות בקבוצות WhatsApp אזוריות:
                המלצות על בעלי מקצוע ותשובות מאנשים שכבר עברו את זה.
              </>
            ) : (
              'קבוצות WhatsApp אזוריות של משפחות בונות ומשפצות: המלצות על בעלי מקצוע ותשובות מאנשים שכבר עברו את זה.'
            )}
          </p>
        </div>
        <ButtonLink href={WHATSAPP_COMMUNITY_PATH} variant="secondary" size="lg" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
          הצטרפו לקבוצה באזורכם
        </ButtonLink>
      </div>
    </section>
  );
}
