import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getProductCategoryBySlug, listProductCategories, listPublishedProducts } from '@/lib/db/commerce';
import { commerceMetadata, decodeSlug } from '@/lib/commerce/seo';
import Breadcrumbs from '@/components/commerce/Breadcrumbs';
import ProductCard from '@/components/commerce/ProductCard';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

const loadCategory = cache(async (slug: string) => {
  if (!isSupabaseConfigured()) return null;
  return getProductCategoryBySlug(createClient(), decodeSlug(slug), 'category_product');
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = await loadCategory(params.slug);
  if (!cat) notFound(); // before streaming -> real 404
  return commerceMetadata({
    title: cat.seo_title ?? `ארכיון ${cat.name} - בונים בית`,
    description: cat.seo_description ?? `הטבות לחברי קהילת בונים בית לפי שלבי הבניה: ${cat.name}`,
    path: `/category-product/${cat.slug}/`,
  });
}

/** Custom `category_product` taxonomy: "הטבות לפי שלבי הבניה" (8 stage archives). */
export default async function CategoryProductPage({ params }: Props) {
  const cat = await loadCategory(params.slug);
  if (!cat) notFound();
  const db = createClient();
  const [products, stages] = await Promise.all([
    listPublishedProducts(db, { categoryId: cat.id }),
    listProductCategories(db, { taxonomy: 'category_product' }),
  ]);

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumbs
        items={[{ label: 'דף הבית', href: '/' }, { label: 'רכישות קבוצתיות', href: '/הטבות-לקהילה/' }, { label: cat.name }]}
      />
      <h1 className="mt-6 text-center">
        <span className="block text-2xl font-medium text-gray-700 sm:text-4xl">הטבות לפי שלבי הבניה</span>
        <span className="block text-3xl font-bold text-primary sm:text-5xl">{cat.name}</span>
      </h1>

      <nav aria-label="שלבי הבניה" className="mt-8">
        <ul className="flex flex-wrap justify-center gap-2">
          {stages.map((s) => (
            <li key={s.id}>
              <Link
                href={`/category-product/${s.slug}/`}
                aria-current={s.id === cat.id ? 'page' : undefined}
                className={`inline-block rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  s.id === cat.id ? 'bg-primary text-white' : 'bg-surface-100 text-gray-700 hover:bg-primary-50 hover:text-primary'
                }`}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {products.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">אין כרגע הטבות בשלב זה.</p>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} showExcerpt={false} />
          ))}
        </div>
      )}
    </div>
  );
}
