'use client';

import { useEffect, useState } from 'react';
import { getCategories } from '@/lib/api';
import type { Category } from '@/lib/types';
import CategoryChip from './CategoryChip';
import { CategoryBarSkeleton } from './Skeleton';

interface CategoryBarProps {
  /** If provided, uses these instead of fetching */
  categories?: Category[];
  activeSlug?: string;
}

export default function CategoryBar({ categories: propCategories, activeSlug }: CategoryBarProps) {
  const [categories, setCategories] = useState<Category[]>(propCategories ?? []);
  const [loading, setLoading] = useState(!propCategories);

  useEffect(() => {
    if (propCategories) return;
    let cancelled = false;
    getCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propCategories]);

  if (loading) return <CategoryBarSkeleton />;

  if (categories.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 lg:flex-wrap">
        {categories.map((cat) => (
          <CategoryChip
            key={cat.slug}
            label={cat.name_he}
            slug={cat.slug}
            isActive={cat.slug === activeSlug}
            count={cat.video_count}
          />
        ))}
      </div>
    </div>
  );
}
