import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import PageHeader, { ButtonLink } from '@/components/admin/PageHeader';
import PriceBookForm, { type PriceBookHistoryRow } from '@/components/admin/planner/PriceBookForm';
import { savePriceBook } from '@/lib/admin/actions/planner';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { asPlannerDb } from '@/lib/planner/db-types';
import { listPriceBookVersions, versionFromRow } from '@/lib/planner/price-book';

export const metadata = { title: 'מחירון מתכנן התקציב' };

/** Staff emails for the history column (profiles are private: service role, after the role check). */
async function editorEmails(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length || !isServiceRoleConfigured()) return out;
  try {
    const { data } = await createAdminClient().from('profiles').select('id, email').in('id', ids);
    for (const p of data ?? []) if (p.email) out.set(p.id, p.email);
  } catch {
    // History still renders without names.
  }
  return out;
}

export default async function PlannerPriceBookPage() {
  await requireRole('editor', '/admin/planner/');
  const db = asPlannerDb(createClient());
  const rows = await listPriceBookVersions(db).catch((err) => {
    console.error('[admin/planner] history unavailable:', err instanceof Error ? err.message : err);
    return [];
  });
  const versions = rows.map((r) => ({ row: r, version: versionFromRow(r) }));
  const current = versions.find((v) => v.version)?.version ?? null;
  const emails = await editorEmails(Array.from(new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))));
  const history: PriceBookHistoryRow[] = versions.map(({ row, version }) => ({
    id: row.id,
    validAsOf: row.valid_as_of,
    createdAt: row.created_at,
    editor: row.created_by ? emails.get(row.created_by) ?? 'צוות' : null,
    note: row.note,
    book: version?.book ?? null,
  }));

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="מחירון מתכנן התקציב"
        description="המספרים שמאחורי ״תקציב ראשוני ב-3 דקות״: מחיר למ״ר לפי רמת גמר, חלוקה ל-7 השלבים, תוספות, מקדמים, מע״מ ומקורות. כל שמירה היא גרסה חדשה עם תאריך תוקף."
        actions={
          <>
            <ButtonLink href="/calculator/" variant="secondary">
              לצפייה במחשבון
            </ButtonLink>
            <ButtonLink href="/calculator/beit-200-meter-standard/" variant="secondary">
              לתרחיש לדוגמה
            </ButtonLink>
          </>
        }
      />
      {!current && (
        <p className="mb-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700" role="status">
          אין עדיין גרסה שמורה בבסיס הנתונים: המחשבון משתמש במחירון הפתיחה (הנתונים של בונים בית ל-2026). שמירה ראשונה תיצור גרסה.
        </p>
      )}
      <PriceBookForm action={savePriceBook} book={current?.book ?? DEFAULT_PRICE_BOOK} history={history} />
    </div>
  );
}
