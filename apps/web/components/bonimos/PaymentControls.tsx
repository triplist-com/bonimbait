'use client';

import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { Ban, CircleCheck, FileText, History, MessageCircleQuestion, Paperclip, Plus, Send, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { checkDocumentFile } from '@/components/hub/DocumentsPanel';
import { BUDGET_CATEGORIES, budgetCategory } from '@/lib/hub/budget';
import { formatMoneyExact } from '@/lib/hub/format';
import { getStage } from '@/lib/stages';
import {
  ACTION_META,
  EVENT_LABEL,
  PAYMENT_TRANSITIONS,
  STATUS_META,
  TRANSITION_ERROR_MESSAGE,
  availableActions,
  checkTransition,
  effectiveAmount,
  isMyTurn,
} from '@/lib/bonimos/approvals';
import { ROLE_LABEL } from '@/lib/bonimos/activity';
import type { ManagedProjectData, PaymentAction, PaymentRequestView } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { useBonimosActions } from './BonimosActions';
import { FormError, dateLabel, dateTimeLabel } from './parts';

const ACTION_ICON: Record<PaymentAction, React.ReactNode> = {
  review_approve: <Send />,
  review_reject: <Ban />,
  client_approve: <CircleCheck />,
  client_return: <MessageCircleQuestion />,
  mark_paid: <Wallet />,
  cancel: <X />,
};

/** One payment request: amounts, milestone, attachment, the audit log, and the viewer's actions. */
export function PaymentRequestCard({ request: r, data, compact = false }: { request: PaymentRequestView; data: ManagedProjectData; compact?: boolean }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<PaymentAction | null>(null);
  const [pending, startTransition] = useTransition();
  const role = data.viewer.role;
  const available = availableActions(r.status, role, r.createdBy === data.viewer.userId);
  const status = STATUS_META[r.status];
  const turn = isMyTurn(r.status, role);
  const milestone = r.milestoneId ? data.milestones.find((m) => m.id === r.milestoneId) : null;
  const people = useMemo(() => new Map(data.people.map((p) => [p.userId, p])), [data.people]);
  const adjusted = r.approved != null && r.approved < r.requested;
  const category = budgetCategory(r.category);

  const openAttachment = () =>
    startTransition(async () => {
      const res = await actions.openDocument(r.attachment!.id);
      if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו לפתוח את הקובץ.', tone: 'error' });
    });

  return (
    <article
      aria-labelledby={`pr-${r.id}`}
      className={cn(
        'rounded-2xl border p-4',
        turn ? 'border-primary-200 bg-primary-50/40 shadow-xs' : 'border-ink-100 bg-white',
        compact && 'p-3',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-ink-600">
            בקשה <span className="num">#{r.number}</span> · {r.contractor}
          </p>
          <h3 id={`pr-${r.id}`} className={cn('text-ink-900', compact ? 'text-title-sm' : 'text-title')}>
            {r.title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {turn && (
            <Badge tone="brand" size="sm">
              {role === 'manager' ? 'תורכם לבדוק' : 'תורכם לאשר'}
            </Badge>
          )}
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
      </div>

      <dl className={cn('mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
        <div>
          <dt className="text-caption text-ink-600">{adjusted ? 'הקבלן ביקש' : 'סכום'}</dt>
          <dd className={cn('font-bold text-ink-900', adjusted && 'font-semibold text-ink-600 line-through decoration-ink-400')}>{formatMoneyExact(r.requested)}</dd>
        </div>
        {r.approved != null && (
          <div>
            <dt className="text-caption text-ink-600">אושר בבדיקה</dt>
            <dd className="font-bold text-ink-900">{formatMoneyExact(r.approved)}</dd>
          </div>
        )}
        <div>
          <dt className="text-caption text-ink-600">סעיף בתקציב</dt>
          <dd className="text-ink-800">
            {category?.label ?? r.category}
            {r.stage && <span className="text-caption text-ink-500"> · {getStage(r.stage)?.label}</span>}
          </dd>
        </div>
        {!compact && milestone && (
          <div>
            <dt className="text-caption text-ink-600">אבן דרך</dt>
            <dd className="text-ink-800">
              <a href="#schedule" className="link">
                {milestone.title}
              </a>
            </dd>
          </div>
        )}
        {!compact && r.dueOn && r.status !== 'paid' && (
          <div>
            <dt className="text-caption text-ink-600">לתשלום עד</dt>
            <dd className="text-ink-800">{dateLabel(r.dueOn, data.today)}</dd>
          </div>
        )}
        {r.paidOn && (
          <div>
            <dt className="text-caption text-ink-600">שולם</dt>
            <dd className="text-ink-800">{dateLabel(r.paidOn, data.today)}</dd>
          </div>
        )}
      </dl>

      {!compact && r.note && <p className="mt-2 text-body-sm text-ink-700">״{r.note}״</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {r.attachment && (
          <button
            type="button"
            onClick={openAttachment}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-body-sm font-semibold text-primary-700 hover:underline"
          >
            <Paperclip aria-hidden="true" className="size-4" />
            <span className="max-w-[16rem] truncate" dir="auto">
              {r.attachment.fileName}
            </span>
          </button>
        )}
        <details className="group/log">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-body-sm font-semibold text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
            <History aria-hidden="true" className="size-4" />
            <span>
              יומן הבקשה (<span className="num">{r.events.length}</span>)
            </span>
          </summary>
          <ol className="mt-2 space-y-2 border-s-2 border-ink-100 ps-3">
            {r.events.map((e) => {
              const who = e.actorId ? people.get(e.actorId) : undefined;
              return (
                <li key={e.id} className="text-caption text-ink-700">
                  <p>
                    <span className="font-semibold text-ink-900">{EVENT_LABEL[e.action]}</span>
                    {e.amount != null && (e.action === 'requested' || e.action === 'review_approve' || e.action === 'mark_paid') && (
                      <> · {formatMoneyExact(e.amount)}</>
                    )}
                  </p>
                  <p className="text-ink-500">
                    {who?.name ?? (e.actorRole ? ROLE_LABEL[e.actorRole] : 'צוות בונים בית')}
                    {e.actorRole && who?.name && <> ({e.actorRole === 'manager' ? who.title ?? ROLE_LABEL.manager : ROLE_LABEL.owner})</>} ·{' '}
                    {dateTimeLabel(e.createdAt, data.today)}
                  </p>
                  {e.note && <p className="mt-0.5 text-ink-700">״{e.note}״</p>}
                </li>
              );
            })}
          </ol>
        </details>
      </div>

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          {available.map((a, i) => (
            <Button
              key={a}
              size="sm"
              variant={i === 0 && turn ? 'primary' : ACTION_META[a].tone === 'primary' ? 'secondary' : ACTION_META[a].tone}
              iconStart={ACTION_ICON[a]}
              onClick={() => setDialog(a)}
            >
              {ACTION_META[a].label}
            </Button>
          ))}
        </div>
      )}

      {dialog && <TransitionDialog action={dialog} request={r} data={data} onClose={() => setDialog(null)} />}
    </article>
  );
}

const DIALOG_COPY: Record<PaymentAction, { title: string; description: (r: PaymentRequestView) => string; noteLabel: string; noteHint?: string }> = {
  review_approve: {
    title: 'בדיקה והעברה לאישור הלקוח',
    description: (r) => `הקבלן ביקש ${formatMoneyExact(r.requested)}. אם חלק מהעבודה עוד לא הושלם, אשרו סכום נמוך יותר וכתבו למה.`,
    noteLabel: 'מה בדקתם',
    noteHint: 'למשל: ביקור באתר, הברזל תקין, הבטון לפי המפרט.',
  },
  review_reject: {
    title: 'דחיית הבקשה',
    description: () => 'הבקשה תיסגר, והקבלן יגיש בקשה חדשה ומתוקנת.',
    noteLabel: 'למה הבקשה נדחית',
  },
  client_approve: {
    title: 'אישור התשלום',
    description: (r) =>
      `לאשר תשלום של ${formatMoneyExact(effectiveAmount(r))} ל${r.contractor}? האישור נרשם ביומן, ואת הכסף עצמו מעבירים לקבלן כרגיל.`,
    noteLabel: 'הערה למנהל',
  },
  client_return: {
    title: 'שאלה למנהל הפרויקט',
    description: () => 'הבקשה חוזרת לבדיקה של המנהל יחד עם השאלה שלכם. אחרי שיענה, היא תחזור לאישורכם.',
    noteLabel: 'מה תרצו שהמנהל יבדוק',
  },
  mark_paid: {
    title: 'סימון התשלום כשולם',
    description: (r) => `${formatMoneyExact(effectiveAmount(r))} יירשמו בתקציב כתשלום בפועל בסעיף ${budgetCategory(r.category)?.label ?? ''}.`,
    noteLabel: 'הערה',
  },
  cancel: {
    title: 'ביטול הבקשה',
    description: () => 'הבקשה תיסגר בלי תשלום. אפשר לרשום בקשה חדשה בכל רגע.',
    noteLabel: 'סיבה',
  },
};

function TransitionDialog({ action, request: r, data, onClose }: { action: PaymentAction; request: PaymentRequestView; data: ManagedProjectData; onClose: () => void }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const rule = PAYMENT_TRANSITIONS[action];
  const copy = DIALOG_COPY[action];
  const [amount, setAmount] = useState(String(r.requested));
  const [note, setNote] = useState('');
  const [paidOn, setPaidOn] = useState(data.today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const amountValue = rule.adjustsAmount ? Number(amount.replace(/[,\s₪]/g, '')) : null;
    const check = checkTransition({
      status: r.status,
      action,
      role: data.viewer.role,
      isCreator: r.createdBy === data.viewer.userId,
      requested: r.requested,
      amount: amountValue,
      note,
      paidOn: action === 'mark_paid' ? paidOn : null,
      today: data.today,
    });
    if (!check.ok) return setError(TRANSITION_ERROR_MESSAGE[check.error]);
    setError(null);
    startTransition(async () => {
      const res = await actions.transition(r.id, action, { amount: check.amount, note: check.note, paidOn: check.paidOn });
      if (!res.ok) return setError(res.message ?? 'לא הצלחנו לשמור. נסו שוב.');
      toast({ title: ACTION_META[action].done, tone: 'success' });
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description(r)}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            חזרה
          </Button>
          <Button onClick={submit} loading={pending} iconStart={ACTION_ICON[action]} variant={action === 'review_reject' || action === 'cancel' ? 'secondary' : 'primary'}>
            {ACTION_META[action].label}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-2xl bg-paper p-3 text-body-sm text-ink-700 ring-1 ring-inset ring-ink-100">
          בקשה <span className="num">#{r.number}</span> · {r.contractor}: <span className="font-semibold text-ink-900">{r.title}</span>
        </p>
        {rule.adjustsAmount && (
          <Field label="סכום לאישור" hint={`עד ${formatMoneyExact(r.requested)}, הסכום שהקבלן ביקש.`} required>
            <Input inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} endAdornment="₪" className="text-end" />
          </Field>
        )}
        {action === 'mark_paid' && (
          <Field label="תאריך התשלום" required>
            <Input type="date" dir="ltr" value={paidOn} max={data.today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        )}
        <Field label={copy.noteLabel} hint={copy.noteHint} required={rule.noteRequired} optional={!rule.noteRequired}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error && <FormError>{error}</FormError>}
      </div>
    </Dialog>
  );
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

/** "+ בקשת תשלום": record a contractor's payment request (both the manager and the client may). */
export function NewPaymentRequestButton({ data }: { data: ManagedProjectData }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const contractors = useMemo(() => Array.from(new Set(data.payments.map((p) => p.contractor))).slice(0, 12), [data.payments]);
  // Payments usually follow a milestone that just finished: list them all, in schedule order.
  const milestoneOptions = useMemo(() => [...data.milestones].sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd)), [data.milestones]);
  const empty = { contractor: '', title: '', category: 'frame', amount: '', milestoneId: '', dueOn: '', note: '' };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const set = (key: keyof typeof empty, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    const amount = Number(form.amount.replace(/[,\s₪]/g, ''));
    if (form.contractor.trim().length < 2) return setError('כתבו את שם הקבלן או בעל המקצוע.');
    if (form.title.trim().length < 2) return setError('כתבו על מה התשלום.');
    if (!Number.isFinite(amount) || amount < 1) return setError('נא להזין סכום בשקלים.');
    if (file) {
      const problem = checkDocumentFile(file);
      if (problem) return setError(problem);
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.requestPayment({
        contractor: form.contractor.trim(),
        title: form.title.trim(),
        category: form.category,
        amount: Math.round(amount),
        milestoneId: form.milestoneId || null,
        dueOn: form.dueOn || null,
        note: form.note.trim() || null,
        file,
      });
      if (!res.ok) return setError(res.message ?? 'לא הצלחנו לשמור. נסו שוב.');
      toast({
        title: 'בקשת התשלום נרשמה',
        description: data.viewer.role === 'manager' ? 'עכשיו בדקו אותה והעבירו לאישור הלקוח.' : 'מנהל הפרויקט יבדוק אותה ויעביר אליכם לאישור.',
        tone: 'success',
      });
      setForm(empty);
      setFile(null);
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" iconStart={<Plus />} onClick={() => setOpen(true)}>
        בקשת תשלום
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="רישום בקשת תשלום מקבלן"
        description="הבקשה תעבור לבדיקה של מנהל הפרויקט, ואחריה לאישור הלקוח. אף כסף לא עובר דרך המערכת."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={submit} loading={pending} iconStart={<Send />}>
              רישום הבקשה
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="קבלן או בעל מקצוע" required>
            <Input value={form.contractor} onChange={(e) => set('contractor', e.target.value)} list={`${id}-contractors`} maxLength={120} autoComplete="off" />
          </Field>
          <datalist id={`${id}-contractors`}>
            {contractors.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Field label="סכום הבקשה" required>
            <Input inputMode="numeric" dir="ltr" value={form.amount} onChange={(e) => set('amount', e.target.value.replace(/[^\d,]/g, ''))} endAdornment="₪" className="text-end" />
          </Field>
          <Field label="על מה התשלום" required className="sm:col-span-2" hint="למשל: תשלום 3 לפי החוזה, עמודים ותקרת קומת קרקע">
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={160} />
          </Field>
          <Field label="סעיף בתקציב">
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="אבן דרך" optional>
            <Select value={form.milestoneId} onChange={(e) => set('milestoneId', e.target.value)} placeholder="בלי אבן דרך">
              {milestoneOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.actualEnd ? ' (הושלם)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="לתשלום עד" optional>
            <Input type="date" dir="ltr" value={form.dueOn} onChange={(e) => set('dueOn', e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-800">
              החשבון של הקבלן <span className="font-normal text-ink-500">(רשות)</span>
            </span>
            <input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor={`${id}-file`}
              className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink-300 bg-paper px-4 text-body-sm font-semibold text-ink-700 hover:border-primary-600"
            >
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate" dir="auto">
                {file ? file.name : 'צרפו PDF או תמונה'}
              </span>
            </label>
          </div>
          <Field label="הערה" optional className="sm:col-span-2">
            <Textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={500} />
          </Field>
          {error && <FormError className="sm:col-span-2">{error}</FormError>}
        </div>
      </Dialog>
    </>
  );
}
