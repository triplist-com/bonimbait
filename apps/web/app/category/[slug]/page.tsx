import type { Metadata } from 'next';
import { categories as fallbackCategories } from '@/lib/mockData';
import CategoryPageClient from './CategoryPageClient';

interface CategoryPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = fallbackCategories.find((c) => c.slug === params.slug);
  const name = category?.name_he || params.slug;
  const description = category?.description_he || `כל הסרטונים והמידע בנושא ${name} לבנייה פרטית בישראל`;

  return {
    title: name,
    description,
    alternates: {
      canonical: `https://bonimbait.com/category/${params.slug}`,
    },
    openGraph: {
      title: `${name} - בונים בית`,
      description,
      type: 'website',
      url: `https://bonimbait.com/category/${params.slug}`,
    },
  };
}

export default function CategoryPage() {
  return <CategoryPageClient />;
}
