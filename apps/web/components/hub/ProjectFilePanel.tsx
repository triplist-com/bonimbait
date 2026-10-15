'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleDashed, FolderOpen } from 'lucide-react';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { Progress } from '@/components/ui/Steps';
import { buildStage } from '@/lib/hub/content';
import { monthLabel } from '@/lib/hub/format';
import { readAdvisorQuestionCount } from '@/lib/hub/local';
import { projectFileCompleteness, type CompletenessKey } from '@/lib/hub/snapshot';
import type { HubViewData } from '@/lib/hub/types';
import { cn } from '@/lib/cn';
import { DemoConsultButton } from './DemoConsultButton';
import { MoneyRange } from './Money';
import { HubSection } from './parts';

/** The CTA copy from the brief: the file goes with the builder to the consult. */
export const FILE_CTA_LABEL = 'קבעו פגישת ייעוץ — התיק יגיע איתכם';

/**
 * "תיק הפרויקט שלי": exactly what the consult team will see (the project file
 * of PROGRAM.md §6), how complete it is, and the consult booking. The
 * advisor's recent questions live in the browser (bb.advisor.recent).
 */
export function ProjectFilePanel({ data }: { data: HubViewData }) {
  const [localQuestions, setQuestions] = useState(0);
  useEffect(() => setQuestions(readAdvisorQuestionCount()), []);
  const questions = data.advisorQuestions ?? localQuestions;

  const { file, project, estimate } = data;
  const completeness = projectFileCompleteness(file, { hasEstimate: Boolean(estimate), questions });
  const done = new Map(completeness.items.map((i) => [i.key, i]));

  const rows: Array<{ key: CompletenessKey; label: string; value: React.ReactNode }> = [
    { key: 'stage', label: 'שלב', value: file.stage ? buildStage(file.stage).label : null },
    { key: 'region', label: 'אזור', value: project.regionName },
    { key: 'size', label: 'גודל', value: file.sizeM2 ? <><span className="num">{file.sizeM2}</span> מ״ר</> : null },
    {
      key: 'budget',
      label: 'תקציב',
      value: file.budgetRangeNis ? <MoneyRange min={file.budgetRangeNis[0]} max={file.budgetRangeNis[1]} /> : null,
    },
    { key: 'moveIn', label: 'כניסה', value: file.targetMoveIn ? monthLabel(file.targetMoveIn) : null },
    {
      key: 'estimate',
      label: 'הערכה',
      value: estimate ? <MoneyRange min={estimate.totalMin} max={estimate.totalMax} /> : null,
    },
    { key: 'saved', label: 'תוכן שמור', value: file.savedCount ? <><span className="num">{file.savedCount}</span> פריטים</> : null },
    {
      key: 'shortlist',
      label: 'בעלי מקצוע',
      value: file.shortlistBusinessIds?.length ? <><span className="num">{file.shortlistBusinessIds.length}</span> ברשימה</> : null,
    },
    { key: 'questions', label: 'שאלות ששאלתם', value: questions ? <span className="num">{questions}</span> : null },
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
                {filled ? row.value : item?.hint}
              </dd>
            </div>
          );
        })}
      </dl>
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
