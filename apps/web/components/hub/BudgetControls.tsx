'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Check, Plus, Receipt, RefreshCw, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Radio } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { BUDGET_CATEGORIES, budgetCategory } from '@/lib/hub/budget';
import { dayMonthLabel, formatMoneyRange } from '@/lib/hub/format';
import { readPlanner } from '@/lib/hub/local';
import type { BudgetBasis, HubBudgetItemView, PlannerEstimate } from '@/lib/hub/types';
import { useHubActions } from './HubActions';
import { Money } from './Money';

/** "820,000" / "820000" / "820 אלף" -> 820000 (whole shekels), or NaN. */
export function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d.]/g, '');
  if (!digits) return NaN;
  const n = Number(digits);
  return /אלף/.test(raw) ? Math.round(n * 1000) : /מיליון/.test(raw) ? Math.round(n * 1_000_000) : Math.round(n);
}

export function BudgetAddButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" iconStart={<Plus />} onClick={() => setOpen(true)} aria-haspopup="dialog">
        הוספת הצעה או תשלום
      </Button>
      <BudgetItemDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function BudgetItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [kind, setKind] = useState<'quote' | 'actual'>('quote');
  const [category, setCategory] = useState('frame');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setVendor('');
    setAmount('');
    setDate('');
    setError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!Number.isFinite(value) || value < 1) {
      setError('כתבו את הסכום בשקלים, למשל 820,000');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.addBudgetItem({ kind, category, amount: value, vendor: vendor || null, occurredOn: date || null });
      if (!res.ok) {
        toast({ title: res.message ?? 'לא נשמר. נסו שוב.', tone: 'error' });
        return;
      }
      toast({ title: kind === 'quote' ? 'ההצעה נשמרה' : 'התשלום נרשם', tone: 'success' });
      reset();
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="הוספה לתקציב"
      description="הצעת מחיר שקיבלתם, או תשלום ששילמתם. נשווה אותם להערכה של הקטגוריה."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" form="hub-budget-form" loading={pending}>
            שמירה
          </Button>
        </div>
      }
    >
      <form id="hub-budget-form" onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-800">מה מוסיפים?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Radio name="kind" card label="הצעת מחיר" description="קיבלתם הצעה ועוד לא החלטתם" checked={kind === 'quote'} onChange={() => setKind('quote')} />
            <Radio name="kind" card label="תשלום" description="כסף שכבר יצא" checked={kind === 'actual'} onChange={() => setKind('actual')} />
          </div>
        </fieldset>
        <Field label="קטגוריה" hint={budgetCategory(category)?.examples}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={kind === 'quote' ? 'מאיזה ספק או קבלן' : 'למי שילמתם'} optional>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} placeholder="למשל: קבלן שלד א׳" />
        </Field>
        <Field label="סכום" error={error} required hint="בשקלים, כולל מע״מ אם שולם">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" dir="ltr" endAdornment="₪" placeholder="820,000" className="text-start" />
        </Field>
        <Field label={kind === 'quote' ? 'תאריך ההצעה' : 'תאריך התשלום'} optional>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="text-start" />
        </Field>
      </form>
    </Dialog>
  );
}

const STATUS_LABEL = { open: 'פתוחה', accepted: 'נבחרה', rejected: 'לא רלוונטית', paid: 'שולם' } as const;

export function BudgetItemList({ items }: { items: HubBudgetItemView[] }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);
  if (!items.length) {
    return (
      <p className="mt-5 flex items-start gap-3 rounded-2xl bg-sand-50 p-4 text-body-sm text-ink-700">
        <Receipt aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-600" />
        <span>
          קיבלתם הצעת מחיר? רשמו אותה כאן, גם אם עוד לא החלטתם. שלוש הצעות לאותה עבודה כבר מראות לכם אם ההערכה מחזיקה.
        </span>
      </p>
    );
  }
  const shown = showAll ? items : items.slice(0, 5);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו לעדכן. נסו שוב.', tone: 'error' });
      else if (done) toast({ title: done, tone: 'success' });
    });

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-title-sm text-ink-900">הצעות ותשלומים</h3>
      <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100" aria-busy={pending || undefined}>
        {shown.map((item) => (
          <li key={item.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-body-sm font-semibold text-ink-900">{item.vendor || item.label || budgetCategory(item.category)?.label}</p>
                <p className="text-caption text-ink-500">
                  {budgetCategory(item.category)?.label}
                  {item.occurredOn && <> · {dayMonthLabel(item.occurredOn)}</>}
                </p>
              </div>
              <Money
                value={item.amount}
                className={item.status === 'rejected' ? 'shrink-0 text-body-sm text-ink-500 line-through' : 'shrink-0 text-body-sm font-bold text-ink-900'}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <Badge tone={item.kind === 'actual' ? 'ink' : item.status === 'accepted' ? 'success' : item.status === 'rejected' ? 'neutral' : 'brand'} size="sm">
                {item.kind === 'actual' ? 'שולם' : `הצעה · ${STATUS_LABEL[item.status ?? 'open']}`}
              </Badge>
              <div className="flex items-center gap-1">
                {item.kind === 'quote' && item.status !== 'accepted' && (
                  <IconButton label="סמנו שההצעה נבחרה" icon={<Check />} size="sm" variant="ghost" onClick={() => run(() => actions.setQuoteStatus(item.id, 'accepted'), 'ההצעה סומנה כנבחרה')} />
                )}
                {item.kind === 'quote' && item.status === 'open' && (
                  <IconButton label="ההצעה לא רלוונטית" icon={<X />} size="sm" variant="ghost" onClick={() => run(() => actions.setQuoteStatus(item.id, 'rejected'))} />
                )}
                {item.kind === 'quote' && item.status !== 'open' && (
                  <IconButton label="החזרה להצעה פתוחה" icon={<RefreshCw />} size="sm" variant="ghost" onClick={() => run(() => actions.setQuoteStatus(item.id, 'open'))} />
                )}
                <IconButton label="מחיקה" icon={<Trash2 />} size="sm" variant="ghost" onClick={() => run(() => actions.deleteBudgetItem(item.id), 'נמחק')} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <Button variant="link" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'פחות' : `לכל ${items.length} הפריטים`}
        </Button>
      )}
    </div>
  );
}

/** The planner result's "שמרו בבית שלי" lands here with ?saved=planner (lib/planner/share.ts SAVE_TO_HOME_HREF). */
function takeSavedFromPlanner(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get('saved') !== 'planner') return false;
  url.searchParams.delete('saved');
  window.history.replaceState(window.history.state, '', url.toString());
  return true;
}

/**
 * Offer a new budget version when growth's planner has a newer result. Members
 * only. Arriving from the planner's "שמרו בבית שלי" is the builder's yes: the
 * new version is made at once (the previous one is kept).
 */
export function PlannerRebasePrompt({ currentBasis, currentAt }: { currentBasis: BudgetBasis; currentAt: string | null }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [planner, setPlanner] = useState<PlannerEstimate | null>(null);
  const [pending, startTransition] = useTransition();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return; // once per page load (StrictMode runs effects twice)
    checked.current = true;
    const fromPlanner = takeSavedFromPlanner();
    if (actions.mode !== 'member') {
      // A visitor's hub reads bb.planner.last directly: the estimate is already the budget.
      if (fromPlanner && actions.mode === 'local') toast({ title: 'התקציב מהמתכנן נשמר בבית שלי', tone: 'success' });
      return;
    }
    const p = readPlanner();
    if (!p || (currentBasis === 'planner' && currentAt === p.at)) return;
    if (!fromPlanner) {
      setPlanner(p);
      return;
    }
    startTransition(async () => {
      const res = await actions.rebaseFromPlanner(p);
      if (res.ok) toast({ title: 'התקציב עודכן לפי המתכנן. הגרסה הקודמת נשמרה.', tone: 'success' });
      else {
        toast({ title: res.message ?? 'לא הצלחנו לעדכן. נסו שוב.', tone: 'error' });
        setPlanner(p);
      }
    });
    // Once per page load: the arrival from the planner is read (and removed) on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The prompt goes away once the current version is the planner's result.
  useEffect(() => {
    if (planner && currentBasis === 'planner' && currentAt === planner.at) setPlanner(null);
  }, [planner, currentBasis, currentAt]);

  if (!planner) return null;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-info-50 p-4 text-info-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm">
        יש לכם תוצאה חדשה ממתכנן התקציב: <strong className="font-bold">{formatMoneyRange(planner.totalMin, planner.totalMax)}</strong>. לעדכן את התקציב לפיה? הגרסה
        הקודמת נשמרת.
      </p>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await actions.rebaseFromPlanner(planner);
            if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו לעדכן. נסו שוב.', tone: 'error' });
            else {
              toast({ title: 'התקציב עודכן לפי המתכנן', tone: 'success' });
              setPlanner(null);
            }
          })
        }
      >
        עדכון התקציב
      </Button>
    </div>
  );
}
