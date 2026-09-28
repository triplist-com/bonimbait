import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listCategoriesForProduct, listProductCategories, parseProductDetails } from '@/lib/db/commerce';
import { parseGallery } from '@/lib/db/businesses';
import { saveProduct } from '@/lib/admin/actions/commerce';
import PageHeader from '@/components/admin/PageHeader';
import ProductForm from '@/components/admin/commerce/ProductForm';

export const metadata = { title: 'עריכת מוצר' };

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const isNew = params.id === 'new';
  const product = isNew ? null : (await db.from('products').select('*').eq('id', params.id).maybeSingle()).data;
  if (!isNew && !product) notFound();
  const [categories, selected, { data: businesses }] = await Promise.all([
    listProductCategories(db),
    product ? listCategoriesForProduct(db, product.id) : Promise.resolve([]),
    db.from('businesses').select('id, name').order('name'),
  ]);
  return (
    <div className="max-w-7xl">
      <PageHeader
        back={{ href: '/admin/commerce/products/', label: 'כל המוצרים' }}
        title={product?.name ?? 'מוצר חדש'}
        actions={
          product?.status === 'published' && (
            <a href={`/product/${encodeURIComponent(product.slug)}/`} target="_blank" rel="noopener" className="text-sm text-primary hover:underline">
              צפייה באתר
            </a>
          )
        }
      />
      <ProductForm
        action={saveProduct}
        product={product}
        details={product ? parseProductDetails(product.details) : []}
        images={product ? parseGallery(product.images) : []}
        categories={categories}
        selectedCategories={selected.map((c) => c.id)}
        businesses={businesses ?? []}
      />
    </div>
  );
}
