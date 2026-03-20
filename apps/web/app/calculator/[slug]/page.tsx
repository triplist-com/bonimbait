import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SCENARIOS, getScenarioBySlug, getRelatedScenarios } from '../../../lib/calculator-scenarios';
import { calculateCost, formatNIS, getSqm } from '../../../lib/calculator';
import ScenarioResult from './ScenarioResult';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// SSG: pre-generate all 20 scenario pages
export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ slug: s.slug }));
}

// Dynamic metadata for each scenario
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const scenario = getScenarioBySlug(slug);
  if (!scenario) return {};

  return {
    title: scenario.title,
    description: scenario.description,
    alternates: {
      canonical: `https://bonimbait.com/calculator/${scenario.slug}`,
    },
    openGraph: {
      title: scenario.title,
      description: scenario.description,
      url: `https://bonimbait.com/calculator/${scenario.slug}`,
      siteName: 'בונים בית',
      locale: 'he_IL',
      type: 'website',
    },
  };
}

/** Build prefill URL params for linking to the wizard */
function buildPrefillUrl(answers: Record<string, string | string[]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(answers)) {
    params.set(`prefill_${key}`, Array.isArray(value) ? value.join(',') : value);
  }
  return `/calculator?${params.toString()}`;
}

/** Finishing level labels */
const FINISHING_LABELS: Record<string, string> = {
  standard: 'סטנדרטי',
  standard_high: 'סטנדרט-גבוה',
  high: 'גבוה',
  luxury: 'יוקרה',
};

/** Region labels */
const REGION_LABELS: Record<string, string> = {
  center: 'מרכז',
  sharon: 'השרון',
  shfela: 'שפלה',
  north: 'צפון',
  south: 'דרום',
  jerusalem: 'ירושלים',
};

/** Construction method labels */
const CONSTRUCTION_LABELS: Record<string, string> = {
  blocks: 'בלוקים',
  concrete: 'בטון',
  precast: 'טרומי',
  steel: 'שלד פלדה',
};

/** Floor labels */
const FLOOR_LABELS: Record<string, string> = {
  '1': 'קומה אחת',
  '1.5': 'קומה וחצי',
  '2': 'שתי קומות',
  '2_basement': 'שתי קומות + מרתף',
};

export default async function CalculatorScenarioPage({ params }: PageProps) {
  const { slug } = await params;
  const scenario = getScenarioBySlug(slug);
  if (!scenario) notFound();

  const result = calculateCost(scenario.answers);
  const related = getRelatedScenarios(scenario);
  const sqm = getSqm(scenario.answers.house_size);
  const prefillUrl = buildPrefillUrl(scenario.answers);

  // Build FAQ structured data
  const faqEntries = [
    {
      question: `כמה עולה ${scenario.title.replace('עלות ', '')}?`,
      answer: `על פי הערכתנו, ${scenario.title.replace('עלות ', '')} עולה בין ${formatNIS(result.total_min)} ל-${formatNIS(result.total_max)}. העלות כוללת יסודות ושלד, גמר פנים, חשמל ואינסטלציה, גג, ריצוף, חלונות ודלתות ופיתוח חוץ.`,
    },
    {
      question: `מה כולל מחיר הבנייה של ${sqm} מ״ר?`,
      answer: `המחיר כולל את כל שלבי הבנייה: יסודות ושלד (35%), גמר פנים (25%), חשמל ואינסטלציה (12%), גג (8%), ריצוף (8%), חלונות ודלתות (7%) ופיתוח חוץ (5%).`,
    },
    {
      question: 'האם ההערכה כוללת מע״מ?',
      answer: 'ההערכה מבוססת על מחירי שוק כוללים. מומלץ לבדוק מול קבלנים את פירוט המחיר כולל מע״מ.',
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntries.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="container-page py-8 sm:py-12">
      {/* Schema.org FAQPage structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/" className="hover:text-primary transition-colors">
            בונים בית
          </Link>
          <span>/</span>
          <Link href="/calculator" className="hover:text-primary transition-colors">
            מחשבון עלויות
          </Link>
          <span>/</span>
          <span className="text-gray-600">{scenario.title}</span>
        </nav>

        {/* Page header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008H15.75v-.008zm0 2.25h.008v.008H15.75V13.5z"
              />
            </svg>
            <span>מחשבון עלויות</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            {scenario.title}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-lg mx-auto">
            {scenario.description}
          </p>
        </div>

        {/* Scenario parameters summary */}
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 sm:p-6 mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3">פרטי התרחיש</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">שטח</span>
              <span className="font-medium text-gray-800">{sqm} מ״ר</span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">קומות</span>
              <span className="font-medium text-gray-800">
                {FLOOR_LABELS[scenario.answers.floors] ?? scenario.answers.floors}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">שיטת בנייה</span>
              <span className="font-medium text-gray-800">
                {CONSTRUCTION_LABELS[scenario.answers.construction_method] ?? scenario.answers.construction_method}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">רמת גימור</span>
              <span className="font-medium text-gray-800">
                {FINISHING_LABELS[scenario.answers.finishing_level] ?? scenario.answers.finishing_level}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs mb-0.5">אזור</span>
              <span className="font-medium text-gray-800">
                {REGION_LABELS[scenario.answers.region] ?? scenario.answers.region}
              </span>
            </div>
            {scenario.answers.basement === 'yes' && (
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">מרתף</span>
                <span className="font-medium text-gray-800">כן</span>
              </div>
            )}
            {scenario.answers.special_features.length > 0 && (
              <div className="col-span-2">
                <span className="text-gray-400 block text-xs mb-0.5">תוספות</span>
                <span className="font-medium text-gray-800">
                  {scenario.answers.special_features
                    .map((f) => {
                      const labels: Record<string, string> = {
                        pool: 'בריכה',
                        elevator: 'מעלית',
                        underground_parking: 'חניה תת-קרקעית',
                        large_balcony: 'מרפסת גדולה',
                        solar: 'מערכת סולארית',
                      };
                      return labels[f] ?? f;
                    })
                    .join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cost result - uses ScenarioResult client component wrapping WizardResult */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-8 mb-6">
          <ScenarioResult result={result} />
        </div>

        {/* CTA: customize parameters */}
        <div className="bg-gradient-to-br from-primary-50 via-white to-primary-50 rounded-2xl border border-primary-100 p-6 sm:p-8 text-center mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            רוצה לשנות פרמטרים?
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            התאימו את המחשבון לפרטים המדויקים של הבית שלכם
          </p>
          <Link
            href={prefillUrl}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
            התאימו את הפרמטרים
          </Link>
        </div>

        {/* FAQ section (visible to users too, not just structured data) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 mb-8">
          <h2 className="font-bold text-gray-900 mb-4">שאלות נפוצות</h2>
          <div className="space-y-4">
            {faqEntries.map((faq, i) => (
              <div key={i}>
                <h3 className="text-sm font-bold text-gray-800 mb-1">{faq.question}</h3>
                <p className="text-sm text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related scenarios */}
        {related.length > 0 && (
          <div className="mb-8">
            <h2 className="font-bold text-gray-900 mb-4">תרחישים קשורים</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((rel) => {
                const relResult = calculateCost(rel.answers);
                return (
                  <Link
                    key={rel.slug}
                    href={`/calculator/${rel.slug}`}
                    className="block bg-white rounded-xl border border-gray-100 hover:border-primary-200 hover:shadow-sm p-4 transition-all"
                  >
                    <h3 className="text-sm font-bold text-gray-800 mb-1">{rel.title}</h3>
                    <p className="text-xs text-gray-500 mb-2 line-clamp-2">{rel.description}</p>
                    <p className="text-sm font-medium text-primary" dir="ltr">
                      {formatNIS(relResult.total_min)} - {formatNIS(relResult.total_max)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Back to calculator */}
        <div className="text-center">
          <Link
            href="/calculator"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-700 font-medium transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            חזרה למחשבון המלא
          </Link>
        </div>
      </div>
    </div>
  );
}
