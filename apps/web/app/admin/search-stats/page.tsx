import { requireRole } from '@/lib/auth/session';
import SearchStats from './SearchStats';

export const metadata = { title: 'סטטיסטיקות חיפוש' };

/** AI search usage stats (the pre-parity admin dashboard). Admins only. */
export default async function SearchStatsPage() {
  await requireRole('admin', '/admin/search-stats/');
  return <SearchStats />;
}
