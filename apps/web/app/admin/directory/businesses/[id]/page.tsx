import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBusinessById, getBusinessContacts, listRegions, listSpecialties, parseGallery } from '@/lib/db/businesses';
import { saveBusinessAction } from '@/lib/admin/actions/directory';
import { BUSINESS_STATUS } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import BusinessForm from '@/components/admin/directory/BusinessForm';

export const metadata = { title: 'עריכת עסק' };

export default async function EditBusinessPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const isNew = params.id === 'new';
  const business = isNew ? null : await getBusinessById(db, params.id).catch(() => null);
  if (!isNew && !business) notFound();

  const [specialties, regions, contacts, owner, reviewCount] = await Promise.all([
    listSpecialties(db),
    listRegions(db),
    business ? getBusinessContacts(db, business.id) : Promise.resolve(null),
    business?.owner_member_id
      ? db.from('profiles').select('email').eq('id', business.owner_member_id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    business
      ? db.from('reviews').select('id', { count: 'exact', head: true }).eq('business_id', business.id).then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  return (
    <div className="max-w-7xl">
      <PageHeader
        back={{ href: '/admin/directory/businesses/', label: 'כל העסקים' }}
        title={business?.name ?? 'עסק חדש'}
        description={
          business && (
            <span className="flex flex-wrap items-center gap-3">
              <StatusBadge info={BUSINESS_STATUS[business.status]} />
              <Link href={`/admin/directory/reviews/?business=${business.id}&status=all`} className="text-primary hover:underline">
                {reviewCount} ביקורות
              </Link>
              <Link href={`/admin/leads/?business=${business.id}`} className="text-primary hover:underline">
                לידים של העסק
              </Link>
            </span>
          )
        }
      />
      <BusinessForm
        action={saveBusinessAction}
        specialties={specialties}
        regions={regions}
        data={{
          business,
          contacts,
          specialtyIds: business?.specialties.map((s) => s.id) ?? [],
          regionIds: business?.regions.map((r) => r.id) ?? [],
          ownerEmail: owner?.email ?? null,
          gallery: business ? parseGallery(business.gallery) : [],
        }}
      />
    </div>
  );
}
