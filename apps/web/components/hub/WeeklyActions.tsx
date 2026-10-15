import Link from 'next/link';
import { ArrowLeft, CalendarCheck, KeyRound } from 'lucide-react';
import { buildStage } from '@/lib/hub/content';
import { isStageComplete, nextStage, weeklyActions } from '@/lib/hub/roadmap';
import type { HubViewData } from '@/lib/hub/types';
import { ChecklistToggle } from './ChecklistToggle';
import { NextStageCard } from './NextStageCard';
import { HubSection } from './parts';

/**
 * "מה עושים השבוע": the next three open steps of the current stage, each with
 * why it matters and the owner's guide for it. Tick one and the next step
 * takes its place. Server-safe shell; the ticks are client leaves.
 */
export function WeeklyActions({ data }: { data: HubViewData }) {
  const stage = data.project.stage;
  if (!stage) return null;
  const done = new Set(data.checklistDone);
  const actions = weeklyActions(stage, done, 3);
  const current = buildStage(stage);
  const next = nextStage(stage);
  const stageDone = isStageComplete(stage, done);

  return (
    <HubSection
      id="week"
      icon={<CalendarCheck />}
      title="מה עושים השבוע"
      subtitle={`שלושת הצעדים הבאים בשלב ${current.label}. סמנו כשסיימתם, והבא בתור ייכנס במקומו.`}
    >
      {stageDone && next && <NextStageCard currentLabel={current.label} next={next} nextLabel={buildStage(next).label} />}
      {actions.length === 0 ? (
        <p className="flex items-center gap-3 rounded-2xl bg-sand-50 p-4 text-body-sm text-ink-800">
          <KeyRound aria-hidden="true" className="size-5 shrink-0 text-primary-600" />
          סימנתם את כל הצעדים, מהמגרש ועד המפתח. ברוכים הבאים הביתה.
        </p>
      ) : (
        <ol className="grid gap-3 lg:grid-cols-3">
          {actions.map((a, i) => (
            <li key={a.id} className="flex flex-col rounded-2xl border border-ink-100 bg-paper p-4">
              <p className="mb-2 text-caption font-bold text-primary-700">
                צעד <span className="num">{i + 1}</span>
                {a.stage !== stage && <> · שלב {buildStage(a.stage).label}</>}
              </p>
              <ChecklistToggle itemId={a.id} stage={a.stage} checked={false} title={a.title} description={a.why} />
              {a.link && (
                <Link
                  href={a.link.href}
                  prefetch={false}
                  className="mt-3 inline-flex items-center gap-1 self-start text-caption font-semibold text-primary-700 hover:underline"
                >
                  {a.link.label}
                  <ArrowLeft aria-hidden="true" className="size-3.5 ltr:rotate-180" />
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </HubSection>
  );
}
