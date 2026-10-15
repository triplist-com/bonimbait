import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import { param } from '@/components/admin/AdminPagination';
import ActionForm from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Checkbox, Section, TextArea, TextInput } from '@/components/admin/FormField';
import ActionButton from '@/components/revenue/admin/ActionButton';
import RoutingTargetFields from '@/components/revenue/admin/RoutingTargetFields';
import { requireRole } from '@/lib/auth/session';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { isEnabled } from '@/lib/flags';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { BUILD_STAGES } from '@/lib/stages';
import { deleteRoutingRule, saveRoutingRule, setRoutingRuleActive } from '@/lib/revenue/actions/routing';
import { revenueUserDb } from '@/lib/revenue/db';
import { DEFAULT_RULE_NAME, orderRules } from '@/lib/revenue/routing';
import { describeConditions, describeTarget, type RuleNames } from '@/lib/revenue/routing-form';
import type { LeadRoutingRuleRow } from '@/lib/revenue/types';

export const metadata = { title: 'כללי ניתוב' };

const PATH = '/admin/lead-routing/';

function Chk({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-sm text-gray-800 ring-1 ring-inset ring-gray-200 has-[:checked]:bg-primary-50 has-[:checked]:ring-primary-200">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="size-4 rounded border-gray-300 text-primary" />
      {label}
    </label>
  );
}

/**
 * Lead routing rules (admins): the first active rule by priority decides where
 * a lead goes; no match keeps today's routing (lib/revenue/routing.ts).
 */
export default async function LeadRoutingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!isEnabled('revenue')) notFound();
  await requireRole('admin', PATH);
  const db = revenueUserDb();
  const [rulesRes, specialtiesRes, businessesRes, campaignsRes] = await Promise.all([
    db.from('lead_routing_rules').select('*'),
    db.from('specialties').select('slug, name, sort_order').order('sort_order'),
    db.from('businesses').select('id, name').eq('status', 'published').order('name'),
    db.from('partner_campaigns').select('id, name, status, business_id').order('created_at', { ascending: false }),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  const rules = orderRules((rulesRes.data ?? []) as LeadRoutingRuleRow[]);
  const specialties = specialtiesRes.data ?? [];
  const businesses = businessesRes.data ?? [];
  const campaigns = campaignsRes.data ?? [];
  const n: RuleNames = {
    specialties: new Map(specialties.map((s) => [s.slug, s.name])),
    businesses: new Map(businesses.map((b) => [b.id, b.name])),
    campaigns: new Map(campaigns.map((c) => [c.id, c.name])),
  };

  const editId = param(searchParams.edit);
  const editing = editId ? rules.find((r) => r.id === editId) ?? null : null;
  const r = editing;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="כללי ניתוב לידים"
        description="הכלל הראשון שמתאים, לפי סדר העדיפות, קובע לאן הליד נשלח. ליד שלא מתאים לאף כלל ממשיך כמו היום."
      />

      <Section title={`הכללים (${rules.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th scope="col" className="px-2 py-2 text-start font-medium">עדיפות</th>
                <th scope="col" className="px-2 py-2 text-start font-medium">כלל</th>
                <th scope="col" className="px-2 py-2 text-start font-medium">מתי</th>
                <th scope="col" className="px-2 py-2 text-start font-medium">לאן</th>
                <th scope="col" className="px-2 py-2 text-start font-medium">מצב</th>
                <th scope="col" className="relative px-2 py-2 text-start font-medium"><span className="sr-only">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className={rule.is_active ? 'border-b border-gray-100' : 'border-b border-gray-100 text-gray-500'}>
                  <td className="num px-2 py-2.5">{rule.priority}</td>
                  <td className="px-2 py-2.5 font-medium text-gray-900">
                    {rule.name}
                    {rule.note && <span className="block text-xs font-normal text-gray-500">{rule.note}</span>}
                  </td>
                  <td className="px-2 py-2.5">{describeConditions(rule, n)}</td>
                  <td className="px-2 py-2.5">{describeTarget(rule, n)}</td>
                  <td className="px-2 py-2.5">
                    <ActionButton action={setRoutingRuleActive.bind(null, rule.id, !rule.is_active)} pressed={rule.is_active} title="הפעלה או השבתה">
                      {rule.is_active ? 'פעיל' : 'מושבת'}
                    </ActionButton>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <Link href={`${PATH}?edit=${rule.id}`} className="me-3 text-primary hover:underline">
                      עריכה
                    </Link>
                    <ConfirmDialog
                      trigger="מחיקה"
                      triggerClassName="text-danger-700 hover:underline"
                      title={`למחוק את הכלל "${rule.name}"?`}
                      body="לידים חדשים ינותבו לפי שאר הכללים או לפי ברירת המחדל."
                      confirmLabel="מחיקה"
                      onConfirm={deleteRoutingRule.bind(null, rule.id)}
                      redirectTo={PATH}
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 text-gray-600">
                <td className="px-2 py-2.5">אחרון</td>
                <td className="px-2 py-2.5 font-medium">{DEFAULT_RULE_NAME}</td>
                <td className="px-2 py-2.5">כל ליד שלא התאים לכלל</td>
                <td className="px-2 py-2.5">info@ לעסקים בניתוב &quot;אתר&quot;, ישירות לעסק לשאר</td>
                <td className="px-2 py-2.5">תמיד</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <section id="rule-form" className="scroll-mt-6">
        <Section
          title={editing ? `עריכת הכלל: ${editing.name}` : 'כלל חדש'}
          aside={
            editing ? (
              <Link href={PATH} className="text-sm text-primary hover:underline">
                ביטול עריכה
              </Link>
            ) : null
          }
        >
          {/* Keyed by the rule list, so a saved form remounts fresh (the target picker holds state). */}
          <ActionForm
            action={saveRoutingRule}
            key={editing ? `${editing.id}:${editing.updated_at}` : `new:${rules.length}`}
            className="space-y-5"
            resetOnSuccess={!editing}
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">שם הכלל</span>
                <TextInput name="name" required defaultValue={r?.name ?? ''} placeholder="למשל: לידים חמים מהשרון לצוות הייעוץ" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">עדיפות</span>
                <TextInput name="priority" type="number" min={0} max={10000} defaultValue={r?.priority ?? 100} dir="ltr" />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">סוגי פנייה (ריק = כל הסוגים)</legend>
              <div className="flex flex-wrap gap-2">
                {LEAD_TYPES.map((t) => (
                  <Chk key={t} name="lead_types" value={t} label={LEAD_TYPE_LABELS[t]} checked={r?.lead_types.includes(t) ?? false} />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">שלב (ריק = כל השלבים)</legend>
              <div className="flex flex-wrap gap-2">
                {BUILD_STAGES.map((s) => (
                  <Chk key={s.id} name="stages" value={s.id} label={s.label} checked={r?.stages.includes(s.id) ?? false} />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">אזור (ריק = כל הארץ)</legend>
              <div className="flex flex-wrap gap-2">
                {MEMBER_REGIONS.map((reg) => (
                  <Chk key={reg.slug} name="region_slugs" value={reg.slug} label={reg.name} checked={r?.region_slugs.includes(reg.slug) ?? false} />
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">תחום (ריק = כל התחומים)</span>
                <select
                  name="specialty_slugs"
                  multiple
                  size={6}
                  defaultValue={r?.specialty_slugs ?? []}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                >
                  {specialties.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-gray-500">התחום של העסק, של בקשת הצעת המחיר או של השאלות בתיק. Ctrl/Cmd לבחירה מרובה.</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">ציון מינימלי</span>
                <TextInput name="min_score" type="number" min={0} max={100} defaultValue={r?.min_score ?? ''} dir="ltr" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">ציון מקסימלי</span>
                <TextInput name="max_score" type="number" min={0} max={100} defaultValue={r?.max_score ?? ''} dir="ltr" />
              </label>
            </div>

            <RoutingTargetFields
              defaultTarget={r?.target ?? 'owner_inbox'}
              defaultBusinessId={r?.target_business_id}
              defaultCampaignId={r?.target_campaign_id}
              businesses={businesses}
              campaigns={campaigns.map((c) => ({ id: c.id, name: `${c.name}${c.status === 'active' ? '' : ' (לא פעיל)'}` }))}
            />

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">הערה פנימית</span>
              <TextArea name="note" rows={2} defaultValue={r?.note ?? ''} />
            </label>

            <div className="flex flex-wrap items-center gap-4">
              <Checkbox name="is_active" defaultChecked={r ? r.is_active : true} label="פעיל" />
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
                {editing ? 'שמירת הכלל' : 'הוספת הכלל'}
              </button>
            </div>
          </ActionForm>
        </Section>
      </section>
    </div>
  );
}
