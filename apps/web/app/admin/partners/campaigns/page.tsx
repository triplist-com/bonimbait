import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import { param } from '@/components/admin/AdminPagination';
import ActionForm from '@/components/admin/ActionForm';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import { Section, Select, TextArea, TextInput } from '@/components/admin/FormField';
import ActionButton from '@/components/revenue/admin/ActionButton';
import { formatDate, type Tone } from '@/lib/admin/labels';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { isEnabled } from '@/lib/flags';
import { BUILD_STAGES } from '@/lib/stages';
import { saveCampaign, setCampaignStatus } from '@/lib/revenue/actions/campaigns';
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, PLACEMENT_LABELS, campaignDates } from '@/lib/revenue/campaign-form';
import { revenueUserDb } from '@/lib/revenue/db';
import { isCampaignLive } from '@/lib/revenue/offers';
import { TOPICS, getTopic } from '@/lib/revenue/topics';
import { OFFER_PLACEMENTS, type CampaignStatus, type PartnerCampaignRow } from '@/lib/revenue/types';

export const metadata = { title: 'קמפיינים של שותפים' };

const PATH = '/admin/partners/campaigns/';
const TONES: Record<CampaignStatus, Tone> = { draft: 'gray', active: 'green', paused: 'amber', ended: 'gray' };

function Chk({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-sm text-gray-800 ring-1 ring-inset ring-gray-200 has-[:checked]:bg-primary-50 has-[:checked]:ring-primary-200">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="size-4 rounded border-gray-300 text-primary" />
      {label}
    </label>
  );
}

function targeting(c: PartnerCampaignRow): string {
  const parts = [
    c.topics.length ? c.topics.map((t) => getTopic(t)?.label ?? t).join(', ') : 'כל הנושאים',
    c.stages.length ? c.stages.map((s) => BUILD_STAGES.find((x) => x.id === s)?.label ?? s).join(', ') : null,
    c.region_slugs.length ? c.region_slugs.map((r) => MEMBER_REGIONS.find((x) => x.slug === r)?.name ?? r).join(', ') : null,
    c.placements.length ? c.placements.map((p) => PLACEMENT_LABELS[p as keyof typeof PLACEMENT_LABELS] ?? p).join(', ') : 'בכל המקומות',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Sponsored partner offers: targeting, the offer itself and its status. */
export default async function PartnerCampaignsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isEnabled('revenue')) notFound();
  const db = revenueUserDb();
  const [campaignsRes, bizRes, badgesRes] = await Promise.all([
    db.from('partner_campaigns').select('*').order('created_at', { ascending: false }),
    db.from('businesses').select('id, name, slug').eq('status', 'published').order('name'),
    db.from('partner_badges').select('business_id, tier_name'),
  ]);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);
  const campaigns = (campaignsRes.data ?? []) as PartnerCampaignRow[];
  const businesses = bizRes.data ?? [];
  const tierBy = new Map((badgesRes.data ?? []).map((b) => [b.business_id, b.tier_name]));
  // Partners on a tier first in the picker.
  const options = [...businesses].sort((a, b) => Number(tierBy.has(b.id)) - Number(tierBy.has(a.id)) || a.name.localeCompare(b.name, 'he'));
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const editId = param(searchParams.edit);
  const c = editId ? campaigns.find((x) => x.id === editId) ?? null : null;
  const dates = c ? campaignDates(c) : { starts_on: '', ends_on: '' };
  const now = new Date();

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="קמפיינים של שותפים"
        description="הצעות של שותפים שמופיעות בעמודי וידאו, במאמרים ובנבחרת המומלצים לפי נושא, שלב ואזור. כל חשיפה נספרת רק כשהיא נראתה באמת, וכל לחיצה ופנייה משויכות לשותף."
      />

      <DataTable
        rows={campaigns}
        rowKey={(x) => x.id}
        empty="עוד אין קמפיינים. צרו את הראשון בטופס למטה."
        columns={[
          {
            key: 'n',
            header: 'קמפיין',
            render: (x) => (
              <span>
                <Link href={`${PATH}?edit=${x.id}#campaign-form`} className="font-medium hover:text-primary hover:underline">
                  {x.name}
                </Link>
                <span className="block text-xs text-gray-500">{bizName.get(x.business_id) ?? 'עסק לא פעיל'}</span>
              </span>
            ),
          },
          { key: 'h', header: 'ההצעה', className: 'hidden lg:table-cell', render: (x) => x.headline },
          { key: 't', header: 'מתי מוצג', render: (x) => <span className="text-xs">{targeting(x)}</span> },
          {
            key: 's',
            header: 'סטטוס',
            render: (x) => (
              <span className="flex flex-col items-start gap-1">
                <StatusBadge label={CAMPAIGN_STATUS_LABELS[x.status]} tone={TONES[x.status]} />
                {x.status === 'active' && !isCampaignLive(x, now) && <span className="text-xs text-gray-500">מחוץ לתאריכים</span>}
              </span>
            ),
          },
          { key: 'd', header: 'תאריכים', className: 'hidden md:table-cell', render: (x) => `${formatDate(x.starts_at)} – ${formatDate(x.ends_at)}` },
          {
            key: 'a',
            header: <span className="sr-only">פעולות</span>,
            render: (x) => (
              <span className="flex flex-wrap gap-1.5">
                {x.status !== 'active' && <ActionButton action={setCampaignStatus.bind(null, x.id, 'active')}>הפעלה</ActionButton>}
                {x.status === 'active' && <ActionButton action={setCampaignStatus.bind(null, x.id, 'paused')}>השהיה</ActionButton>}
                {x.status !== 'ended' && <ActionButton action={setCampaignStatus.bind(null, x.id, 'ended')}>סיום</ActionButton>}
              </span>
            ),
          },
        ]}
      />

      <section id="campaign-form" className="scroll-mt-6">
        <Section
          title={c ? `עריכת קמפיין: ${c.name}` : 'קמפיין חדש'}
          aside={
            c ? (
              <Link href={PATH} className="text-sm text-primary hover:underline">
                ביטול עריכה
              </Link>
            ) : null
          }
        >
          <ActionForm action={saveCampaign} key={c ? `${c.id}:${c.updated_at}` : `new:${campaigns.length}`} resetOnSuccess={!c} className="space-y-5">
            {c && <input type="hidden" name="id" value={c.id} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">השותף</span>
                <Select name="business_id" defaultValue={c?.business_id ?? ''} required>
                  <option value="">בחרו עסק</option>
                  {options.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {tierBy.get(b.id) ? ` · ${tierBy.get(b.id)}` : ''}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">שם הקמפיין (פנימי)</span>
                <TextInput name="name" defaultValue={c?.name ?? ''} required placeholder="למשל: חלונות לבונים בשלב היתר, סתיו" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_8rem]">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">מתחיל</span>
                <TextInput type="date" name="starts_on" defaultValue={dates.starts_on} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">מסתיים (כולל)</span>
                <TextInput type="date" name="ends_on" defaultValue={dates.ends_on} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">סטטוס</span>
                <Select name="status" defaultValue={c?.status ?? 'draft'}>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CAMPAIGN_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">עדיפות</span>
                <TextInput type="number" name="priority" min={-100} max={100} defaultValue={c?.priority ?? 0} dir="ltr" />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">נושאים (ריק = כל הנושאים)</legend>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <Chk key={t.key} name="topics" value={t.key} label={t.title} checked={c?.topics.includes(t.key) ?? false} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">שלבים (ריק = כל השלבים)</legend>
              <div className="flex flex-wrap gap-2">
                {BUILD_STAGES.map((s) => (
                  <Chk key={s.id} name="stages" value={s.id} label={s.label} checked={c?.stages.includes(s.id) ?? false} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">אזורים (ריק = כל הארץ)</legend>
              <div className="flex flex-wrap gap-2">
                {MEMBER_REGIONS.map((r) => (
                  <Chk key={r.slug} name="region_slugs" value={r.slug} label={r.name} checked={c?.region_slugs.includes(r.slug) ?? false} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">איפה מוצג (ריק = בכל המקומות)</legend>
              <div className="flex flex-wrap gap-2">
                {OFFER_PLACEMENTS.map((p) => (
                  <Chk key={p} name="placements" value={p} label={PLACEMENT_LABELS[p]} checked={c?.placements.includes(p) ?? false} />
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">כותרת ההצעה</span>
                <TextInput name="headline" defaultValue={c?.headline ?? ''} required placeholder="למשל: 10% הנחה לבוני בונים בית" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">טקסט הכפתור</span>
                <TextInput name="cta_label" defaultValue={c?.cta_label ?? 'לפרטים'} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">תיאור קצר</span>
              <TextArea name="body" rows={2} defaultValue={c?.body ?? ''} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">לאן הכפתור מוביל (כתובת באתר)</span>
                <TextInput name="target_url" defaultValue={c?.target_url ?? ''} required dir="ltr" placeholder="/product/שם-ההטבה/" />
                <span className="mt-1 block text-xs text-gray-500">עמוד ההטבה בחנות או עמוד העסק בנבחרת.</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">תמונה (רשות)</span>
                <TextInput name="image_url" defaultValue={c?.image_url ?? ''} dir="ltr" placeholder="https://" />
              </label>
            </div>
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
              {c ? 'שמירת הקמפיין' : 'יצירת הקמפיין'}
            </button>
          </ActionForm>
        </Section>
      </section>
    </div>
  );
}
