import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '@/lib/site';
import { businessHref, decodeSlug } from '@/lib/directory/format';

// Yoast values of the live page.
export const metadata: Metadata = {
  title: { absolute: 'תודה על חוות דעתך - בונים בית' },
  alternates: { canonical: absoluteUrl('/thank-you-review/') },
  openGraph: { title: 'תודה על חוות דעתך - בונים בית', url: absoluteUrl('/thank-you-review/'), type: 'article', locale: 'he_IL' },
};

export default function ThankYouReviewPage({ searchParams }: { searchParams: { b?: string | string[] } }) {
  const raw = Array.isArray(searchParams.b) ? searchParams.b[0] : searchParams.b;
  // Only a plain slug (no slashes) becomes a link back to the profile.
  const slug = raw ? decodeSlug(raw) : null;
  const backHref = slug && !/[/\\?#]/.test(slug) && slug.length < 200 ? businessHref(slug) : '/recommended/';

  return (
    <div className="container-page py-16 text-center sm:py-24">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-8 shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600" aria-hidden="true">
          ✓
        </div>
        <h1 className="text-3xl font-bold text-gray-900">תודה על חוות דעתך!</h1>
        <p className="mt-3 text-gray-600">חוות דעתך התקבלה. לאחר אימותה, נפרסמה באתר. תודה!</p>
        <Link href={backHref} className="mt-6 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-700">
          חזרה לדף בעל המקצוע
        </Link>
      </div>
    </div>
  );
}
