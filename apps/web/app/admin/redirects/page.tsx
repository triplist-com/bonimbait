import { createClient } from '@/lib/supabase/server';
import { listRedirects } from '@/lib/db/redirects';
import type { RedirectRow } from '@/lib/db/types';
import { removeRedirect, saveRedirectAction, testRedirectAction } from '@/lib/admin/actions/settings';
import PageHeader, { FilterBar } from '@/components/admin/PageHeader';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import RedirectTester from '@/components/admin/RedirectTester';
import { Checkbox, Section, Select, TextInput } from '@/components/admin/FormField';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';

export const metadata = { title: 'הפניות' };

const SOURCE: Record<RedirectRow['source'], string> = { manual: 'ידני', wp_redirection: 'מהאתר הישן', migration: 'הגירה' };

function RuleForm({ r }: { r: RedirectRow | null }) {
  return (
    <ActionForm action={saveRedirectAction} resetOnSuccess={!r} className="grid items-center gap-2 md:grid-cols-[1.3fr_1.3fr_6rem_auto_1fr_auto]">
      {r && <input type="hidden" name="id" value={r.id} />}
      <TextInput name="from_path" defaultValue={r?.from_path ?? ''} placeholder="/כתובת-ישנה/" dir="ltr" required aria-label="מקור" />
      <TextInput name="to_path" defaultValue={r?.to_path ?? ''} placeholder="/כתובת-חדשה/" dir="ltr" required aria-label="יעד" />
      <Select name="code" defaultValue={String(r?.code ?? 301)} aria-label="קוד">
        <option value="301">301 קבועה</option>
        <option value="302">302 זמנית</option>
        <option value="307">307</option>
        <option value="308">308</option>
      </Select>
      <Checkbox name="is_active" defaultChecked={r?.is_active ?? true} label="פעילה" />
      <TextInput name="note" defaultValue={r?.note ?? ''} placeholder="הערה" aria-label="הערה" />
      <div className="flex items-center gap-2">
        <SubmitButton>{r ? 'שמירה' : 'הוספה'}</SubmitButton>
        {r && <ConfirmDialog trigger="מחיקה" title="למחוק את ההפניה?" body={<span dir="ltr">{r.from_path}</span>} onConfirm={removeRedirect.bind(null, r.id)} />}
      </div>
    </ActionForm>
  );
}

export default async function RedirectsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = param(searchParams.q);
  const page = pageParam(searchParams.page);
  const pageSize = 50;
  const result = await listRedirects(createClient(), { page, pageSize, search: q });

  return (
    <div className="max-w-7xl space-y-5">
      <PageHeader
        title="הפניות (Redirects)"
        description="מחליף את תוסף Redirection של וורדפרס. הכתובות נשמרות בלי / בסוף ומתאימות גם לכתובות מקודדות. שינוי חל מיד בכפתור הבדיקה, ובכל שרתי האתר תוך עד 5 דקות (REDIRECT_CACHE_TTL_SECONDS)."
      />
      <Section title="הפניה חדשה">
        <RuleForm r={null} />
      </Section>
      <FilterBar action="/admin/redirects/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">חיפוש בכתובת המקור</span>
          <TextInput name="q" defaultValue={q} dir="ltr" />
        </label>
      </FilterBar>
      <Section title={`${result.total} הפניות`}>
        <ul className="space-y-3">
          {result.items.map((r) => (
            <li key={r.id} className={`rounded-lg border p-2 ${r.is_active ? 'border-gray-100' : 'border-dashed border-gray-300 bg-gray-50'}`}>
              <RuleForm r={r} />
              <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs text-gray-500">
                <span>מקור: {SOURCE[r.source]}</span>
                {r.is_active ? <RedirectTester path={r.from_path} expected={r.to_path} test={testRedirectAction} /> : <span>לא פעילה</span>}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <AdminPagination basePath="/admin/redirects/" params={{ q }} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
