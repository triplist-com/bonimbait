import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ManagedProjectView } from '@/components/bonimos/ManagedProjectView';
import MemberBonimosProvider from '@/components/bonimos/MemberBonimosProvider';
import { getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { isUuid, loadManagedProject } from '@/lib/bonimos/server';

export const metadata: Metadata = { title: 'תיק הפרויקט' };

/**
 * The managed project, for its manager and its client alike (RLS: project
 * members only; anyone else gets a 404, never a hint that it exists).
 */
export default async function ManagedProjectPage({ params }: { params: { projectId: string } }) {
  if (!isUuid(params.projectId)) notFound();
  const user = await getUser();
  if (!user) redirect(`/login/?next=${encodeURIComponent(`/manage/${params.projectId}/`)}`);
  const data = await loadManagedProject(user, params.projectId);
  if (!data) notFound();
  const manager = data.viewer.role === 'manager';
  return (
    <MemberBonimosProvider projectId={data.project.id}>
      <ManagedProjectView
        data={data}
        backHref={manager ? '/manage/' : isEnabled('hub') ? '/my-home/' : null}
        backLabel={manager ? 'כל הפרויקטים' : 'הבית שלי'}
      />
    </MemberBonimosProvider>
  );
}
