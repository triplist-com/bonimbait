import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen, SlidersHorizontal } from 'lucide-react';
import { SCENARIOS, getRelatedScenarios, getScenarioBySlug } from '@/lib/calculator-scenarios';
import Breadcrumbs from '@/components/content/Breadcrumbs';
import StructuredData from '@/components/StructuredData';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EstimateSummary } from '@/components/planner/EstimateSummary';
import { Money } from '@/components/planner/Money';
import { NotIncluded } from '@/components/planner/NotIncluded';
import { OverrunWarnings } from '@/components/planner/OverrunWarnings';
import { SourcesList } from '@/components/planner/SourcesList';
import { StageBreakdown } from '@/components/planner/StageBreakdown';
import { estimateBudget } from '@/lib/planner/engine';
import { asOfBadge, isolateRanges, perM2Text, rangeText, stripIsolates } from '@/lib/planner/format';
import { loadPriceBook } from '@/lib/planner/price-book';
import { plannerQuery } from '@/lib/planner/prefill';
import { PLANNER_PATH } from '@/lib/planner/share';
import { whatIfVariants } from '@/lib/planner/variants';
import { absoluteUrl } from '@/lib/site';

interface PageProps {
  params: { slug: string };
}

// The 20 scenarios are built at deploy time and revalidated (admin price book saves revalidate at once).
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const scenario = getScenarioBySlug(params.slug);
  if (!scenario) return {};
  const url = absoluteUrl(`/calculator/${scenario.slug}/`);
  return {
    title: scenario.title,
    description: scenario.description,
    alternates: { canonical: url },
    openGraph: { title: scenario.title, description: scenario.description, url, siteName: 'בונים בית', locale: 'he_IL', type: 'website' },
  };
}

/** Planner link with a scenario's answers (the result opens straight away). */
function plannerLink(input: Parameters<typeof plannerQuery>[0], from: string): string {
  return `${PLANNER_PATH}?${plannerQuery(input)}&from=${encodeURIComponent(from)}`;
}

export default async function CalculatorScenarioPage({ params }: PageProps) {
  const scenario = getScenarioBySlug(params.slug);
  if (!scenario) notFound();

  const { book } = await loadPriceBook();
  const estimate = estimateBudget(scenario.input, book);
  const related = getRelatedScenarios(scenario).map((s) => ({ scenario: s, estimate: estimateBudget(s.input, book) }));
  const variants = whatIfVariants(estimate.input).map((v) => ({ ...v, estimate: estimateBudget(v.input, book) }));
  const name = scenario.title.replace(/^עלות /, '');
  const faq = [
    {
      q: `כמה עולה ${name}?`,
      a: `לפי הנתונים של בונים בית (${asOfBadge(estimate.validAsOf)}): ${rangeText(estimate.total)} לתכנון ובנייה, לפני מע״מ, בלי מגרש ובלי אכלוס. זה טווח של ±${estimate.rangePct}% סביב ${estimate.perM2.mid.toLocaleString('he-IL')} ₪ למ״ר.`,
    },
    {
      q: 'מה כולל הסכום?',
      a: `תכנון ואגרות, שלד, תשתיות (חשמל, אינסטלציה, מיזוג ואיטום) וגמרים. לא כולל: המגרש ומס הרכישה, מע״מ ${estimate.vatRatePct}%, אכלוס (${rangeText(estimate.movingIn)}) ורזרבה לבלת״מים.`,
    },
    {
      q: 'האם ההערכה כוללת מע״מ?',
      a: `לא. כל הסכומים לפני מע״מ. כולל מע״מ ${estimate.vatRatePct}% הטווח הוא ${rangeText(estimate.totalWithVat)}.`,
    },
  ];
  const tuneHref = plannerLink(estimate.input, `scenario-${scenario.slug}`);

  return (
    <>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripIsolates(f.a) } })),
        }}
      />
      <PageHeader
        crumbs={
          <Breadcrumbs
            crumbs={[
              { label: 'ראשי', href: '/' },
              { label: 'מחשבון תקציב', href: '/calculator/' },
              { label: scenario.title, href: `/calculator/${scenario.slug}/` },
            ]}
          />
        }
        eyebrow={`תרחיש לדוגמה · ${asOfBadge(estimate.validAsOf)}`}
        title={scenario.title}
        description={isolateRanges(scenario.description)}
      />

      <div className="container-page space-y-12 pb-16 pt-8 sm:space-y-16 sm:pb-24 sm:pt-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
          <EstimateSummary estimate={estimate} headingId="scenario-total" label="הערכה לתרחיש הזה">
            {scenario.note && <p className="mt-5 text-body-sm text-white/80">{isolateRanges(scenario.note)}</p>}
          </EstimateSummary>
          <aside data-floating-cta="hide" aria-labelledby="scenario-next" className="rounded-4xl border border-sand-200 bg-sand-50 p-6 shadow-card sm:p-7">
            <p className="eyebrow">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              הבית שלכם שונה?
            </p>
            <h2 id="scenario-next" className="mt-2 text-title-lg text-ink-900">
              התאימו את התקציב לבית שלכם
            </h2>
            <p className="mt-2 text-body-sm text-ink-600">חמש שאלות קצרות: שטח, קומות, אזור, רמת גמר ותוספות. התוצאה מיד.</p>
            <div className="mt-5 space-y-3">
              <ButtonLink href={tuneHref} size="lg" fullWidth iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
                למחשבון עם הנתונים האלה
              </ButtonLink>
              <ConsultationCTA source={`scenario-${scenario.slug}`} label="פגישת ייעוץ תקציב — ללא עלות" buttonVariant="outline" fullWidth size="lg" />
            </div>
          </aside>
        </div>

        <section aria-labelledby="scenario-stages">
          <p className="eyebrow mb-2">לפי 7 השלבים</p>
          <h2 id="scenario-stages" className="mb-5 text-headline-sm text-ink-900">
            לאן הולך הכסף
          </h2>
          <div className="rounded-3xl border border-ink-100 bg-white px-5 shadow-card sm:px-7">
            <StageBreakdown estimate={estimate} headingId="scenario-stages" />
          </div>
        </section>

        <section aria-labelledby="scenario-whatif">
          <p className="eyebrow mb-2">ואם משנים פרט אחד?</p>
          <h2 id="scenario-whatif" className="mb-5 text-headline-sm text-ink-900">
            אותו בית, שינוי אחד
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {variants.map((v) => (
              <li key={v.id}>
                <Link
                  href={plannerLink(v.input, `scenario-${scenario.slug}`)}
                  className="group flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  <span className="text-title-sm text-ink-900">{v.label}</span>
                  <Money min={v.estimate.total.min} max={v.estimate.total.max} className="mt-2 text-title-lg font-extrabold text-ink-900" unitClassName="text-base font-bold" />
                  <span className="mt-0.5 text-sm text-ink-600">{perM2Text(v.estimate.perM2)}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:underline">
                    פתחו במחשבון
                    <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="scenario-outside">
          <p className="eyebrow mb-2">התמונה המלאה</p>
          <h2 id="scenario-outside" className="mb-5 text-headline-sm text-ink-900">
            מה לא נכנס לסכום
          </h2>
          <NotIncluded estimate={estimate} book={book} />
        </section>

        <section aria-labelledby="scenario-overruns">
          <p className="eyebrow mb-2">מהשטח</p>
          <h2 id="scenario-overruns" className="mb-5 text-headline-sm text-ink-900">
            פה הכי קל לחרוג
          </h2>
          <OverrunWarnings estimate={estimate} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="scenario-faq" className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-7">
            <h2 id="scenario-faq" className="text-title-lg text-ink-900">
              שאלות נפוצות
            </h2>
            <dl className="mt-4 space-y-4">
              {faq.map((f) => (
                <div key={f.q}>
                  <dt className="text-title-sm text-ink-900">{f.q}</dt>
                  <dd className="mt-1 text-body-sm text-ink-700">{f.a}</dd>
                </div>
              ))}
            </dl>
            {scenario.readMore && (
              <p className="mt-5 border-t border-ink-100 pt-4 text-body-sm">
                <BookOpen aria-hidden="true" className="me-1.5 inline size-4 text-primary-600" />
                להעמקה:{' '}
                <Link href={scenario.readMore.href} className="font-semibold text-primary underline-offset-4 hover:underline">
                  {scenario.readMore.title}
                </Link>
              </p>
            )}
          </section>
          <section aria-labelledby="scenario-sources" className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-7">
            <h2 id="scenario-sources" className="text-title-lg text-ink-900">
              מאיפה המספרים
            </h2>
            <p className="mb-4 mt-1 text-body-sm text-ink-600">מאות תקציבי בנייה של בונים בית והמספרים שפורסמו ב-2026.</p>
            <SourcesList book={book} />
          </section>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="scenario-related">
            <h2 id="scenario-related" className="mb-5 text-headline-sm text-ink-900">
              תרחישים קשורים
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {related.map(({ scenario: rel, estimate: e }) => (
                <li key={rel.slug}>
                  <Link
                    href={`/calculator/${rel.slug}/`}
                    className="flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                  >
                    <span className="text-title-sm text-ink-900">{rel.title}</span>
                    <Money min={e.total.min} max={e.total.max} className="mt-2 text-title font-extrabold text-ink-900" unitClassName="text-sm font-bold" />
                    <span className="mt-1 text-caption text-ink-600">לתכנון ובנייה, לפני מע״מ</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ConsultationCTA
          variant="banner"
          source={`scenario-${scenario.slug}-band`}
          title="רוצים לדעת בדיוק כמה הבית שלכם יעלה?"
          description={isolateRanges('תקציב מפורט של 360 סעיפים, מבוסס כמויות, עם סטייה של 3%-5% ממחירי השוק. מתחילים בפגישת ייעוץ תקציב, ללא עלות.')}
          label="קבעו פגישת ייעוץ תקציב — ללא עלות"
        />
      </div>
    </>
  );
}
