import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  type ServicePlanWithPrices,
  formatPrice,
  listActiveServicePlans,
  parsePlanFeatures,
  parseStringList,
} from '@/lib/db/commerce';
import type { ServicePlanFeature } from '@/lib/db/types';
import { buyServicePlan } from '@/lib/commerce/actions';
import { commerceMetadata } from '@/lib/commerce/seo';
import {
  FAQ,
  HERO,
  MEMBERSHIP_SEO,
  TEAM,
  TESTIMONIALS,
  WHY,
  teamPhotoUrl,
  testimonialMedia,
} from '@/lib/commerce/membership-content';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import PlanLeadForm from '@/components/commerce/PlanLeadForm';
import StructuredData from '@/components/StructuredData';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return commerceMetadata({
    title: MEMBERSHIP_SEO.title,
    description: MEMBERSHIP_SEO.description,
    path: '/membership-tiers/',
  });
}

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-700';
const btnGhost =
  'inline-flex items-center justify-center rounded-xl border border-primary px-5 py-3 font-semibold text-primary transition hover:bg-primary hover:text-white';

async function loadPlans(): Promise<ServicePlanWithPrices[]> {
  if (!isSupabaseConfigured()) return [];
  return listActiveServicePlans(createClient());
}

export default async function MembershipTiersPage() {
  const plans = await loadPlans();

  return (
    <div className="bg-white">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'תוכניות הניהול של בונים בית',
          url: absoluteUrl('/membership-tiers/'),
          itemListElement: plans.map((plan, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Service',
              name: plan.name,
              provider: { '@type': 'Organization', name: 'בונים בית' },
              offers: plan.prices.map((p) => ({
                '@type': 'Offer',
                price: (p.price_agorot / 100).toFixed(2),
                priceCurrency: p.currency,
                description: p.label ?? undefined,
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: (p.price_agorot / 100).toFixed(2),
                  priceCurrency: p.currency,
                  valueAddedTaxIncluded: p.vat_included,
                },
              })),
            },
          })),
        }}
      />

      {/* Hero */}
      <section className="hero-bg">
        <div className="container-page grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">
              <span className="block">{HERO.lead}</span>
              <span className="block text-primary">{HERO.highlight}</span>
            </h1>
            <p className="mt-4 text-lg font-medium tracking-wide text-gray-500">{HERO.eyebrow}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ConsultationCTA variant="button" source="membership-tiers" label={HERO.cta} />
              <a href="#plans" className={btnGhost}>
                לתוכניות הניהול
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-card-hover">
            <div className="relative aspect-video bg-gray-900">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${HERO.youtubeId}?rel=0`}
                title="בונים בית — מלווים אתכם עד המפתח"
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="scroll-mt-20 py-16">
        <div className="container-page">
          <h2 className="mb-10 text-center text-3xl font-bold text-gray-900">
            שלושה מסלולי ניהול.
            <br />
            <span className="text-primary">אחד שמתאים בדיוק לכם.</span>
          </h2>
          {plans.length === 0 ? (
            <p className="text-center text-gray-500">התוכניות אינן זמינות כרגע. צרו איתנו קשר לפרטים.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          )}
          <p className="mt-6 text-center text-sm text-gray-500">המחירים אינם כוללים מע״מ.</p>
        </div>
      </section>

      {/* Comparison */}
      {plans.length > 0 && <CompareTable plans={plans} />}

      {/* Team */}
      <section id="team" className="scroll-mt-20 bg-surface-50 py-16">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900">
              הצוות ש<span className="text-primary">מנהל לכם</span> את הבניה
            </h2>
            <p className="mt-2 text-gray-500">צוות מומחים מנוסים בתחום הבניה הפרטית, אתכם לאורך כל הדרך.</p>
          </div>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {TEAM.map((m) => (
              <li key={m.name} className="overflow-hidden rounded-2xl bg-white shadow-card">
                <div className="relative aspect-[3/4] bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={teamPhotoUrl(m.photo)} alt={m.name} loading="lazy" className="h-full w-full object-cover object-top" />
                </div>
                <div className="p-4">
                  <p className="font-bold text-gray-900">{m.name}</p>
                  <p className="text-sm font-medium text-primary">{m.role2 ? `${m.role} · ${m.role2}` : m.role}</p>
                  <blockquote className="mt-2 text-sm text-gray-600">”{m.quote}“</blockquote>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why */}
      <section id="why" className="scroll-mt-20 py-16">
        <div className="container-page">
          <h2 className="mb-10 text-center text-3xl font-bold text-gray-900">
            למה <span className="text-primary">בונים בית</span>?
          </h2>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((w, i) => (
              <li key={w.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
                <span className="text-sm font-bold text-primary">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-1 text-xl font-bold text-gray-900">{w.title}</h3>
                <p className="mt-2 text-gray-600">{w.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand
        title={
          <>
            מצאתם את המסלול? <span className="text-secondary-300">בואו נתחיל.</span>
          </>
        }
        text="בפגישת הייעוץ הקצרה נכיר אתכם, נלמד את דרישות הפרויקט, נבחן את התקציב, ונתאים יחד את מסלול הניהול שנכון לכם."
      />

      {/* Testimonials */}
      <section id="testimonials" className="scroll-mt-20 py-16">
        <div className="container-page">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-gray-900">
              מה <span className="text-primary">אומרים עלינו</span>?
            </h2>
            <p className="mt-2 text-gray-500">זוגות שכבר נכנסו הביתה מספרים איך נראה ליווי של בונים בית.</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => {
              const media = testimonialMedia(t.id);
              return (
                <video
                  key={t.id}
                  src={media.video}
                  poster={media.poster}
                  controls
                  playsInline
                  preload="none"
                  aria-label={t.label}
                  className="aspect-[9/16] w-full rounded-2xl bg-gray-900 object-cover shadow-card"
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-surface-50 py-16">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              כל מה ש<span className="text-primary">חשוב לדעת</span>
            </h2>
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-card">
              <p className="font-bold text-gray-900">לא מצאתם תשובה? דברו איתנו</p>
              <p className="mt-1 text-gray-600">נחזור אליכם עם כל המידע, נמחיש את הצורך, נציג את התוצרים ונשקלל את הערך.</p>
              <ConsultationCTA variant="button" source="membership-tiers" label="קביעת ייעוץ חינם" className="mt-4" />
            </div>
          </div>
          <div className="space-y-8">
            {FAQ.map((g) => (
              <div key={g.group}>
                <h3 className="mb-3 text-lg font-bold text-gray-900">{g.group}</h3>
                <div className="divide-y divide-gray-200 rounded-2xl bg-white shadow-card">
                  {g.items.map((item) => (
                    <details key={item.q} className="group p-5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-900">
                        {item.q}
                        <span aria-hidden="true" className="text-xl text-primary transition group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-gray-600">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leave details */}
      <section id="leave-details" className="scroll-mt-20 py-16">
        <div className="container-page max-w-3xl">
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-card sm:p-10">
            <h2 className="text-2xl font-bold text-gray-900">
              הכרתם אותנו? <span className="text-primary">בואו נכיר אתכם.</span>
            </h2>
            <p className="mb-6 mt-2 text-gray-600">
              קבעו פגישת ייעוץ קצרה עם הצוות שלנו — נשמע על הפרויקט שלכם, נענה על כל שאלה, ונראה לכם איך נכון להתקדם.
              מעדיפים שנחזור אליכם? השאירו פרטים.
            </p>
            <PlanLeadForm plans={plans.map((p) => ({ slug: p.slug, name: p.name }))} />
            <div className="mt-6 border-t border-gray-100 pt-6 text-center">
              <ConsultationCTA variant="button" source="membership-tiers" label="קביעת פגישת ייעוץ ביומן" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan }: { plan: ServicePlanWithPrices }) {
  const highlights = parseStringList(plan.highlights);
  const featured = plan.is_featured;
  return (
    <article
      className={`relative flex flex-col rounded-3xl border p-6 shadow-card ${
        featured ? 'border-primary bg-primary-50/40 ring-2 ring-primary' : 'border-gray-100 bg-white'
      }`}
    >
      {plan.subtitle && (
        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
            featured ? 'bg-primary text-white' : 'bg-surface-100 text-gray-700'
          }`}
        >
          {plan.subtitle}
        </span>
      )}
      {plan.track_label && <p className="mt-4 text-sm font-medium text-gray-500">{plan.track_label}</p>}
      <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
      <ul className="mt-5 space-y-2 text-gray-700">
        {highlights.map((h, i) => (
          <li key={h} className="flex gap-2">
            <span aria-hidden="true" className="font-bold text-primary">
              {/* Live page: the "פלוס" plan lists its add-ons with "+". */}
              {i > 0 && highlights[0]?.startsWith('כל מה שנכלל') && !plan.is_featured ? '+' : '✓'}
            </span>
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-1">
        {plan.prices.map((price) => (
          <p key={price.id} className="flex flex-wrap items-baseline gap-x-2">
            {price.label && <span className="text-sm text-gray-500">{price.label}</span>}
            <span className="text-3xl font-bold text-gray-900">{formatPrice(price.price_agorot)}</span>
          </p>
        ))}
        <p className="text-sm text-gray-500">{plan.prices.some((p) => !p.vat_included) ? 'לא כולל מע״מ' : 'כולל מע״מ'}</p>
      </div>
      <div className="mt-6 flex flex-col gap-3 pt-2">
        <ConsultationCTA variant="button" source="membership-tiers" label={plan.cta_label ?? 'קביעת פגישת ייעוץ'} />
        <a href="#leave-details" className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          השאירו פרטים ונחזור אליכם
        </a>
        {plan.is_purchasable_online &&
          plan.prices.map((price) => (
            <form key={price.id} action={buyServicePlan}>
              <input type="hidden" name="price_id" value={price.id} />
              <button type="submit" className={`${btnPrimary} w-full`}>
                רכישה אונליין{price.label ? ` — ${price.label}` : ''}
              </button>
            </form>
          ))}
      </div>
    </article>
  );
}

function CompareTable({ plans }: { plans: ServicePlanWithPrices[] }) {
  const columns = plans.map((plan) => ({ plan, features: parsePlanFeatures(plan.features) }));
  const rows: ServicePlanFeature[] = columns.find((c) => c.features.length > 0)?.features ?? [];
  if (rows.length === 0) return null;

  const categories: Array<{ name: string; labels: string[] }> = [];
  for (const row of rows) {
    const name = row.category ?? '';
    let cat = categories.find((c) => c.name === name);
    if (!cat) {
      cat = { name, labels: [] };
      categories.push(cat);
    }
    cat.labels.push(row.label);
  }
  const valueOf = (features: ServicePlanFeature[], label: string) => features.find((f) => f.label === label)?.value ?? false;

  return (
    <section id="compare" className="scroll-mt-20 py-16">
      <div className="container-page">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            מה <span className="text-primary">השוני</span>?
          </h2>
          <p className="mt-2 text-gray-500">כל מה שכל מסלול כולל, צד לצד — כדי שתבחרו בדיוק את מה שמתאים לכם.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-card">
          <table className="w-full min-w-[640px] border-collapse bg-white text-sm">
            <caption className="sr-only">השוואת מסלולי הניהול</caption>
            <thead>
              <tr className="bg-surface-50">
                <th scope="col" className="p-4 text-start font-semibold text-gray-700">
                  שירות / תכולה
                </th>
                {columns.map(({ plan }) => (
                  <th key={plan.id} scope="col" className="p-4 text-center">
                    <span className="block text-xs font-medium text-gray-500">{plan.track_label}</span>
                    <span className="block text-base font-bold text-gray-900">{plan.name}</span>
                    {plan.compare_label && <span className="block text-xs text-primary">{plan.compare_label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, ci) => (
                <CategoryRows
                  key={cat.name}
                  index={ci + 1}
                  name={cat.name}
                  labels={cat.labels}
                  columns={columns.map((c) => (label: string) => valueOf(c.features, label))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CategoryRows({
  index,
  name,
  labels,
  columns,
}: {
  index: number;
  name: string;
  labels: string[];
  columns: Array<(label: string) => boolean | string>;
}) {
  return (
    <>
      <tr className="border-t border-gray-100 bg-primary-50/50">
        <th scope="rowgroup" colSpan={columns.length + 1} className="p-3 text-start font-bold text-gray-900">
          <span className="me-2 text-primary">{String(index).padStart(2, '0')}</span>
          {name}
        </th>
      </tr>
      {labels.map((label, li) => (
        <tr key={label} className="border-t border-gray-100">
          <th scope="row" className="p-3 text-start font-normal text-gray-700">
            <span className="me-2 text-xs text-gray-400">
              {index}.{li + 1}
            </span>
            {label}
          </th>
          {columns.map((get, i) => (
            <td key={i} className="p-3 text-center">
              <CompareValue value={get(label)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CompareValue({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="font-bold text-success" aria-label="כלול">
        ✓
      </span>
    );
  if (value === false)
    return (
      <span className="text-gray-300" aria-label="לא כלול">
        —
      </span>
    );
  return <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-secondary-800">{value}</span>;
}

function CtaBand({ title, text }: { title: React.ReactNode; text: string }) {
  return (
    <section className="bg-primary-800 py-14 text-white">
      <div className="container-page flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
          <p className="mt-2 text-primary-100">{text}</p>
        </div>
        <ConsultationCTA variant="button" source="membership-tiers" label="קביעת פגישת ייעוץ" />
      </div>
    </section>
  );
}
