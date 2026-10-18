import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getBusinessById,
  getBusinessContacts,
  listOwnedBusinesses,
  listRegions,
  listSpecialties,
  parseGallery,
} from '@/lib/db/businesses';
import { listLeads } from '@/lib/db/leads';
import { getProfile } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { absoluteUrl } from '@/lib/site';
import { businessHref, formatHebrewDate, formatScore, normalizeIsraeliPhone } from '@/lib/directory/format';
import { htmlToEditableText } from '@/lib/directory/html';
import { REVIEW_SCORE_LABELS } from '@/lib/db/reviews';
import type { BusinessRow, LeadRow, ReviewRow } from '@/lib/db/types';
import { ContactsForm, DetailsForm, MediaForm, TaxonomyForm } from '@/components/directory/PortalEditor';
import PortalDashboard from '@/components/revenue/portal/PortalDashboard';
import PartnerTierBadge from '@/components/revenue/PartnerTierBadge';
import { isEnabled } from '@/lib/flags';
import { onlinePaymentsEnabled } from '@/lib/payments';
import { reportDealAction, upgradeTierAction } from '@/lib/revenue/actions/portal';
import { revenueUserDb } from '@/lib/revenue/db';
import { loadPortalView } from '@/lib/revenue/portal-server';

const LOGIN_URL = '/login/?next=%2Fpartner-portal%2F';

/**
 * Signed-out visitors get a real 3xx to the login page. It must happen here:
 * the root loading.tsx streams the page body after a 200 has been sent.
 */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await getProfile())) redirect(LOGIN_URL);
  return {
    title: { absolute: 'ניהול העסק - בונים בית' },
    alternates: { canonical: absoluteUrl('/partner-portal/') },
    robots: { index: false, follow: false },
  };
}

const STATUS_LABEL: Record<BusinessRow['status'], string> = {
  draft: 'טיוטה',
  pending: 'ממתין לאישור',
  published: 'מפורסם',
  suspended: 'מושהה',
};

const REVIEW_STATUS: Record<ReviewRow['status'], string> = { pending: 'ממתינה לאישור', approved: 'מפורסמת', rejected: 'נדחתה' };

function Guidance() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">ניהול העסק</h1>
      <p className="mt-2 text-gray-600">לא מצאנו עסק שמשויך לחשבון שלך.</p>
      <ol className="mt-6 space-y-4 text-gray-700">
        <li>
          <p className="font-semibold text-gray-900">העסק שלך כבר מופיע בנבחרת המומלצים?</p>
          <p>
            חפשו אותו ב
            <Link href="/recommended/" className="text-primary underline">
              נבחרת המומלצים
            </Link>
            , היכנסו לעמוד העסק ולחצו על &quot;בקשת ניהול העסק&quot;. אחרי אימות קצר נחבר את העסק לחשבון שלך.
          </p>
        </li>
        <li>
          <p className="font-semibold text-gray-900">עסק חדש?</p>
          <p>
            <Link href="/join-us/" className="text-primary underline">
              הרשמה לבעלי מקצוע
            </Link>{' '}
            יוצרת עבורך טיוטת פרופיל, ונציג שלנו יחזור אליך.
          </p>
        </li>
      </ol>
    </div>
  );
}

function LeadsTable({ leads, total }: { leads: LeadRow[]; total: number }) {
  if (leads.length === 0) return <p className="text-sm text-gray-500">עדיין לא התקבלו פניות.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm text-gray-500">{total} פניות</p>
      <table className="w-full min-w-[36rem] text-start text-sm">
        <thead className="border-b border-gray-100 text-gray-500">
          <tr>
            <th className="py-2 text-start font-medium">תאריך</th>
            <th className="py-2 text-start font-medium">שם</th>
            <th className="py-2 text-start font-medium">טלפון</th>
            <th className="py-2 text-start font-medium">אימייל</th>
            <th className="py-2 text-start font-medium">סוג</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const kind = l.payload && typeof l.payload === 'object' && !Array.isArray(l.payload) ? l.payload.kind : null;
            return (
              <tr key={l.id} className="border-b border-gray-50">
                <td className="py-2 text-gray-600">{formatHebrewDate(l.created_at)}</td>
                <td className="py-2 font-medium text-gray-900">{l.full_name}</td>
                <td className="py-2" dir="ltr">
                  {l.phone && (
                    <a href={`tel:${l.phone}`} className="text-primary">
                      {l.phone}
                    </a>
                  )}
                </td>
                <td className="py-2" dir="ltr">
                  {l.email}
                </td>
                <td className="py-2 text-gray-600">{kind === 'phone_reveal' ? 'צפייה בטלפון' : kind === 'contact_form' ? 'טופס יצירת קשר' : 'פנייה'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewsList({ reviews }: { reviews: ReviewRow[] }) {
  if (reviews.length === 0) return <p className="text-sm text-gray-500">עדיין אין חוות דעת.</p>;
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-xl border border-gray-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-900">{r.author_name || 'לקוח/ה'}</span>
            <span className="text-gray-500">
              {formatHebrewDate(r.published_at ?? r.created_at)} · {REVIEW_STATUS[r.status]} · {formatScore(r.rating)}/10
            </span>
          </div>
          {r.body && <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{r.body}</p>}
          <p className="mt-2 text-xs text-gray-500">
            {(Object.keys(REVIEW_SCORE_LABELS) as Array<keyof typeof REVIEW_SCORE_LABELS>)
              .map((k) => `${REVIEW_SCORE_LABELS[k]}: ${formatScore(r[k])}`)
              .join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Business self-service portal. Signed-out visitors are sent to
 * /login/?next=/partner-portal/ (the live site 302s to wp-login.php).
 * With FLAG_REVENUE the portal leads with the business's results
 * (components/revenue/portal/PortalDashboard.tsx), then the profile editor.
 */
export default async function PartnerPortalPage({ searchParams }: { searchParams: { b?: string; upgraded?: string; checkout?: string } }) {
  const profile = await getProfile();
  if (!profile) redirect(LOGIN_URL);

  const db = createClient();
  const owned = await listOwnedBusinesses(db, profile.id);
  if (owned.length === 0) {
    return (
      <div className="container-page py-10">
        <Guidance />
      </div>
    );
  }

  const selected = owned.find((b) => b.id === searchParams.b) ?? owned[0];
  const canEdit = hasRole(profile.role, 'pro') && selected.status !== 'suspended';
  const revenue = isEnabled('revenue') && canEdit;

  const [detail, contacts, specialties, regions, leads, reviewsRes] = await Promise.all([
    getBusinessById(db, selected.id),
    getBusinessContacts(db, selected.id),
    listSpecialties(db),
    listRegions(db),
    revenue ? null : listLeads(db, { businessId: selected.id, pageSize: 50 }),
    db.from('reviews').select('*').eq('business_id', selected.id).order('created_at', { ascending: false }),
  ]);
  const reviews = reviewsRes.data ?? [];
  const phoneDigits = (v: string | null | undefined) => (v ? normalizeIsraeliPhone(v) ?? v : '');
  const view =
    revenue && detail
      ? await loadPortalView(
          revenueUserDb(),
          { ...detail, gallery: detail.gallery as unknown, specialties: detail.specialties, regions: detail.regions },
          contacts ? { phone: contacts.phone, whatsapp: contacts.whatsapp, lead_email: contacts.lead_email } : null,
        )
      : null;

  return (
    <div className="container-page space-y-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ניהול העסק</p>
          <h1 className="mt-1 text-headline text-ink-900">{selected.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
            <span>
              סטטוס: <span className="font-semibold">{STATUS_LABEL[selected.status]}</span>
            </span>
            {view?.business.badge && <PartnerTierBadge badge={view.business.badge} />}
            {selected.status === 'published' && (
              <Link href={businessHref(selected.slug)} className="text-primary-700 underline">
                לצפייה בעמוד העסק
              </Link>
            )}
            {view?.subscription && (
              <Link href={`/partner-portal/report/?b=${selected.id}`} className="text-primary-700 underline">
                דוח שותף
              </Link>
            )}
          </p>
        </div>
        {owned.length > 1 && (
          <nav aria-label="בחירת עסק" className="flex flex-wrap gap-2">
            {owned.map((b) => (
              <Link
                key={b.id}
                href={`/partner-portal/?b=${b.id}`}
                aria-current={b.id === selected.id ? 'page' : undefined}
                className={`rounded-full px-3 py-1 text-sm ${b.id === selected.id ? 'bg-primary text-white' : 'border border-gray-200 text-gray-700'}`}
              >
                {b.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {!canEdit && (
        <p className="rounded-2xl bg-warning-50 p-4 text-warning-800">
          {selected.status === 'suspended'
            ? 'העסק מושהה. לפרטים צרו קשר עם צוות בונים בית.'
            : 'הפרופיל ממתין לאישור צוות בונים בית. לאחר האישור תוכלו לערוך את הפרטים, להעלות תמונות ולראות פניות.'}
        </p>
      )}

      {view && (
        <PortalDashboard
          view={view}
          // Without online payments (no provider, or mock on production) the
          // tiers offer a conversation instead of a checkout that can't happen.
          upgradeAction={onlinePaymentsEnabled() ? upgradeTierAction : undefined}
          upgradeContactHref="/strategic-partners/"
          dealAction={reportDealAction}
          reportHref={view.subscription ? `/partner-portal/report/?b=${selected.id}` : null}
          notice={searchParams.upgraded === '1' ? 'upgraded' : searchParams.checkout === 'failed' ? 'checkout_failed' : null}
        />
      )}

      {canEdit && detail && (
        <section aria-labelledby="edit-title" className="space-y-4">
          {view && (
            <h2 id="edit-title" className="text-headline-sm text-ink-900">
              עריכת הפרופיל
            </h2>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <div id="details" className="scroll-mt-24">
              <DetailsForm
                businessId={selected.id}
                defaults={{
                  tagline: selected.tagline ?? '',
                  about: htmlToEditableText(selected.description_html),
                  city: selected.city ?? '',
                  website: selected.website ?? '',
                }}
              />
            </div>
            <div id="contacts" className="scroll-mt-24">
              <ContactsForm
                businessId={selected.id}
                leadRouting={selected.lead_routing}
                defaults={{
                  phone: phoneDigits(contacts?.phone),
                  whatsapp: phoneDigits(contacts?.whatsapp),
                  email: contacts?.email ?? '',
                  leadEmail: contacts?.lead_email ?? '',
                  otherPhones: (contacts?.other_phones ?? []).join(', '),
                }}
              />
            </div>
            <div id="taxonomy" className="scroll-mt-24">
              <TaxonomyForm
                businessId={selected.id}
                specialties={specialties.map((s) => ({ id: s.id, name: s.name }))}
                regions={regions.map((r) => ({ id: r.id, name: r.name }))}
                selectedSpecialties={detail.specialties.map((s) => s.id)}
                selectedRegions={detail.regions.map((r) => r.id)}
                primarySpecialtyId={selected.primary_specialty_id}
              />
            </div>
            <div id="media" className="scroll-mt-24">
              <MediaForm businessId={selected.id} initialGallery={parseGallery(selected.gallery)} initialLogo={selected.logo_url} />
            </div>
          </div>
        </section>
      )}

      {canEdit && !view && leads && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">פניות</h2>
            <LeadsTable leads={leads.items} total={leads.total} />
          </section>
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-gray-900">חוות דעת</h2>
            <ReviewsList reviews={reviews} />
          </section>
        </div>
      )}
    </div>
  );
}
