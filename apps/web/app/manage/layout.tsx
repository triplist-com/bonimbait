import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BonimosShell, type ShellLink } from '@/components/bonimos/BonimosShell';
import { getProfile, getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { bonimosUserDb } from '@/lib/bonimos/db';
import { clientManagedProjectIds, managerProjectIds } from '@/lib/bonimos/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { template: '%s · Bonim.Os', default: 'Bonim.Os' },
  description: 'מערכת הליווי של בונים בית ללקוחות הניהול: תקציב מול ביצוע, לוח זמנים, אישורי תשלום, מסמכים ותמונות מהשטח.',
  robots: { index: false, follow: false },
};

/**
 * Bonim.Os (P7): the managed-client mode of the hub, for the owner's project
 * managers and their clients. Dark-launched behind FLAG_BONIMOS. Pages do
 * their own auth (each knows its `next` path); RLS decides what anyone sees.
 */
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  if (!isEnabled('bonimos')) notFound();
  const user = await getUser();
  const links: ShellLink[] = [];
  let userName: string | null = null;
  if (user) {
    const db = bonimosUserDb();
    const [profile, managed, own] = await Promise.all([
      getProfile(),
      managerProjectIds(db, user.id).catch(() => []),
      clientManagedProjectIds(db, user.id).catch(() => []),
    ]);
    userName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
    if (managed.length) links.push({ href: '/manage/', label: 'הפרויקטים שלי', icon: 'projects' });
    if (own.length && isEnabled('hub')) links.push({ href: '/my-home/', label: 'הבית שלי', icon: 'home' });
  }
  return (
    <BonimosShell links={links} userName={userName} signedIn={Boolean(user)}>
      {children}
    </BonimosShell>
  );
}
