'use client';

import { useState, useTransition } from 'react';
import { CircleCheck, Pencil, Play, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { BUILD_STAGES } from '@/lib/stages';
import type { StageId } from '@/lib/hub/types';
import { addDaysIso, milestoneStatus } from '@/lib/bonimos/milestones';
import type { MilestoneView } from '@/lib/bonimos/types';
import { useBonimosActions, type MilestoneDraftInput } from './BonimosActions';
import { FormError } from './parts';

function useRun() {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו. נסו שוב.', tone: 'error' });
      else {
        if (success) toast({ title: success, tone: 'success' });
        after?.();
      }
    });
  return { pending, run };
}

/** "בניית לוח זמנים ראשוני" (empty schedule only). */
export function CreateScheduleButton() {
  const actions = useBonimosActions();
  const { pending, run } = useRun();
  return (
    <Button iconStart={<Wand2 />} loading={pending} onClick={() => run(() => actions.createSchedule(), 'לוח הזמנים נבנה. התאימו את התאריכים לחוזים.')}>
      בניית לוח זמנים ראשוני
    </Button>
  );
}

export function AddMilestoneButton({
  milestones,
  defaultStage,
  today,
  variant = 'outline',
}: {
  milestones: MilestoneView[];
  defaultStage: StageId | null;
  today: string;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  const last = [...milestones].sort((a, b) => b.plannedEnd.localeCompare(a.plannedEnd))[0];
  const start = last && last.plannedEnd >= today ? addDaysIso(last.plannedEnd, 1) : today;
  return (
    <>
      <Button variant={variant} size="sm" iconStart={<Plus />} onClick={() => setOpen(true)}>
        אבן דרך
      </Button>
      {open && (
        <MilestoneDialog
          onClose={() => setOpen(false)}
          initial={{ stage: last?.stage ?? defaultStage ?? 'frame', title: '', plannedStart: start, plannedEnd: addDaysIso(start, 20) }}
        />
      )}
    </>
  );
}

/** Start / complete / edit, next to each milestone (managers). */
export function MilestoneRowControls({ milestone, today }: { milestone: MilestoneView; today: string }) {
  const actions = useBonimosActions();
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const status = milestoneStatus(milestone, today);
  const started = Boolean(milestone.actualStart);
  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-busy={pending || undefined}>
      {status !== 'done' && !started && (
        <IconButton
          label={`התחלנו: ${milestone.title}`}
          icon={<Play />}
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => actions.setMilestoneProgress(milestone.id, 'start'), 'סומן שהעבודה התחילה')}
        />
      )}
      {status !== 'done' && started && (
        <IconButton
          label={`הושלם: ${milestone.title}`}
          icon={<CircleCheck />}
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => actions.setMilestoneProgress(milestone.id, 'complete'), 'אבן הדרך סומנה כהושלמה')}
        />
      )}
      {status === 'done' && (
        <IconButton
          label={`החזרה לביצוע: ${milestone.title}`}
          icon={<RotateCcw />}
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => actions.setMilestoneProgress(milestone.id, 'reopen'))}
        />
      )}
      <IconButton label={`עריכה: ${milestone.title}`} icon={<Pencil />} size="sm" variant="ghost" onClick={() => setEditing(true)} />
      {editing && <MilestoneDialog onClose={() => setEditing(false)} initial={milestone} />}
    </div>
  );
}

function MilestoneDialog({ initial, onClose }: { initial: MilestoneDraftInput & { id?: string | null }; onClose: () => void }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const [form, setForm] = useState<MilestoneDraftInput>({
    id: initial.id ?? null,
    stage: initial.stage,
    title: initial.title,
    plannedStart: initial.plannedStart,
    plannedEnd: initial.plannedEnd,
    actualStart: initial.actualStart ?? null,
    actualEnd: initial.actualEnd ?? null,
    note: initial.note ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof MilestoneDraftInput>(key: K, value: MilestoneDraftInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    if (form.title.trim().length < 2) return setError('תנו לאבן הדרך שם.');
    if (!form.plannedStart || !form.plannedEnd || form.plannedStart > form.plannedEnd) return setError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה.');
    if (form.actualEnd && (!form.actualStart || form.actualStart > form.actualEnd)) return setError('סיום בפועל צריך התחלה בפועל שקודמת לו.');
    setError(null);
    start(async () => {
      const res = await actions.saveMilestone({ ...form, title: form.title.trim(), actualStart: form.actualStart || null, actualEnd: form.actualEnd || null });
      if (!res.ok) return setError(res.message ?? 'לא הצלחנו לשמור. נסו שוב.');
      toast({ title: form.id ? 'אבן הדרך עודכנה' : 'אבן הדרך נוספה', tone: 'success' });
      onClose();
    });
  }

  function remove() {
    if (!form.id || !window.confirm(`למחוק את "${form.title}" מלוח הזמנים?`)) return;
    start(async () => {
      const res = await actions.deleteMilestone(form.id!);
      if (!res.ok) return setError(res.message ?? 'לא הצלחנו למחוק. נסו שוב.');
      toast({ title: 'אבן הדרך נמחקה', tone: 'success' });
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={form.id ? 'עריכת אבן דרך' : 'אבן דרך חדשה'}
      description="תאריכים מתוכננים מול בפועל. כל שינוי נרשם ביומן הפרויקט."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {form.id ? (
            <Button variant="ghost" iconStart={<Trash2 />} onClick={remove} disabled={pending}>
              מחיקה
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          )}
          <Button onClick={save} loading={pending}>
            שמירה
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם אבן הדרך" required className="sm:col-span-2">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} placeholder="למשל: תקרת קומת קרקע" />
        </Field>
        <Field label="שלב">
          <Select value={form.stage} onChange={(e) => set('stage', e.target.value as StageId)}>
            {BUILD_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <span className="hidden sm:block" />
        <Field label="התחלה מתוכננת" required>
          <Input type="date" dir="ltr" value={form.plannedStart} onChange={(e) => set('plannedStart', e.target.value)} />
        </Field>
        <Field label="סיום מתוכנן" required>
          <Input type="date" dir="ltr" value={form.plannedEnd} onChange={(e) => set('plannedEnd', e.target.value)} />
        </Field>
        <Field label="התחלה בפועל" optional>
          <Input type="date" dir="ltr" value={form.actualStart ?? ''} onChange={(e) => set('actualStart', e.target.value || null)} />
        </Field>
        <Field label="סיום בפועל" optional>
          <Input type="date" dir="ltr" value={form.actualEnd ?? ''} onChange={(e) => set('actualEnd', e.target.value || null)} />
        </Field>
        <Field label="הערה" optional className="sm:col-span-2">
          <Textarea rows={2} value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} maxLength={300} />
        </Field>
        {error && <FormError className="sm:col-span-2">{error}</FormError>}
      </div>
    </Dialog>
  );
}
