'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CircleCheck, CircleDashed, FolderOpen } from 'lucide-react';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { Progress } from '@/components/ui/Steps';
import { monthLabel } from '@/lib/hub/format';
import { consultFile, projectFileCompleteness, type CompletenessKey } from '@/lib/hub/snapshot';
import type { HubViewData } from '@/lib/hub/types';
import { aiHref } from '@/lib/nav';
import { collectProjectFile } from '@/lib/project-file/collect';
import { regionName, stageLabel } from '@/lib/project-file/format';
import type { ProjectFile } from '@/lib/project-file/types';
import { cn } from '@/lib/cn';
import { DemoConsultButton } from './DemoConsultButton';
import { MoneyRange } from './Money';
import { HubSection } from './parts';

/** The CTA copy from the brief: the file goes with the builder to the consult. */
export const FILE_CTA_LABEL = 'קבעו פגישת ייעוץ — התיק יגיע איתכם';

/** Questions listed in the panel (the consult team sees all of them, newest first). */
const SHOWN_QUESTIONS = 3;

/**
 * "תיק הפרויקט שלי": exactly what the consult team will see in their queue
 * (the project file of PROGRAM.md §6, as components/revenue/ProjectFilePanel.tsx
 * shows it): the five facts, the questions asked here, the planner estimate,
 * the shortlist and the saved content, with a completeness meter and the
 * consult booking.
 */
export function ProjectFilePanel({ data }: { data: HubViewData }) {
  const [browser, setBrowser] = useState<ProjectFile | null>(null);
  useEffect(() => {
    if (data.mode !== 'demo') setBrowser(collectProjectFile());
  }, [data.mode]);

  // What a booking from here sends (lib/hub/snapshot.ts consultFile, the booking sheet's merge).
  const file = consultFile(data.mode, data.file, browser);
  const questions = file.questions ?? [];
  const questionCount = data.mode === 'demo' ? data.advisorQuestions ?? 0 : questions.length;
  const completeness = projectFileCompleteness(file, { hasEstimate: Boolean(file.plannerEstimate), questions: questionCount });
  const done = new Map(completeness.items.map((i) => [i.key, i]));
  const latest = [...questions].reverse().slice(0, SHOWN_QUESTIONS);

  const rows: Array<{ key: CompletenessKey; label: string; value: React.ReactNode; fill?: string }> = [
    { key: 'stage', label: 'שלב', value: stageLabel(file.stage) },
    { key: 'region', label: 'אזור', value: regionName(file.regionSlug) },
    { key: 'size', label: 'גודל', value: file.sizeM2 ? <><span className="num">{file.sizeM2}</span> מ״ר</> : null },
    {
      key: 'budget',
      label: 'תקציב',
      value: file.budgetRangeNis ? <MoneyRange min={file.budgetRangeNis[0]} max={file.budgetRangeNis[1]} /> : null,
    },
    { key: 'moveIn', label: 'כניסה', value: file.targetMoveIn ? monthLabel(file.targetMoveIn) : null },
    {
      key: 'estimate',
      label: 'מחשבון התקציב',
      value: file.plannerEstimate ? <MoneyRange min={file.plannerEstimate.totalMin} max={file.plannerEstimate.totalMax} /> : null,
      fill: '/calculator/',
    },
    {
      key: 'saved',
      label: 'תוכן שמור',
      value: !file.savedCount ? null : file.savedCount === 1 ? 'פריט אחד' : <><span className="num">{file.savedCount}</span> פריטים</>,
    },
    {
      key: 'shortlist',
      label: 'בעלי מקצוע',
      value: file.shortlistBusinessIds?.length ? <><span className="num">{file.shortlistBusinessIds.length}</span> ברשימה</> : null,
      fill: '/recommended/',
    },
    {
      key: 'questions',
      label: 'שאלות ששאלתם',
      value: questionCount ? <span className="num">{questionCount}</span> : null,
      fill: aiHref(),
    },
  ];

  return (
    <HubSection
      id="file"
      icon={<FolderOpen />}
      title="תיק הפרויקט שלי"
      subtitle="זה מה שצוות הייעוץ יראה כשתקבעו פגישה. ככל שהתיק מלא יותר, הפגישה מדויקת יותר."
      tone="sand"
    >
      <Progress value={completeness.percent} label={`התיק מלא ב-${completeness.percent}%`} tone={completeness.percent === 100 ? 'success' : 'brand'} />
      <dl className="mt-4 divide-y divide-sand-200 rounded-2xl bg-white px-4 ring-1 ring-inset ring-sand-200">
        {rows.map((row) => {
          const item = done.get(row.key);
          const filled = Boolean(row.value) && item?.done !== false;
          return (
            <div key={row.key} className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-body-sm text-ink-600">
                {filled ? (
                  <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success-600" />
                ) : (
                  <CircleDashed aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
                )}
                {row.label}
              </dt>
              <dd className={cn('text-end text-body-sm', filled ? 'font-semibold text-ink-900' : 'text-ink-500')}>
                {filled ? (
                  row.value
                ) : row.fill && data.mode !== 'demo' ? (
                  <Link href={row.fill} prefetch={false} className="underline decoration-ink-300 underline-offset-2 hover:text-primary-700">
                    {item?.hint}
                  </Link>
                ) : (
                  item?.hint
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {latest.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-inset ring-sand-200">
          <p className="text-caption font-semibold text-ink-600">השאלות שיגיעו עם התיק</p>
          <ul className="mt-1.5 space-y-1">
            {latest.map((q) => (
              <li key={`${q.at}-${q.q}`} className="line-clamp-2 text-body-sm text-ink-800">
                {q.q}
              </li>
            ))}
          </ul>
          {questions.length > latest.length && (
            <p className="mt-1 text-caption text-ink-500">
              ועוד <span className="num">{questions.length - latest.length}</span>
            </p>
          )}
        </div>
      )}
      {data.mode === 'demo' ? (
        <DemoConsultButton label={FILE_CTA_LABEL} fullWidth className="mt-5 !h-auto min-h-12 !whitespace-normal py-3 text-center leading-snug" />
      ) : (
        <ConsultationCTA
          source="hub-file"
          label={FILE_CTA_LABEL}
          fullWidth
          size="lg"
          showWhatsApp={false}
          className="mt-5 !h-auto min-h-12 !whitespace-normal py-3 text-center leading-snug"
        />
      )}
      <p className="mt-2 text-center text-caption text-ink-600">פגישת ייעוץ תקציב ללא עלות וללא התחייבות.</p>
    </HubSection>
  );
}
