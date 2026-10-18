import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LocalHubProvider from '@/components/hub/LocalHubProvider';
import MemberHubProvider from '@/components/hub/MemberHubProvider';
import { StageDetail } from '@/components/hub/StageDetail';
import { getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { buildStage } from '@/lib/hub/content';
import { hubUserDb } from '@/lib/hub/db';
import { loadStagePicks } from '@/lib/hub/picks';
import { getPrimaryProject } from '@/lib/hub/server';
import { isStageId } from '@/lib/hub/types';

export const dynamic = 'force-dynamic';

type Props = { params: { id: string } };

export function generateMetadata({ params }: Props): Metadata {
  if (!isStageId(params.id)) return { robots: { index: false, follow: false } };
  const stage = buildStage(params.id);
  return { title: `${stage.title} · הבית שלי`, description: stage.summary, robots: { index: false, follow: false } };
}

/** A stage of the roadmap in full (/my-home/stage/<id>/). Members tick under RLS; visitors tick locally. */
export default async function StagePage({ params }: Props) {
  if (!isEnabled('hub') || !isStageId(params.id)) notFound();
  const [user, picks] = await Promise.all([getUser(), loadStagePicks()]);

  if (!user) {
    return (
      <LocalHubProvider>
        <StageDetail stageId={params.id} picks={picks[params.id]} checklistDone={[]} projectStage={null} />
      </LocalHubProvider>
    );
  }

  const db = hubUserDb();
  const project = await getPrimaryProject(db, user.id);
  let done: string[] = [];
  if (project) {
    const { data } = await db.from('hub_checklist_state').select('item_id').eq('project_id', project.id).eq('done', true);
    done = ((data ?? []) as Array<{ item_id: string }>).map((r) => r.item_id);
  }
  const Provider = project ? MemberHubProvider : LocalHubProvider;
  return (
    <Provider>
      <StageDetail stageId={params.id} picks={picks[params.id]} checklistDone={done} projectStage={project?.stage ?? null} />
    </Provider>
  );
}
