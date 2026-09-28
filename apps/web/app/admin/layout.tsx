import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/session';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ניהול',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Signed-out users are redirected to /login/ (middleware + here);
  // signed-in non-admins to /login/?error=forbidden.
  const profile = await requireRole('admin', '/admin/');

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <AdminSidebar email={profile.email} />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
