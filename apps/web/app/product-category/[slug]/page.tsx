import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getProductCategoryBySlug, listPublishedProducts } from '@/lib/db/commerce';
import { addProductToCart } from '@/lib/commerce/actions';
import { commerceMetadata, decodeSlug } from '@/lib/commerce/seo';
import Breadcrumbs from '@/components/commerce/Breadcrumbs';
import ProductCard from '@/components/commerce/ProductCard';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

const loadCategory = cache(async (slug: string) => {
  if (!isSupabaseConfigured()) return null;
  return getProductCategoryBySlug(createClient(), decodeSlug(slug), 'product_cat');
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = await loadCategory(params.slug);
  if (!cat) notFound(); // before streaming -> real 404
  return commerceMetadata({
    title: cat.seo_title ?? `${cat.name} Archives - בונים בית`,
    description: cat.seo_description ?? cat.description ?? `הטבות ומוצרים לחברי קהילת בונים בית: ${cat.name}`,
    path: `/product-category/${cat.slug}/`,
  });
}

/** WooCommerce product_cat archive (live: /product-category/כללי/). The only place with "הוסף לסל". */
export default async function ProductCategoryPage({ params }: Props) {
  const cat = await loadCategory(params.slug);
  if (!cat) notFound();
  const products = await listPublishedProducts(createClient(), { categoryId: cat.id });

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumbs items={[{ label: 'דף הבית', href: '/' }, { label: 'הטבות לקהילה', href: '/הטבות-לקהילה/' }, { label: cat.name }]} />
      <h1 className="mt-6 text-3xl font-bold text-gray-900">{cat.name}</h1>
      {cat.description && <p className="mt-2 text-gray-600">{cat.description}</p>}
      <p className="mt-2 text-sm text-gray-500" role="status">
        {products.length === 1 ? 'מציגים תוצאה אחת' : `מציגים את כל ${products.length} התוצאות`}
      </p>

      {products.length === 0 ? (
        <p className="mt-10 text-gray-500">אין כרגע מוצרים בקטגוריה זו.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} showExcerpt={false}>
              {p.is_purchasable && (
                <form action={addProductToCart}>
                  <input type="hidden" name="product_id" value={p.id} />
                  <input type="hidden" name="quantity" value="1" />
                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
                  >
                    הוסף לסל הקניות
                  </button>
                </form>
              )}
            </ProductCard>
          ))}
        </div>
      )}
    </div>
  );
}
