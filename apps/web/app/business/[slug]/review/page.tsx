import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublishedBusinessBySlug } from '@/lib/db/businesses';
import { getProfile } from '@/lib/auth/session';
import { absoluteUrl } from '@/lib/site';
import { businessHref, businessPath, decodeSlug } from '@/lib/directory/format';
import { createPublicClient } from '@/lib/directory/server';
import ReviewForm from '@/components/directory/ReviewForm';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const business = await getPublishedBusinessBySlug(createPublicClient(), decodeSlug(params.slug));
  if (!business) notFound(); // real 404 status (see app/business/[slug]/page.tsx)
  return {
    title: `חוות דעת על ${business.name}`,
    robots: { index: false, follow: true },
    alternates: { canonical: absoluteUrl(`${businessPath(business.slug)}review/`) },
  };
}

/** Review form (replaces the live "/?page_id=285?b=<id>" link, which now redirects home). */
export default async function WriteReviewPage({ params }: Props) {
  const business = await getPublishedBusinessBySlug(createPublicClient(), decodeSlug(params.slug));
  if (!business) notFound();
  const profile = await getProfile();

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
        <p className="text-sm text-gray-500">
          <Link href={businessHref(business.slug)} className="hover:text-primary">
            {business.name}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">חוות דעת על {business.name}</h1>
        <p className="mb-6 mt-2 text-gray-600">
          חוות הדעת שלכם עוזרת לבונים אחרים לבחור נכון. כל חוות דעת נבדקת לפני הפרסום.
          {!profile && (
            <>
              {' '}
              <Link href={`/login/?next=${encodeURIComponent(`${businessHref(business.slug)}review/`)}`} className="text-primary underline">
                התחברו
              </Link>{' '}
              כדי לקשר את חוות הדעת לחשבון שלכם.
            </>
          )}
        </p>
        <ReviewForm slug={business.slug} defaultName={profile?.full_name ?? ''} />
      </div>
    </div>
  );
}
