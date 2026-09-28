import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { getRegionSlugById } from '@/lib/db/account';
import { formatPrice, listMyOrders, listMyPaidServicePlans, listOrderItems } from '@/lib/db/commerce';
import type { OrderStatus } from '@/lib/db/types';
import { commerceMetadata } from '@/lib/commerce/seo';
import { ORDER_STATUS_LABELS } from '@/lib/commerce/order-status';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Auth guard before streaming -> real redirect to /login/.
  await requireRole('member', '/account/');
  return commerceMetadata({ title: 'החשבון שלי - בונים בית', path: '/account/', noindex: true });
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' });

/**
 * Member account area ("החשבון שלי"). The live site has no account URL
 * (/my-account/ 301s home; the profile lives in a popup), so this is new:
 * profile, service plan, orders, and links for professionals.
 */
export default async function AccountPage() {
  const profile = await requireRole('member', '/account/');
  const db = createClient();
  const [orders, plans, regionSlug] = await Promise.all([
    listMyOrders(db, profile.id),
    listMyPaidServicePlans(db, profile.id),
    profile.region_id ? getRegionSlugById(db, profile.region_id) : Promise.resolve(null),
  ]);
  const items = await listOrderItems(db, orders.map((o) => o.id));
  const isPro = hasRole(profile.role, 'pro');

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">החשבון שלי</h1>
          <p className="mt-1 text-gray-500">שלום{profile.full_name ? ` ${profile.full_name}` : ''}, כאן מנהלים את הפרטים, ההזמנות ותוכנית הניהול.</p>
        </div>
        <form action="/auth/signout/" method="post">
          <button type="submit" className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:border-red-300 hover:text-red-700">
            התנתקות
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="profile-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 id="profile-heading" className="mb-4 text-xl font-bold text-gray-900">
              הפרטים שלי
            </h2>
            <ProfileForm
              profile={{
                fullName: profile.full_name,
                email: profile.email,
                phone: profile.phone,
                stage: profile.construction_stage,
                regionSlug,
                whatsappOptIn: profile.whatsapp_opt_in,
                newsletterOptIn: profile.newsletter_opt_in ?? false,
              }}
            />
          </section>

          <section aria-labelledby="orders-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 id="orders-heading" className="mb-4 text-xl font-bold text-gray-900">
              ההזמנות שלי
            </h2>
            {orders.length === 0 ? (
              <p className="text-gray-500">
                עוד לא ביצעתם הזמנות.{' '}
                <Link href="/הטבות-לקהילה/" className="text-primary hover:underline">
                  להטבות לקהילה
                </Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-start text-gray-500">
                      <th scope="col" className="py-2 text-start font-medium">הזמנה</th>
                      <th scope="col" className="py-2 text-start font-medium">תאריך</th>
                      <th scope="col" className="py-2 text-start font-medium">פריטים</th>
                      <th scope="col" className="py-2 text-start font-medium">סטטוס</th>
                      <th scope="col" className="py-2 text-end font-medium">סה״כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-100 align-top">
                        <td className="py-3">
                          <Link href={`/account/orders/${o.id}/`} className="font-semibold text-primary hover:underline">
                            #{o.order_number}
                          </Link>
                        </td>
                        <td className="py-3 text-gray-600">{dateFmt.format(new Date(o.created_at))}</td>
                        <td className="py-3 text-gray-700">
                          {items
                            .filter((i) => i.order_id === o.id)
                            .map((i) => (i.quantity > 1 ? `${i.description} × ${i.quantity}` : i.description))
                            .join(', ')}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="py-3 text-end font-medium text-gray-900">{formatPrice(o.total_agorot)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-labelledby="plan-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 id="plan-heading" className="mb-3 text-xl font-bold text-gray-900">
              תוכנית הניהול שלי
            </h2>
            {plans.length === 0 ? (
              <>
                <p className="text-gray-600">עדיין אין לכם תוכנית ניהול פעילה.</p>
                <Link href="/membership-tiers/" className="mt-3 inline-block font-semibold text-primary hover:underline">
                  להשוואת תוכניות הניהול
                </Link>
              </>
            ) : (
              <ul className="space-y-3">
                {plans.map((p) => (
                  <li key={`${p.orderId}-${p.description}`} className="rounded-xl bg-primary-50 p-4">
                    <p className="font-bold text-gray-900">{p.planName}</p>
                    {p.description !== p.planName && <p className="text-sm text-gray-600">{p.description}</p>}
                    <p className="mt-1 text-sm text-gray-500">
                      הזמנה #{p.orderNumber}
                      {p.paidAt ? ` · ${dateFmt.format(new Date(p.paidAt))}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pro-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 id="pro-heading" className="mb-3 text-xl font-bold text-gray-900">
              {isPro ? 'אזור בעלי מקצוע' : 'בעלי מקצוע?'}
            </h2>
            {isPro ? (
              <>
                <p className="text-gray-600">ניהול פרופיל העסק, פרטי קשר ופניות מלקוחות.</p>
                <Link
                  href="/partner-portal/"
                  className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-700"
                >
                  לפורטל השותפים
                </Link>
              </>
            ) : (
              <>
                <p className="text-gray-600">הצטרפו לנבחרת המומלצים של בונים בית וקבלו פניות מלקוחות.</p>
                <Link href="/join-us/" className="mt-3 inline-block font-semibold text-primary hover:underline">
                  הצטרפות כבעל מקצוע
                </Link>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === 'paid'
      ? 'bg-green-50 text-green-800'
      : status === 'pending'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-gray-100 text-gray-700';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{ORDER_STATUS_LABELS[status]}</span>;
}
