import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  effectivePrice,
  formatPrice,
  getPublishedProductBySlug,
  listCategoriesForProduct,
  listPublishedProducts,
  parseProductDetails,
} from '@/lib/db/commerce';
import { commerceMetadata, decodeSlug, htmlToText } from '@/lib/commerce/seo';
import { absoluteUrl } from '@/lib/site';
import Breadcrumbs from '@/components/commerce/Breadcrumbs';
import ProductCard from '@/components/commerce/ProductCard';
import ProductLeadForm from '@/components/commerce/ProductLeadForm';
import RichHtml from '@/components/commerce/RichHtml';
import StructuredData from '@/components/StructuredData';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

const loadProduct = cache(async (slug: string) => {
  if (!isSupabaseConfigured()) return null;
  return getPublishedProductBySlug(createClient(), decodeSlug(slug));
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await loadProduct(params.slug);
  if (!product) return { title: 'המוצר לא נמצא', robots: { index: false } };
  return commerceMetadata({
    title: product.seo_title ?? `${product.name} - בונים בית`,
    description: product.seo_description ?? htmlToText(product.description_html, 300),
    // Imported Yoast canonical (a path) when present, else the product URL.
    path: product.seo_canonical?.startsWith('/') ? product.seo_canonical : `/product/${product.slug}/`,
    image: product.featured_image,
  });
}

/**
 * /product/<slug>/ — on the live site every product page is a lead page
 * ("מעוניינים במוצר? השאירו פרטים ונחזור אליכם"), including the priced
 * RINNAI heater: the single page has no add-to-cart button (only the
 * /product-category/ archive does). So we render the price (if any) plus the
 * lead form, which creates a `benefit` lead and redirects to
 * /תודה-על-השארת-פרטים-מוצר/.
 */
export default async function ProductPage({ params }: Props) {
  const product = await loadProduct(params.slug);
  if (!product) notFound();

  const db = createClient();
  const [categories, others] = await Promise.all([
    listCategoriesForProduct(db, product.id),
    listPublishedProducts(db),
  ]);
  const stages = categories.filter((c) => c.taxonomy === 'category_product');
  const sections = parseProductDetails(product.details);
  const price = effectivePrice(product);
  const more = others.filter((p) => p.id !== product.id);

  return (
    <div className="container-page py-8 sm:py-12">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: htmlToText(product.description_html, 500),
          image: product.featured_image ?? undefined,
          url: absoluteUrl(`/product/${product.slug}/`),
          ...(price > 0
            ? {
                offers: {
                  '@type': 'Offer',
                  price: (price / 100).toFixed(2),
                  priceCurrency: product.currency,
                  availability: 'https://schema.org/InStock',
                },
              }
            : {}),
        }}
      />
      <Breadcrumbs
        items={[
          { label: 'דף הבית', href: '/' },
          { label: 'הטבות לקהילה', href: '/הטבות-לקהילה/' },
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <header>
            <h1 className="text-3xl font-bold leading-tight text-gray-900">{product.name}</h1>
            {price > 0 && <p className="mt-3 text-3xl font-bold text-gray-900">{formatPrice(price)}</p>}
            <p className="mt-2 font-medium text-secondary-700">לחברי קהילת בונים בית</p>
            {product.subtitle && <p className="mt-3 text-lg text-gray-700">{product.subtitle}</p>}
            {stages.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="שלבי בנייה">
                {stages.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/category-product/${s.slug}/`}
                      className="rounded-full bg-surface-100 px-3 py-1 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary"
                    >
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </header>

          <ProductLeadForm
            productId={product.id}
            heading={product.lead_heading ?? 'מעוניינים במוצר? השאירו פרטים ונחזור אליכם'}
            urgentOption={product.lead_urgent_option}
          />

          <section aria-labelledby="about-product">
            <h2 id="about-product" className="mb-3 text-2xl font-bold text-gray-900">
              על המוצר
            </h2>
            {product.description_html && <RichHtml html={product.description_html} />}
          </section>

          {sections.length > 0 && (
            <div className="divide-y divide-gray-200 rounded-2xl border border-gray-100 bg-white shadow-card">
              {sections.map((s) => (
                <details key={s.title} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-gray-900">
                    {s.title}
                    <span aria-hidden="true" className="transition group-open:rotate-180">
                      ⌄
                    </span>
                  </summary>
                  <RichHtml html={s.html} className="mt-3" />
                </details>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {product.featured_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.featured_image}
              alt={product.name}
              className="w-full rounded-3xl object-cover shadow-card"
            />
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section aria-labelledby="more-products" className="mt-16">
          <h2 id="more-products" className="mb-6 text-2xl font-bold text-gray-900">
            מוצרים נוספים
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
