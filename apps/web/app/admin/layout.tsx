import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/session';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ניהול',
  robots: { index: false, follow: false },
};

/**
 * Admin area: editors and admins. Admin-only sections (members, search
 * stats) call requireRole('admin') themselves. Every write re-checks the role
 * in its server action (lib/admin/guard.ts).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Signed-out users are redirected to /login/ (middleware + here);
  // signed-in non-staff to /login/?error=forbidden.
  const profile = await requireRole('editor', '/admin/');

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <AdminSidebar email={profile.email} role={profile.role} />
      <main id="admin-main" className="min-w-0 flex-1 p-5 lg:p-8">
        {children}
      </main>
    </div>
  );
}
