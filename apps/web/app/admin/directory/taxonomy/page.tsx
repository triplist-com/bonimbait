import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { listRegions, listSpecialties } from '@/lib/db/businesses';
import { deleteRegion, deleteSpecialty, saveRegion, saveSpecialtyAction } from '@/lib/admin/actions/directory';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Checkbox, Section, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'תחומים ואזורים' };

export default async function DirectoryTaxonomyPage() {
  const db = createClient();
  const [specialties, regions, me] = await Promise.all([listSpecialties(db), listRegions(db), getProfile()]);
  const { data: links } = await db.from('business_specialties').select('specialty_id').range(0, 4999);
  const used = new Map<string, number>();
  (links ?? []).forEach((l) => used.set(l.specialty_id, (used.get(l.specialty_id) ?? 0) + 1));

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="תחומי מקצוע ואזורי עבודה" description="הרשימות שמשמשות לסינון בנבחרת המומלצים ובטפסים." />
      <Section title={`תחומי מקצוע (${specialties.length})`}>
        <details className="rounded-lg border border-dashed border-gray-300 p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">+ תחום חדש</summary>
          <ActionForm action={saveSpecialtyAction} resetOnSuccess className="mt-3 flex flex-wrap items-end gap-2">
            <TextInput name="name" placeholder="שם התחום" required className="max-w-xs" />
            <TextInput name="slug" placeholder="כתובת (אוטומטית)" dir="ltr" className="max-w-xs" />
            <TextInput name="sort_order" type="number" defaultValue={0} className="w-24" aria-label="סדר" />
            <SubmitButton>הוספה</SubmitButton>
          </ActionForm>
        </details>
        <div className="grid gap-2 lg:grid-cols-2">
          {specialties.map((s) => (
            <ActionForm key={s.id} action={saveSpecialtyAction} className="flex items-end gap-2 rounded-lg border border-gray-100 p-2">
              <input type="hidden" name="id" value={s.id} />
              <TextInput name="name" defaultValue={s.name} aria-label="שם" required />
              <TextInput name="slug" defaultValue={s.slug} dir="ltr" aria-label="כתובת" />
              <TextInput name="sort_order" type="number" defaultValue={s.sort_order} className="w-20" aria-label="סדר" />
              <input type="hidden" name="description" value={s.description ?? ''} />
              <input type="hidden" name="seo_title" value={s.seo_title ?? ''} />
              <input type="hidden" name="seo_description" value={s.seo_description ?? ''} />
              <span className="shrink-0 text-xs text-gray-500" title="עסקים משויכים">
                {used.get(s.id) ?? 0}
              </span>
              <SubmitButton>שמירה</SubmitButton>
              <ConfirmDialog trigger="מחיקה" title={`למחוק את "${s.name}"?`} body="אפשר למחוק רק תחום שאין בו עסקים." onConfirm={deleteSpecialty.bind(null, s.id)} />
            </ActionForm>
          ))}
        </div>
      </Section>

      <Section title={`אזורים (${regions.length})`}>
        <p className="text-xs text-gray-500">כינויים: שמות חלופיים שבהם האזור מופיע בטפסים (מופרדים בפסיק). מחיקת אזור שמורה למנהלים.</p>
        {[...regions, null].map((r) => (
          <ActionForm key={r?.id ?? 'new'} action={saveRegion} resetOnSuccess={!r} className="grid items-end gap-2 rounded-lg border border-gray-100 p-2 md:grid-cols-[1fr_10rem_5rem_1.5fr_auto_auto]">
            {r && <input type="hidden" name="id" value={r.id} />}
            <TextInput name="name" defaultValue={r?.name ?? ''} placeholder={r ? undefined : 'אזור חדש'} aria-label="שם" required />
            <TextInput name="slug" defaultValue={r?.slug ?? ''} dir="ltr" aria-label="כתובת" placeholder="slug" />
            <TextInput name="sort_order" type="number" defaultValue={r?.sort_order ?? 0} aria-label="סדר" />
            <TextInput name="aliases" defaultValue={(r?.aliases ?? []).join(', ')} aria-label="כינויים" placeholder="כינויים" />
            <Checkbox name="is_nationwide" defaultChecked={r?.is_nationwide ?? false} label="כל הארץ" />
            <div className="flex gap-2">
              <SubmitButton>{r ? 'שמירה' : 'הוספה'}</SubmitButton>
              {r && me?.role === 'admin' && <ConfirmDialog trigger="מחיקה" title={`למחוק את "${r.name}"?`} onConfirm={deleteRegion.bind(null, r.id)} />}
            </div>
          </ActionForm>
        ))}
      </Section>
    </div>
  );
}
