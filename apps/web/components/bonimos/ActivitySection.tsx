'use client';

import { useMemo, useState, useTransition } from 'react';
import { Camera, Coins, FileText, Flag, Milestone, MessageSquareText, NotebookPen, Receipt, Send, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ROLE_LABEL, activityLines, type ActivityLine } from '@/lib/bonimos/activity';
import type { ActivityKind, ManagedProjectData } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { useBonimosActions } from './BonimosActions';
import { OsSection, dateLabel, israelDateTime } from './parts';

const KIND_ICON: Record<ActivityKind, React.ReactNode> = {
  note: <MessageSquareText />,
  payment: <Receipt />,
  budget: <Coins />,
  milestone: <Milestone />,
  photo: <Camera />,
  document: <FileText />,
  team: <Users />,
  stage: <Flag />,
};

const FILTERS: Array<{ id: string; label: string; kinds: ActivityKind[] | null }> = [
  { id: 'all', label: 'הכול', kinds: null },
  { id: 'notes', label: 'הערות', kinds: ['note'] },
  { id: 'payments', label: 'תשלומים', kinds: ['payment'] },
  { id: 'budget', label: 'תקציב', kinds: ['budget'] },
  { id: 'schedule', label: 'לוח זמנים', kinds: ['milestone', 'stage'] },
  { id: 'files', label: 'תמונות ומסמכים', kinds: ['photo', 'document'] },
];

const PAGE = 25;

/** יומן הפרויקט: every step, who took it and when, and notes between the client and the manager. */
export function ActivitySection({ data, className }: { data: ManagedProjectData; className?: string }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const [pending, startTransition] = useTransition();
  const lines = useMemo(() => activityLines(data.activity, data.people, data.viewer.userId), [data.activity, data.people, data.viewer.userId]);
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? null;
  const filtered = kinds ? lines.filter((l) => kinds.includes(l.kind)) : lines;
  const shown = filtered.slice(0, limit);
  const yesterday = new Date(Date.parse(`${data.today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  const days: Array<{ date: string; lines: ActivityLine[] }> = [];
  for (const l of shown) {
    const date = israelDateTime(l.createdAt).date;
    const last = days.at(-1);
    if (last && last.date === date) last.lines.push(l);
    else days.push({ date, lines: [l] });
  }

  function addNote() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await actions.addNote(text);
      if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו לשמור. נסו שוב.', tone: 'error' });
      else {
        setBody('');
        toast({ title: 'נוסף ליומן', tone: 'success' });
      }
    });
  }

  return (
    <OsSection
      id="activity"
      icon={<NotebookPen />}
      title="יומן הפרויקט"
      subtitle="כל צעד בפרויקט, מי עשה אותו ומתי. כתבו כאן עדכון או שאלה, והצד השני יראה."
      className={className}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addNote();
        }}
        className="space-y-2"
      >
        <label htmlFor="bonimos-note" className="sr-only">
          הערה חדשה ליומן
        </label>
        <Textarea
          id="bonimos-note"
          rows={3}
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={data.viewer.role === 'manager' ? 'עדכון מהשטח, החלטה, מה הלאה…' : 'שאלה למנהל הפרויקט, החלטה, עדכון…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-ink-500">כל מי שבפרויקט רואה את ההערה.</p>
          <Button type="submit" size="sm" iconStart={<Send />} loading={pending} disabled={!body.trim()}>
            הוספה ליומן
          </Button>
        </div>
      </form>

      <div className="-mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none" role="group" aria-label="סינון היומן">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            size="sm"
            selected={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setLimit(PAGE);
            }}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-paper p-4 text-center text-body-sm text-ink-600">אין עדיין מה להראות כאן.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {days.map((d) => (
            <section key={d.date} aria-label={d.date === data.today ? 'היום' : dateLabel(d.date, data.today)}>
              <h3 className="mb-2 text-caption font-bold text-ink-600">
                {d.date === data.today ? 'היום' : d.date === yesterday ? 'אתמול' : dateLabel(d.date, data.today)}
              </h3>
              <ol className="space-y-3">
                {d.lines.map((l) => (
                  <Line key={l.id} line={l} onDelete={() => startTransition(async () => {
                    const res = await actions.deleteNote(l.id);
                    if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו למחוק.', tone: 'error' });
                  })} />
                ))}
              </ol>
            </section>
          ))}
          {filtered.length > shown.length && (
            <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
              הצגת עוד ({filtered.length - shown.length})
            </Button>
          )}
        </div>
      )}
    </OsSection>
  );
}

function Line({ line: l, onDelete }: { line: ActivityLine; onDelete: () => void }) {
  const note = l.kind === 'note';
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
          note ? 'bg-primary-50 text-primary-600' : 'bg-ink-100 text-ink-700',
        )}
      >
        {KIND_ICON[l.kind]}
      </span>
      <div className={cn('min-w-0 flex-1', note && 'rounded-2xl rounded-ss-md bg-paper px-3 py-2 ring-1 ring-inset ring-ink-100')}>
        <p className={cn('text-body-sm text-ink-900', note ? 'whitespace-pre-line' : 'font-semibold')}>{l.text}</p>
        {l.detail && <p className="mt-0.5 text-caption text-ink-600">{l.detail}</p>}
        <p className="mt-0.5 text-caption text-ink-500">
          {l.actorName}
          {l.actorRole && <> · {ROLE_LABEL[l.actorRole]}</>} · <span className="num">{israelDateTime(l.createdAt).time}</span>
        </p>
      </div>
      {l.deletable && <IconButton label="מחיקת ההערה" icon={<Trash2 />} size="sm" variant="ghost" onClick={() => window.confirm('למחוק את ההערה?') && onDelete()} />}
    </li>
  );
}
