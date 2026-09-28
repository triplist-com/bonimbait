import { createClient } from '@/lib/supabase/server';
import { listProductCategories } from '@/lib/db/commerce';
import { deleteProductCategory, saveProductCategory } from '@/lib/admin/actions/commerce';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Section, Select, TextInput } from '@/components/admin/FormField';
import type { ProductCategoryRow } from '@/lib/db/types';

export const metadata = { title: 'קטגוריות מוצרים' };

const TAX = {
  product_cat: { title: 'קטגוריות חנות', prefix: '/product-category/' },
  category_product: { title: 'שלבי בנייה למוצרים', prefix: '/category-product/' },
} as const;

function Row({ c }: { c: ProductCategoryRow | null }) {
  return (
    <ActionForm action={saveProductCategory} resetOnSuccess={!c} className="grid items-end gap-2 rounded-lg border border-gray-100 p-2 md:grid-cols-[1fr_1fr_10rem_5rem_auto]">
      {c && <input type="hidden" name="id" value={c.id} />}
      {c && <input type="hidden" name="original_slug" value={c.slug} />}
      <TextInput name="name" defaultValue={c?.name ?? ''} placeholder={c ? undefined : 'קטגוריה חדשה'} required aria-label="שם" />
      <TextInput name="slug" defaultValue={c?.slug ?? ''} placeholder="כתובת" dir="ltr" aria-label="כתובת" />
      <Select name="taxonomy" defaultValue={c?.taxonomy ?? 'product_cat'} aria-label="סוג">
        <option value="product_cat">קטגוריית חנות</option>
        <option value="category_product">שלב בנייה</option>
      </Select>
      <TextInput name="sort_order" type="number" defaultValue={c?.sort_order ?? 0} aria-label="סדר" />
      <input type="hidden" name="description" value={c?.description ?? ''} />
      <input type="hidden" name="seo_title" value={c?.seo_title ?? ''} />
      <input type="hidden" name="seo_description" value={c?.seo_description ?? ''} />
      <div className="flex gap-2">
        <SubmitButton>{c ? 'שמירה' : 'הוספה'}</SubmitButton>
        {c && <ConfirmDialog trigger="מחיקה" title={`למחוק את "${c.name}"?`} body="המוצרים לא יימחקו. הכתובת של הקטגוריה תחזיר 404." onConfirm={deleteProductCategory.bind(null, c.id)} />}
      </div>
    </ActionForm>
  );
}

export default async function ProductCategoriesPage() {
  const categories = await listProductCategories(createClient());
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="קטגוריות מוצרים" description="שתי טקסונומיות, כמו באתר הישן: קטגוריות חנות ושלבי בנייה." />
      {(Object.keys(TAX) as Array<keyof typeof TAX>).map((tax) => (
        <Section key={tax} title={`${TAX[tax].title} (${TAX[tax].prefix}…)`}>
          {categories
            .filter((c) => c.taxonomy === tax)
            .map((c) => (
              <Row key={c.id} c={c} />
            ))}
        </Section>
      ))}
      <Section title="הוספה">
        <Row c={null} />
      </Section>
    </div>
  );
}
