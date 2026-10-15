'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { dueLabel, type DueTone } from '@/lib/hub/format';
import type { HubTaskView } from '@/lib/hub/types';
import { cn } from '@/lib/cn';
import { useHubActions } from './HubActions';
import { HubSection, SignupPrompt } from './parts';

const TONE: Record<DueTone, 'danger' | 'warning' | 'neutral' | 'outline'> = {
  overdue: 'danger',
  today: 'warning',
  soon: 'warning',
  later: 'outline',
  none: 'neutral',
};

/** Open tasks first, by due date; done tasks last. */
export function sortTasks(tasks: HubTaskView[]): HubTaskView[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    return 0;
  });
}

export function TasksPanel({ tasks, today }: { tasks: HubTaskView[]; today: string }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [pending, startTransition] = useTransition();
  // Optimistic ticks until the refreshed list arrives.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => setTicks({}), [tasks]);
  const view = tasks.map((t) => (t.id in ticks ? { ...t, done: ticks[t.id] } : t));
  const open = view.filter((t) => !t.done).length;

  function toggle(id: string, done: boolean) {
    setTicks((m) => ({ ...m, [id]: done }));
    startTransition(async () => {
      const res = await actions.toggleTask(id, done);
      if (!res.ok) {
        setTicks((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        toast({ title: res.message ?? 'לא נשמר. נסו שוב.', tone: 'error' });
      }
    });
  }

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast({ title: res.message ?? 'לא נשמר. נסו שוב.', tone: 'error' });
      else if (success) toast({ title: success, tone: 'success' });
    });

  function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    run(async () => {
      const res = await actions.addTask({ title: t, dueOn: due || null });
      if (res.ok) {
        setTitle('');
        setDue('');
      }
      return res;
    });
  }

  return (
    <HubSection
      id="tasks"
      icon={<ListChecks />}
      title="משימות"
      subtitle={tasks.length ? `${open} פתוחות` : 'כל מה שאסור לשכוח, עם תאריך'}
    >
      {actions.needsAccount ? (
        <SignupPrompt
          title="רשימה אחת לכל מה שאסור לשכוח"
          description="פגישה עם המפקח, תשלום אגרה, הזמנת בטון. הירשמו, ותקבלו את המשימות המוצעות לשלב שלכם עם תאריכים."
        />
      ) : (
        <>
          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row" aria-label="הוספת משימה">
            <label className="sr-only" htmlFor="hub-task-title">
              משימה חדשה
            </label>
            <Input
              id="hub-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: לשלוח כתב כמויות לקבלנים"
              maxLength={160}
              wrapperClassName="flex-1"
              className="flex-1"
            />
            <label className="sr-only" htmlFor="hub-task-due">
              תאריך יעד
            </label>
            <Input id="hub-task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" className="text-start sm:w-44" />
            <Button type="submit" iconStart={<Plus />} loading={pending} disabled={!title.trim()} variant="secondary">
              הוספה
            </Button>
          </form>

          {tasks.length === 0 ? (
            <EmptyState
              className="mt-4 py-8"
              icon={<ListChecks />}
              title="עוד אין משימות"
              description="פגישה עם המפקח, תשלום אגרה, הזמנת בטון: רשמו כאן עם תאריך, וזה לא יפתיע אתכם. או התחילו מהצעדים הבאים של השלב שלכם."
              actions={
                <Button variant="outline" iconStart={<Sparkles />} loading={pending} onClick={() => run(() => actions.addSuggestedTasks(), 'הוספנו את הצעדים הבאים כמשימות')}>
                  הוסיפו את המשימות המוצעות
                </Button>
              }
            />
          ) : (
            <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-100" aria-busy={pending || undefined}>
              {sortTasks(view).map((t) => {
                const d = dueLabel(t.dueOn, today);
                return (
                  <li key={t.id} className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                      aria-label={`${t.done ? 'סמנו כפתוחה' : 'סמנו כבוצעה'}: ${t.title}`}
                      className="size-5 shrink-0 cursor-pointer rounded accent-primary-600"
                    />
                    <p className={cn('min-w-0 flex-1 text-body-sm text-ink-900', t.done && 'text-ink-500 line-through')}>{t.title}</p>
                    {!t.done && t.dueOn && (
                      <Badge tone={TONE[d.tone]} size="sm">
                        {d.label}
                      </Badge>
                    )}
                    <IconButton label={`מחיקת המשימה: ${t.title}`} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => run(() => actions.deleteTask(t.id))} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </HubSection>
  );
}
