import { createClient } from '@/lib/supabase/server';
import { listDirectoryEntries, listSpecialties } from '@/lib/db/businesses';
import { saveRanking } from '@/lib/admin/actions/directory';
import PageHeader from '@/components/admin/PageHeader';
import RankingList from '@/components/admin/directory/RankingList';

export const metadata = { title: 'סדר הופעה' };

export default async function RankingPage() {
  const db = createClient();
  const [entries, specialties] = await Promise.all([listDirectoryEntries(db), listSpecialties(db)]);
  const spec = new Map(specialties.map((s) => [s.id, s.name]));
  // Same order as /recommended/: featured first, then sort_order, then name.
  const rows = [...entries]
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'he'))
    .map((e) => ({ id: e.id, name: e.name, city: e.city, is_featured: e.is_featured, specialty: e.primary_specialty_id ? spec.get(e.primary_specialty_id) ?? '' : '' }));
  return (
    <div className="max-w-5xl">
      <PageHeader
        back={{ href: '/admin/directory/businesses/', label: 'עסקים' }}
        title="סדר הופעה בנבחרת המומלצים"
        description={`${rows.length} עסקים מפורסמים, בסדר שבו הם מופיעים באתר. עסקים "מומלצים" תמיד מוצגים ראשונים.`}
      />
      <RankingList rows={rows} save={saveRanking} />
    </div>
  );
}
