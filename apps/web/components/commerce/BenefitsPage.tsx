import Link from 'next/link';
import { createPublicClient } from '@/lib/commerce/public-db';
import { listProductCategories, listPublishedProducts } from '@/lib/db/commerce';
import type { ProductCategoryRow, ProductRow } from '@/lib/db/types';
import StructuredData from '@/components/StructuredData';
import { absoluteUrl } from '@/lib/site';
import ProductCard from './ProductCard';

/** Live support WhatsApp shown on the page ("צצה בעיה?"). */
const SUPPORT_WHATSAPP = { display: '054-2695623', href: 'https://wa.me/972542695623' };

const WHY_BUY = [
  'ספקים קהילתיים בדוקים ומומלצים',
  'תהליך רכישה בטוח, מוגן ושקוף לאורך כל הדרך',
  'מחירים תחרותיים שיבטיחו אחריות, שירות וזמינות',
  'הנחות והטבות לחברי הקהילה ולחברי מועדון הנאמנות בונים בית.',
];

async function loadData(): Promise<{ products: ProductRow[]; stages: ProductCategoryRow[] }> {
  // Cookie-less client: this page renders inside the ISR root [slug] route.
  const db = createPublicClient();
  if (!db) return { products: [], stages: [] };
  const [products, stages] = await Promise.all([
    listPublishedProducts(db),
    listProductCategories(db, { taxonomy: 'category_product' }),
  ]);
  return { products, stages };
}

/**
 * /הטבות-לקהילה/ ("חנות ההטבות" in the header). The live page is the shop
 * front: intro, "why buy through us", the month's benefits and the tag
 * filter. /shop/ redirects here. Registered in lib/special-pages/commerce.ts
 * and rendered by the root [slug] route.
 */
async function BenefitsPageContent() {
  const { products, stages } = await loadData();
  const tags = Array.from(new Set(products.map((p) => p.tag_label).filter((t): t is string => Boolean(t))));

  return (
    <div>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'הטבות לקהילה',
          url: absoluteUrl('/הטבות-לקהילה/'),
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: products.map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: absoluteUrl(`/product/${p.slug}/`),
              name: p.name,
            })),
          },
        }}
      />
      <section className="hero-bg">
        <div className="container-page grid gap-10 py-14 lg:grid-cols-[3fr_2fr] lg:py-20">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">הטבות לקהילה</h1>
            <p className="mt-4 text-xl font-medium text-gray-800">קונים חכם עם כוחה של הקהילה –</p>
            <p className="mt-1 text-lg text-gray-600">
              ספקים בדוקים, מחירים משתלמים והטבות לחברים. הצטרפו ל־בונים בית Members ותיהנו מהנחות, אחריות ושקט נפשי בכל
              רכישה.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#benefits"
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-700"
              >
                להטבות החודש
              </a>
              <Link
                href="/signup/?next=/הטבות-לקהילה/"
                className="rounded-xl border border-primary px-5 py-3 font-semibold text-primary transition hover:bg-primary hover:text-white"
              >
                הצטרפות לקהילה
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-gray-900">למה לרכוש דרכנו?</h2>
            <ul className="mt-4 space-y-2 text-gray-700">
              {WHY_BUY.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="font-bold text-primary">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 font-medium text-gray-900">עשינו בשבילכם את המו”מ עם כוח הקניה הקהילתי</p>
            <div className="mt-4 rounded-2xl bg-surface-50 p-4">
              <p className="font-semibold text-gray-900">צצה בעיה?</p>
              <p className="text-gray-600">
                אנו זמינים עבורכם בכל שעה וואצאפ{' '}
                <a href={SUPPORT_WHATSAPP.href} dir="ltr" className="font-semibold text-primary" target="_blank" rel="noopener noreferrer">
                  {SUPPORT_WHATSAPP.display}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="benefits" className="scroll-mt-20 py-14">
        <div className="container-page">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-bold text-gray-900">הטבות החודש</h2>
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="תחומי ההטבות">
                {tags.map((t) => (
                  <li key={t} className="rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {products.length === 0 ? (
            <p className="text-gray-500">אין כרגע הטבות פעילות. חזרו בקרוב!</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      {stages.length > 0 && (
        <section className="bg-surface-50 py-14">
          <div className="container-page">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">הטבות לפי שלבי הבניה</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stages.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/category-product/${s.slug}/`}
                    className="block rounded-2xl border border-gray-100 bg-white p-4 text-center font-semibold text-gray-800 shadow-card transition hover:text-primary hover:shadow-card-hover"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

/** Sync wrapper so the registry's `ComponentType` contract holds. */
export default function BenefitsPage() {
  return <BenefitsPageContent />;
}
