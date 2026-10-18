import { notFound } from 'next/navigation';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import FormField, { Checkbox, Section, Select, TextInput } from '@/components/admin/FormField';
import PageHeader, { ButtonLink } from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import {
  addBonimosManager,
  assignBonimosManager,
  endBonimosClient,
  removeBonimosManager,
  startBonimosClient,
  unassignBonimosManager,
  updateBonimosManager,
} from '@/lib/admin/actions/bonimos';
import { formatDate } from '@/lib/admin/labels';
import { requireRole } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { isStageId } from '@/lib/hub/types';
import { getStage } from '@/lib/stages';
import { loadBonimosAdmin } from '@/lib/bonimos/admin';

export const metadata = { title: 'Bonim.Os · לקוחות ליווי' };

/**
 * /admin/bonimos/: who is managed, and by whom. Admins add project managers
 * to the team, move a client's hub project into Bonim.Os, and assign or
 * remove managers. What managers and clients do inside a project stays
 * private to them (RLS); this screen sees only the assignment directory.
 */
export default async function BonimosAdminPage() {
  await requireRole('admin', '/admin/bonimos/');
  if (!isEnabled('bonimos')) notFound();
  const { roster, projects } = await loadBonimosAdmin();
  const active = roster.filter((r) => r.active);

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title={
          <>
            <span dir="ltr">Bonim.Os</span> · לקוחות ליווי ומנהלי פרויקטים
          </>
        }
        description="שורה 3.3 במחירון: חיבור למערכת Bonim.Os לשליטה מלאה. כאן משבצים מנהלי פרויקטים ללקוחות הליווי. כל מנהל רואה רק את הפרויקטים ששובץ אליהם."
        actions={<ButtonLink href="/manage/" variant="secondary">לפרויקטים שלי ב-Bonim.Os</ButtonLink>}
      />

      <Section title="לקוח חדש בליווי">
        <ActionForm action={startBonimosClient} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <FormField label="המייל של הלקוח באתר" htmlFor="client-email" hint="הלקוח נרשם לאתר (חינם). הפרויקט שלו בהבית שלי עובר לליווי, עם כל מה שכבר יש בו.">
            <TextInput id="client-email" name="email" type="email" dir="ltr" required autoComplete="off" />
          </FormField>
          <FormField label="מנהל הפרויקט" htmlFor="client-manager">
            <Select id="client-manager" name="manager_id" defaultValue="">
              <option value="">אשבץ אחר כך</option>
              {active.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName} · {m.title}
                </option>
              ))}
            </Select>
          </FormField>
          <SubmitButton>העברה לליווי</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={`לקוחות בליווי (${projects.length})`}>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-600">עוד אין לקוחות בליווי. הוסיפו לקוח למעלה.</p>
        ) : (
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {projects.map((p) => {
              const stage = p.stage && isStageId(p.stage) ? getStage(p.stage)?.label : null;
              const available = active.filter((m) => !p.managers.some((x) => x.userId === m.userId) && m.userId !== p.clientId);
              return (
                <li key={p.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{p.title}</p>
                    <p className="text-sm text-ink-600">
                      {p.clientName || 'לקוח'} · <span dir="ltr">{p.clientEmail}</span>
                    </p>
                    <p className="text-xs text-ink-500">
                      {[stage ? `שלב ${stage}` : null, p.regionName, p.sizeM2 ? `${p.sizeM2} מ״ר` : null, `עודכן ${formatDate(p.updatedAt)}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {p.managers.length === 0 && <StatusBadge label="בלי מנהל" tone="amber" />}
                      {p.managers.map((m) => (
                        <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-0.5 pe-1 ps-2.5 text-xs font-medium text-ink-800">
                          {m.name}
                          <ConfirmDialog
                            trigger={
                              <>
                                <span aria-hidden="true">×</span>
                                <span className="sr-only">הסרת {m.name} מהפרויקט</span>
                              </>
                            }
                            triggerClassName="inline-flex size-5 items-center justify-center rounded-full text-ink-500 hover:bg-white hover:text-ink-900"
                            title={`להסיר את ${m.name} מהפרויקט?`}
                            body="המנהל יאבד גישה לפרויקט מיד. ההיסטוריה ביומן נשמרת."
                            confirmLabel="הסרה"
                            onConfirm={unassignBonimosManager.bind(null, p.id)}
                          >
                            <input type="hidden" name="manager_id" value={m.userId} />
                          </ConfirmDialog>
                        </span>
                      ))}
                    </div>
                    {available.length > 0 && (
                      <ActionForm action={assignBonimosManager.bind(null, p.id)} className="flex gap-2">
                        <Select name="manager_id" defaultValue="" aria-label={`שיבוץ מנהל ל${p.title}`} className="min-w-0">
                          <option value="" disabled>
                            שיבוץ מנהל…
                          </option>
                          {available.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.displayName}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton className="shrink-0">שיבוץ</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                  <ConfirmDialog
                    trigger="סיום ליווי…"
                    triggerClassName="justify-self-start rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-50 lg:justify-self-end"
                    title={`לסיים את הליווי של ${p.title}?`}
                    body="המנהלים יוסרו מהפרויקט. הלקוח ממשיך עם הבית שלי, וכל התקציב, התשלומים והתמונות נשמרים אצלו."
                    confirmLabel="סיום הליווי"
                    onConfirm={endBonimosClient.bind(null, p.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`צוות הליווי (${roster.length})`}>
        {roster.length === 0 ? (
          <p className="text-sm text-ink-600">עוד אין מנהלי פרויקטים בצוות. הוסיפו את הראשון למטה.</p>
        ) : (
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {roster.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">
                    {m.displayName} <span className="text-sm font-normal text-ink-600">· {m.title}</span>
                  </p>
                  <p className="text-sm text-ink-600">
                    <span dir="ltr">{m.email}</span>
                    {m.phone && (
                      <>
                        {' '}
                        · <span dir="ltr">{m.phone}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={m.active ? 'פעיל' : 'לא פעיל'} tone={m.active ? 'green' : 'gray'} />
                  <StatusBadge label={m.projectCount === 1 ? 'פרויקט אחד' : `${m.projectCount} פרויקטים`} tone="blue" />
                  <ConfirmDialog
                    trigger="עריכה…"
                    triggerClassName="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
                    title={`עריכה: ${m.displayName}`}
                    confirmLabel="שמירה"
                    tone="primary"
                    onConfirm={updateBonimosManager.bind(null, m.userId)}
                  >
                    <div className="space-y-3">
                      <FormField label="שם לתצוגה" htmlFor={`dn-${m.userId}`}>
                        <TextInput id={`dn-${m.userId}`} name="display_name" defaultValue={m.displayName} required />
                      </FormField>
                      <FormField label="תפקיד" htmlFor={`t-${m.userId}`}>
                        <TextInput id={`t-${m.userId}`} name="title" defaultValue={m.title} />
                      </FormField>
                      <FormField label="טלפון ללקוחות" htmlFor={`ph-${m.userId}`}>
                        <TextInput id={`ph-${m.userId}`} name="phone" dir="ltr" defaultValue={m.phone ?? ''} />
                      </FormField>
                      <Checkbox name="active" value="on" defaultChecked={m.active} label="פעיל (אפשר לשבץ ללקוחות)" />
                    </div>
                  </ConfirmDialog>
                  <ConfirmDialog
                    trigger="הסרה…"
                    triggerClassName="rounded-lg px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50 hover:text-danger-700"
                    title={`להסיר את ${m.displayName} מהצוות?`}
                    body={`יוסרו גם ${m.projectCount} השיבוצים לפרויקטים. היומנים של הפרויקטים נשמרים.`}
                    confirmLabel="הסרה מהצוות"
                    onConfirm={removeBonimosManager.bind(null, m.userId)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="מנהל פרויקט חדש בצוות">
        <ActionForm action={addBonimosManager} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <FormField label="המייל של המנהל באתר" htmlFor="m-email" hint="חשבון קיים: המנהל נרשם לאתר קודם.">
            <TextInput id="m-email" name="email" type="email" dir="ltr" required autoComplete="off" />
          </FormField>
          <FormField label="שם שהלקוחות יראו" htmlFor="m-name">
            <TextInput id="m-name" name="display_name" required />
          </FormField>
          <FormField label="תפקיד" htmlFor="m-title" hint="למשל: מנהלת פרויקט, מפקח בנייה">
            <TextInput id="m-title" name="title" placeholder="מנהל/ת פרויקט" />
          </FormField>
          <FormField label="טלפון ללקוחות" htmlFor="m-phone">
            <TextInput id="m-phone" name="phone" dir="ltr" inputMode="tel" />
          </FormField>
          <div className="sm:col-span-2">
            <SubmitButton>הוספה לצוות</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}
