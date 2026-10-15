'use client';

/**
 * Demo mode for /platform/demo/bonimos/: the real Bonim.Os view on the
 * fixture (lib/demo/fixtures/bonimos.ts). Switch between the project manager
 * and the client, approve the waiting payment, add a note, upload a photo
 * (resized in this browser, kept in memory). Nothing is saved, nothing reaches
 * the database, no money moves.
 */
import { useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, HardHat, House } from 'lucide-react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { budgetCategory } from '@/lib/hub/budget';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { applyTransition } from '@/lib/bonimos/approvals';
import { scheduleTemplate } from '@/lib/bonimos/milestones';
import type { BonimosDemoData } from '@/lib/demo/fixtures/bonimos';
import type { ActivityView, ManagedProjectData, PaymentRequestView, ProjectRole } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { BonimosActionsProvider, type BonimosActions } from './BonimosActions';
import { ManagedProjectView } from './ManagedProjectView';
import { ManagerWorkspace } from './ManagerWorkspace';

const DEMO_FILE = { ok: false, message: 'בתצוגת ההדגמה הקבצים לדוגמה בלבד.' };

function DemoInner({ initial }: { initial: BonimosDemoData }) {
  const [data, setDataState] = useState<ManagedProjectData>(initial.project);
  const [tab, setTab] = useState<'project' | 'workspace'>('project');
  // Actions read the latest state synchronously (a demo is one user, one click at a time).
  const dataRef = useRef(data);
  const setData = (update: (d: ManagedProjectData) => ManagedProjectData) => {
    dataRef.current = update(dataRef.current);
    setDataState(dataRef.current);
  };
  const seq = useRef(0);
  const { toast } = useToast();
  const nextId = (p: string) => `${p}-new-${(seq.current += 1)}`;
  const nowIso = () => new Date().toISOString();
  const role = data.viewer.role;
  const managerName = data.people.find((p) => p.role === 'manager')?.name ?? 'מנהלת הפרויקט';
  const clientName = data.people.find((p) => p.role === 'owner')?.name ?? 'הלקוח';

  const log = (d: ManagedProjectData, entry: Omit<ActivityView, 'id' | 'createdAt' | 'actorId' | 'refId' | 'body'> & Partial<ActivityView>): ManagedProjectData => ({
    ...d,
    activity: [{ id: nextId('a'), createdAt: nowIso(), actorId: d.viewer.userId, refId: null, body: null, ...entry }, ...d.activity],
  });

  const actions = useMemo<BonimosActions>(
    () => ({
      mode: 'demo',
      async requestPayment(input) {
        setData((d) => {
          const number = Math.max(0, ...d.payments.map((p) => p.number)) + 1;
          const at = nowIso();
          const attachment = input.file ? { id: nextId('d'), fileName: input.file.name, mimeType: input.file.type || 'application/pdf' } : null;
          const req: PaymentRequestView = {
            id: nextId('p'),
            number,
            contractor: input.contractor,
            title: input.title,
            category: (budgetCategory(input.category)?.id ?? 'other'),
            stage: budgetCategory(input.category)?.stage ?? null,
            milestoneId: input.milestoneId ?? null,
            attachment,
            requested: input.amount,
            approved: null,
            status: 'pending_review',
            dueOn: input.dueOn ?? null,
            paidOn: null,
            note: input.note ?? null,
            createdBy: d.viewer.userId,
            createdAt: at,
            updatedAt: at,
            events: [{ id: nextId('e'), action: 'requested', fromStatus: null, toStatus: 'pending_review', actorId: d.viewer.userId, actorRole: d.viewer.role, amount: input.amount, note: input.note ?? null, createdAt: at }],
          };
          return log({ ...d, payments: [req, ...d.payments] }, {
            kind: 'payment',
            action: 'payment.requested',
            meta: { number, title: req.title, contractor: req.contractor, amount_agorot: req.requested * 100 },
          });
        });
        return { ok: true };
      },
      async transition(requestId, action, opts) {
        let error: string | null = null;
        setData((d) => {
          const r = d.payments.find((p) => p.id === requestId);
          if (!r) {
            error = 'הבקשה לא נמצאה.';
            return d;
          }
          let next: PaymentRequestView;
          try {
            next = applyTransition(r, {
              action,
              role: d.viewer.role,
              isCreator: r.createdBy === d.viewer.userId,
              amount: opts?.amount ?? null,
              note: opts?.note ?? null,
              paidOn: opts?.paidOn ?? null,
              today: d.today,
              actorId: d.viewer.userId,
              at: nowIso(),
              eventId: nextId('e'),
            });
          } catch {
            error = 'הפעולה לא אפשרית במצב הזה.';
            return d;
          }
          let budgetItems = d.budgetItems;
          if (action === 'mark_paid' && next.approved != null) {
            budgetItems = [
              {
                id: nextId('i'),
                kind: 'actual',
                category: next.category,
                label: `בקשת תשלום #${next.number}: ${next.title}`,
                vendor: next.contractor,
                amount: next.approved,
                status: 'paid',
                occurredOn: next.paidOn,
                createdAt: nowIso(),
              },
              ...budgetItems,
            ];
          }
          const last = next.events.at(-1)!;
          return log(
            { ...d, budgetItems, payments: d.payments.map((p) => (p.id === requestId ? next : p)) },
            {
              kind: 'payment',
              action: `payment.${action}`,
              meta: { number: next.number, title: next.title, contractor: next.contractor, amount_agorot: last.amount == null ? undefined : last.amount * 100, note: last.note ?? undefined },
            },
          );
        });
        return error ? { ok: false, message: error } : { ok: true };
      },
      async createBudgetVersion({ plan, note }) {
        setData((d) => {
          const versionNo = Math.max(0, ...d.versions.map((v) => v.versionNo)) + 1;
          const total = Object.values(plan).reduce((a, b) => a + b, 0);
          return log(
            {
              ...d,
              versions: [
                ...d.versions.map((v) => ({ ...v, isCurrent: false })),
                { id: nextId('v'), versionNo, label: 'תקציב מאושר', basis: 'manual', note, createdAt: nowIso(), createdBy: d.viewer.userId, isCurrent: true, totalMin: total, totalMax: total, planned: plan },
              ],
            },
            { kind: 'budget', action: 'budget.version_created', meta: { version_no: versionNo, label: 'תקציב מאושר', note } },
          );
        });
        return { ok: true };
      },
      async saveMilestone(input) {
        setData((d) => {
          if (input.id) {
            return {
              ...d,
              milestones: d.milestones.map((m) =>
                m.id === input.id
                  ? { ...m, ...input, id: m.id, actualStart: input.actualStart ?? null, actualEnd: input.actualEnd ?? null, note: input.note ?? null }
                  : m,
              ),
            };
          }
          const id = nextId('m');
          return log(
            {
              ...d,
              milestones: [
                ...d.milestones,
                { id, stage: input.stage, title: input.title, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, actualStart: input.actualStart ?? null, actualEnd: input.actualEnd ?? null, note: input.note ?? null, sortOrder: 1000 },
              ],
            },
            { kind: 'milestone', action: 'milestone.added', meta: { title: input.title, stage: input.stage, planned_end: input.plannedEnd }, refId: id },
          );
        });
        return { ok: true };
      },
      async setMilestoneProgress(id, step) {
        setData((d) => {
          const m = d.milestones.find((x) => x.id === id);
          if (!m) return d;
          const updated =
            step === 'start'
              ? { ...m, actualStart: d.today, actualEnd: null }
              : step === 'complete'
                ? { ...m, actualStart: m.actualStart ?? d.today, actualEnd: d.today }
                : { ...m, actualEnd: null };
          const next = { ...d, milestones: d.milestones.map((x) => (x.id === id ? updated : x)) };
          if (step === 'reopen') return next;
          return log(next, {
            kind: 'milestone',
            action: step === 'start' ? 'milestone.started' : 'milestone.completed',
            meta: { title: m.title, stage: m.stage, slip_days: step === 'complete' ? Math.round((Date.parse(d.today) - Date.parse(m.plannedEnd)) / 86_400_000) : undefined },
            refId: id,
          });
        });
        return { ok: true };
      },
      async deleteMilestone(id) {
        setData((d) => ({ ...d, milestones: d.milestones.filter((m) => m.id !== id) }));
        return { ok: true };
      },
      async createSchedule() {
        setData((d) => {
          if (d.milestones.length) return d;
          const drafts = scheduleTemplate(d.project.stage ?? 'planning', d.today, DEFAULT_PRICE_BOOK.timelineMonths);
          return {
            ...d,
            milestones: drafts.map((x) => ({ id: nextId('m'), stage: x.stage, title: x.title, plannedStart: x.plannedStart, plannedEnd: x.plannedEnd, actualStart: null, actualEnd: null, note: null, sortOrder: x.sortOrder })),
          };
        });
        return { ok: true };
      },
      async addNote(body) {
        setData((d) => log(d, { kind: 'note', action: 'note.added', body, meta: {} }));
        return { ok: true };
      },
      async deleteNote(id) {
        setData((d) => ({ ...d, activity: d.activity.filter((a) => a.id !== id) }));
        return { ok: true };
      },
      async uploadDocument(file, category) {
        const id = nextId('d');
        setData((d) =>
          log(
            {
              ...d,
              documents: [
                { id, fileName: file.name, mimeType: file.type || 'application/pdf', sizeBytes: file.size, category, stage: d.project.stage, note: null, createdAt: nowIso() },
                ...d.documents,
              ],
            },
            { kind: 'document', action: 'document.uploaded', meta: { file_name: file.name, category } },
          ),
        );
        toast({ title: 'בהדגמה הקובץ לא נשמר', description: 'בפלטפורמה הוא עולה לתיק הפרטי של הפרויקט.', tone: 'info' });
        return { ok: true, id };
      },
      async openDocument() {
        return DEMO_FILE;
      },
      async deleteDocument(id) {
        setData((d) => ({ ...d, documents: d.documents.filter((x) => x.id !== id) }));
        return { ok: true };
      },
      async uploadPhotos({ files, captions, stage, takenOn, onProgress }) {
        const { resizeForUpload } = await import('@/lib/bonimos/resize');
        const added: ManagedProjectData['photos'] = [];
        onProgress?.(0, files.length);
        for (let i = 0; i < files.length; i += 1) {
          try {
            const { photo, thumb } = await resizeForUpload(files[i]);
            added.push({
              id: nextId('ph'),
              url: URL.createObjectURL(photo.blob),
              thumbUrl: URL.createObjectURL(thumb.blob),
              width: photo.width,
              height: photo.height,
              caption: captions[i]?.trim() || null,
              stage,
              takenOn,
              uploadedBy: dataRef.current.viewer.userId,
              createdAt: nowIso(),
            });
          } catch {
            // Skip a file the browser can't decode.
          }
          onProgress?.(i + 1, files.length);
        }
        if (!added.length) return { ok: false, message: 'לא הצלחנו לקרוא את התמונות. נסו JPG או PNG.' };
        setData((d) => log({ ...d, photos: [...added, ...d.photos] }, { kind: 'photo', action: 'photo.uploaded', meta: { count: added.length, stage: stage ?? undefined } }));
        return { ok: true, added: added.length, message: 'בהדגמה התמונות נשארות רק בדפדפן הזה. הן הוקטנו כאן, כמו באפליקציה.' };
      },
      async deletePhoto(id) {
        setData((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
        return { ok: true };
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setData writes through dataRef; toast is stable
    [toast],
  );

  function switchRole(next: ProjectRole) {
    setData((d) => ({ ...d, viewer: initial.viewers[next] }));
    if (next === 'owner') setTab('project');
  }

  return (
    <BonimosActionsProvider value={actions}>
      <div className="border-b border-ink-100 bg-white">
        <div className="container-page py-5 sm:py-6">
          <p className="eyebrow">
            <span dir="ltr">Bonim.Os</span> · מערכת הליווי ללקוחות הניהול
          </p>
          <p className="mt-1 text-headline-sm text-ink-900">שורה 3.3 במחירון שלכם. עכשיו היא אמיתית.</p>
          <p className="mt-2 max-w-3xl text-body text-ink-600">
            ״חיבור למערכת Bonim.Os לשליטה מלאה״ כבר מופיע בתוכנית עד מפתח. כאן הוא עובד: המנהלת והלקוחות רואים את אותו פרויקט, כל אחד עם הפעולות שלו.
            נסו לאשר את התשלום שמחכה, או לעבור לעיני הלקוחות.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="צפו בתור" className="inline-flex rounded-2xl bg-ink-100 p-1">
              <RoleButton active={role === 'manager'} onClick={() => switchRole('manager')} icon={<HardHat />}>
                <span className="sm:hidden">מנהלת הפרויקט</span>
                <span className="hidden sm:inline">{managerName} · מנהלת הפרויקט</span>
              </RoleButton>
              <RoleButton active={role === 'owner'} onClick={() => switchRole('owner')} icon={<House />}>
                <span className="sm:hidden">הלקוח</span>
                <span className="hidden sm:inline">{clientName} · הלקוח</span>
              </RoleButton>
            </div>
            {role === 'manager' && (
              <div role="group" aria-label="מסך" className="inline-flex rounded-2xl bg-ink-100 p-1">
                <RoleButton active={tab === 'project'} onClick={() => setTab('project')}>
                  הפרויקט
                </RoleButton>
                <RoleButton active={tab === 'workspace'} onClick={() => setTab('workspace')} icon={<BriefcaseBusiness />}>
                  כל הפרויקטים שלה
                </RoleButton>
              </div>
            )}
          </div>
        </div>
      </div>
      {tab === 'workspace' && role === 'manager' ? (
        <ManagerWorkspace projects={initial.workspace} today={data.today} now={initial.now} hrefFor={() => '#'} />
      ) : (
        <ManagedProjectView data={data} />
      )}
    </BonimosActionsProvider>
  );
}

function RoleButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors [&_svg]:size-4',
        active ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900',
      )}
    >
      {icon && (
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

export default function DemoBonimos({ data }: { data: BonimosDemoData }) {
  return (
    <ToastProvider>
      <DemoInner initial={data} />
    </ToastProvider>
  );
}
