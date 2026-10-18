'use client';

import { useMemo, useState, useTransition } from 'react';
import { FilePenLine, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Money, Variance } from '@/components/hub/Money';
import { BUDGET_CATEGORIES, type BudgetCategoryId } from '@/lib/hub/budget';
import { getStage } from '@/lib/stages';
import { currentVersion, diffPlans, formatPct, planTotal } from '@/lib/bonimos/budget';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { useBonimosActions } from './BonimosActions';
import { FormError } from './parts';

type Draft = Record<BudgetCategoryId, string>;

function toDraft(plan: Partial<Record<BudgetCategoryId, number>>): Draft {
  return Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.id, plan[c.id] ? String(plan[c.id]) : ''])) as Draft;
}

function parse(draft: Draft): Record<BudgetCategoryId, number> {
  return Object.fromEntries(
    BUDGET_CATEGORIES.map((c) => {
      const n = Number((draft[c.id] ?? '').replace(/[,\s₪]/g, ''));
      return [c.id, Number.isFinite(n) && n > 0 ? Math.round(n) : 0];
    }),
  ) as Record<BudgetCategoryId, number>;
}

/** "עדכון התקציב המאושר": the manager versions the budget, with a reason (shown in the change log). */
export function BudgetVersionButton({ data }: { data: ManagedProjectData }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const current = currentVersion(data.versions);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(current?.planned ?? data.baseline?.plan ?? {}));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const plan = useMemo(() => parse(draft), [draft]);
  const diff = useMemo(() => diffPlans(current?.planned ?? null, plan), [current, plan]);
  const nextNo = (data.versions.at(-1)?.versionNo ?? 0) + 1;

  function openDialog() {
    setDraft(toDraft(current?.planned ?? data.baseline?.plan ?? {}));
    setNote('');
    setError(null);
    setOpen(true);
  }

  function submit() {
    if (planTotal(plan) <= 0) return setError('נא להזין סכומים לפחות בקטגוריה אחת.');
    if (note.trim().length < 3) return setError('כתבו בכמה מילים למה התקציב משתנה. זה נשמר ביומן השינויים.');
    setError(null);
    startTransition(async () => {
      const res = await actions.createBudgetVersion({ plan, note: note.trim() });
      if (!res.ok) {
        setError(res.message ?? 'לא הצלחנו לשמור. נסו שוב.');
        return;
      }
      toast({ title: `התקציב המאושר עודכן לגרסה ${nextNo}`, description: 'השינוי נרשם ביומן, והלקוח רואה אותו עכשיו.', tone: 'success' });
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" iconStart={<FilePenLine />} onClick={openDialog}>
        {current ? 'עדכון התקציב המאושר' : 'אישור תקציב ראשון'}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`תקציב מאושר, גרסה ${nextNo}`}
        description="הסכומים בשקלים, לפני מע״מ. הגרסה הקודמת נשמרת, וההפרש מופיע ביומן השינויים."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={submit} loading={pending}>
              אישור גרסה <span className="num">{nextNo}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {data.baseline && (
            <div className="flex flex-col gap-2 rounded-2xl bg-sand-50 p-3 text-body-sm text-ink-700 ring-1 ring-inset ring-sand-200 sm:flex-row sm:items-center sm:justify-between">
              <p>
                בסיס ממחירון בונים בית (נכון ל-{data.baseline.validAsOf.slice(0, 4)}): <Money value={data.baseline.total} className="font-semibold text-ink-900" />{' '}
                לפי גודל הבית והאזור.
              </p>
              <Button variant="outline" size="sm" iconStart={<Sparkles />} onClick={() => setDraft(toDraft(data.baseline!.plan))}>
                מילוי מהמחירון
              </Button>
            </div>
          )}
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {BUDGET_CATEGORIES.map((c) => (
              <Field key={c.id} label={c.label} hint={c.stage ? getStage(c.stage)?.label : undefined}>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  value={draft[c.id]}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value.replace(/[^\d,]/g, '') }))}
                  endAdornment="₪"
                  placeholder="0"
                  className="text-end"
                />
              </Field>
            ))}
          </div>
          <div className="rounded-2xl bg-paper p-3 text-body-sm text-ink-700 ring-1 ring-inset ring-ink-100" aria-live="polite">
            סך הכול <Money value={planTotal(plan)} className="font-bold text-ink-900" />
            {current && (
              <>
                {' '}
                · מול גרסה <span className="num">{current.versionNo}</span>: <Variance value={diff.delta} className="font-semibold" />
                {diff.deltaPct != null && (
                  <>
                    {' '}
                    (<span className="num">{formatPct(diff.deltaPct)}</span>)
                  </>
                )}
                {diff.changes.length > 0 && (
                  <>
                    {' '}
                    · <span className="num">{diff.changes.length}</span> קטגוריות השתנו
                  </>
                )}
              </>
            )}
          </div>
          <Field label="למה התקציב משתנה?" hint="למשל: אחרי מכרז הקבלנים, נבחר קבלן השלד. נשמר ביומן ומוצג ללקוח." required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
          </Field>
          {error && <FormError>{error}</FormError>}
        </div>
      </Dialog>
    </>
  );
}
