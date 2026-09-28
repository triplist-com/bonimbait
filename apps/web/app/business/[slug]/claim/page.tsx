import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPublishedBusinessBySlug } from '@/lib/db/businesses';
import { getProfile } from '@/lib/auth/session';
import { businessHref, decodeSlug } from '@/lib/directory/format';
import { createPublicClient } from '@/lib/directory/server';
import ClaimForm from '@/components/directory/ClaimForm';

export const metadata: Metadata = { title: 'בקשת ניהול עסק', robots: { index: false, follow: false } };

export default async function ClaimBusinessPage({ params }: { params: { slug: string } }) {
  const business = await getPublishedBusinessBySlug(createPublicClient(), decodeSlug(params.slug));
  if (!business) notFound();
  const href = businessHref(business.slug);

  const profile = await getProfile();
  if (!profile) redirect(`/login/?next=${encodeURIComponent(`${href}claim/`)}`);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">בקשת ניהול: {business.name}</h1>
        {business.owner_member_id ? (
          <p className="mt-4 text-gray-700">
            לעסק הזה כבר יש מנהל רשום. אם זו טעות,{' '}
            <Link href="/צור-קשר/" className="text-primary underline">
              צרו איתנו קשר
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mb-6 mt-2 text-gray-600">
              בעלי העסק יכולים לעדכן את הפרופיל, להעלות תמונות ולראות פניות וחוות דעת. השאירו פרטים ונאמת את הבעלות
              על העסק.
            </p>
            <ClaimForm
              slug={business.slug}
              businessHref={href}
              defaults={{ fullName: profile.full_name ?? '', phone: profile.phone ?? '', email: profile.email ?? '' }}
            />
          </>
        )}
      </div>
    </div>
  );
}
