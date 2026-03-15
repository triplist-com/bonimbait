'use client';

import Link from 'next/link';

interface CategoryChipProps {
  label: string;
  slug: string;
  isActive?: boolean;
  count?: number;
}

export default function CategoryChip({
  label,
  slug,
  isActive = false,
  count,
}: CategoryChipProps) {
  return (
    <Link
      href={`/category/${slug}`}
      className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
        isActive
          ? 'bg-primary text-white border-primary shadow-md scale-105'
          : 'bg-white text-gray-700 border-gray-200 hover:border-primary hover:text-primary hover:shadow-sm'
      }`}
    >
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${
            isActive
              ? 'bg-white/20 text-white'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
