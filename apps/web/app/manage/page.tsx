import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ManagerWorkspace } from '@/components/bonimos/ManagerWorkspace';
import { getUser } from '@/lib/auth/session';
import { israelToday } from '@/lib/hub/onboarding';
import { bonimosUserDb } from '@/lib/bonimos/db';
import { clientManagedProjectIds, loadManagerWorkspace } from '@/lib/bonimos/server';

export const metadata: Metadata = { title: 'הפרויקטים שלי' };

/**
 * The manager's workspace: the projects assigned to them (RLS: their
 * hub_project_members rows), the ones that need them first. A client who
 * lands here goes straight to their own managed project.
 */
export default async function ManagePage() {
  const user = await getUser();
  if (!user) redirect('/login/?next=/manage/');
  const projects = await loadManagerWorkspace(user);
  if (!projects.length) {
    const own = await clientManagedProjectIds(bonimosUserDb(), user.id);
    if (own.length) redirect(`/manage/${own[0]}/`);
  }
  return <ManagerWorkspace projects={projects} today={israelToday()} now={new Date().toISOString()} />;
}
