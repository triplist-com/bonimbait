import { CalendarClock, Calculator, FolderCheck, MapPin, MessageCircleQuestion, Ruler, Users, Wallet, Hammer } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatMonthHe, regionName, stageLabel } from '@/lib/project-file/format';
import { isEmptyProjectFile } from '@/lib/project-file/sanitize';
import type { ProjectFile } from '@/lib/project-file/types';
import { NisRange, Sqm } from './Amounts';

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-inset ring-sand-200 sm:gap-2.5 sm:px-3">
      <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-sand-800 sm:size-8 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-caption text-ink-500">{label}</span>
        <span className="block text-sm font-semibold leading-snug text-ink-900">{value}</span>
      </span>
    </li>
  );
}

/**
 * "התיק שלכם יגיע לצוות הייעוץ": the visitor's project file at a glance, in
 * the booking sheet. Server-safe and presentational (data as props).
 */
export default function ProjectFileSummary({
  file,
  title = 'התיק שלכם יגיע לצוות הייעוץ',
  className,
}: {
  file: ProjectFile;
  title?: string;
  className?: string;
}) {
  const empty = isEmptyProjectFile(file);
  const questions = file.questions?.length ?? 0;
  const shortlist = file.shortlistBusinessIds?.length ?? 0;
  const facts: Array<{ key: string; icon: ReactNode; label: string; value: ReactNode }> = [];
  if (file.stage) facts.push({ key: 'stage', icon: <Hammer />, label: 'שלב', value: stageLabel(file.stage) });
  if (file.regionSlug) facts.push({ key: 'region', icon: <MapPin />, label: 'אזור', value: regionName(file.regionSlug) });
  if (file.sizeM2) facts.push({ key: 'size', icon: <Ruler />, label: 'גודל', value: <Sqm value={file.sizeM2} /> });
  if (file.budgetRangeNis) facts.push({ key: 'budget', icon: <Wallet />, label: 'תקציב', value: <NisRange range={file.budgetRangeNis} /> });
  if (file.targetMoveIn) facts.push({ key: 'move', icon: <CalendarClock />, label: 'כניסה מתוכננת', value: formatMonthHe(file.targetMoveIn) });
  if (file.plannerEstimate)
    facts.push({
      key: 'planner',
      icon: <Calculator />,
      label: 'לפי המחשבון',
      value: <NisRange range={[file.plannerEstimate.totalMin, file.plannerEstimate.totalMax]} />,
    });

  return (
    <section aria-labelledby="pf-summary-title" className={cn('rounded-2xl border border-sand-200 bg-sand-50 p-4', className)}>
      <h3 id="pf-summary-title" className="flex items-center gap-2 text-title-sm text-ink-900">
        <FolderCheck aria-hidden="true" className="size-5 text-primary-700" />
        {title}
      </h3>
      {empty ? (
        <p className="mt-1.5 text-body-sm text-ink-600">
          עוד אין לנו פרטים על הפרויקט. ספרו לנו בקצרה איפה אתם עומדים, ומומחה בונים בית יגיע לשיחה מוכן.
        </p>
      ) : (
        <>
          <p className="mt-1 text-body-sm text-ink-600">כך מומחה בונים בית יגיע לשיחה כשהוא כבר מכיר את הפרויקט, בלי לשאול הכול מההתחלה.</p>
          {facts.length > 0 && <ul className="mt-3 grid grid-cols-2 gap-2">{facts.map(({ key, ...f }) => <Fact key={key} {...f} />)}</ul>}
          {(questions > 0 || shortlist > 0) && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700">
              {questions > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <MessageCircleQuestion aria-hidden="true" className="size-4 text-ink-500" />
                  {questions === 1 ? 'שאלה אחת ששאלתם באתר' : <span><span className="num">{questions}</span> שאלות ששאלתם באתר</span>}
                </li>
              )}
              {shortlist > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <Users aria-hidden="true" className="size-4 text-ink-500" />
                  {shortlist === 1 ? 'בעל מקצוע אחד ברשימה שלכם' : <span><span className="num">{shortlist}</span> בעלי מקצוע ברשימה שלכם</span>}
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
