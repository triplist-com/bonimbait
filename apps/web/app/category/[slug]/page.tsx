import type { Metadata } from 'next';
import { getCategories } from '@/lib/api';
import CategoryPageClient from './CategoryPageClient';
import { absoluteUrl } from '@/lib/site';

interface CategoryPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  let category;
  try {
    const categories = await getCategories();
    category = categories.find((c) => c.slug === params.slug);
  } catch {
    // ignore
  }
  const name = category?.name_he || params.slug;
  const description = category?.description_he || `כל הסרטונים והמידע בנושא ${name} לבנייה פרטית בישראל`;

  return {
    title: name,
    description,
    alternates: {
      canonical: absoluteUrl(`/category/${params.slug}`),
    },
    openGraph: {
      title: `${name} - בונים בית`,
      description,
      type: 'website',
      url: absoluteUrl(`/category/${params.slug}`),
    },
  };
}

export default function CategoryPage() {
  return <CategoryPageClient />;
}
