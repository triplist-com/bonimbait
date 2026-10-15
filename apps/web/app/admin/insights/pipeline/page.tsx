import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calculator } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm from '@/components/admin/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { requireRole } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { resetExpectedValues, saveExpectedValues } from '@/lib/admin/actions/command';
import { loadExpectedValueTable } from '@/lib/command/load';
import { formatNis } from '@/lib/command/format';
import { expectedValueAgorot } from '@/lib/command/pipeline';
import type { ExpectedValue } from '@/lib/command/types';

export const metadata: Metadata = { title: 'הערך הצפוי לכל ליד' };

const inputCls =
  'h-10 w-28 rounded-xl border border-ink-200 bg-white px-3 text-start text-sm tabular-nums text-ink-900 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20';

function Rows({ rows }: { rows: ExpectedValue[] }) {
  return (
    <tbody className="divide-y divide-ink-100">
      {rows.map((r) => (
        <tr key={r.key}>
          <th scope="row" className="py-3 pe-3 text-start align-top font-normal">
            <span className="block font-semibold text-ink-900">{r.label}</span>
            {r.note && <span className="mt-0.5 block text-xs text-ink-500">{r.note}</span>}
          </th>
          <td className="py-3 pe-3 align-top">
            <label className="sr-only" htmlFor={`deal:${r.key}`}>
              שווי עסקה ל{r.label}, בשקלים
            </label>
            <span className="inline-flex items-center gap-1.5" dir="ltr">
              <span className="text-sm text-ink-500">₪</span>
              <input
                id={`deal:${r.key}`}
                name={`deal:${r.key}`}
                defaultValue={Math.round(r.dealValueAgorot / 100).toLocaleString('en-US')}
                inputMode="decimal"
                autoComplete="off"
                className={inputCls}
              />
            </span>
          </td>
          <td className="py-3 pe-3 align-top">
            <label className="sr-only" htmlFor={`rate:${r.key}`}>
              סיכוי סגירה ל{r.label}, באחוזים
            </label>
            <span className="inline-flex items-center gap-1.5" dir="ltr">
              <input
                id={`rate:${r.key}`}
                name={`rate:${r.key}`}
                defaultValue={String(Math.round(r.closeRate * 1000) / 10)}
                inputMode="decimal"
                autoComplete="off"
                className={`${inputCls} w-20`}
              />
              <span className="text-sm text-ink-500">%</span>
            </span>
          </td>
          <td className="py-3 pe-3 align-top text-sm font-bold text-ink-900">
            <bdi dir="ltr">{formatNis(expectedValueAgorot(r))}</bdi>
          </td>
          <td className="py-3 align-top">{r.isDefault ? <Badge tone="neutral" size="sm">ברירת מחדל</Badge> : <Badge tone="brand" size="sm">עודכן</Badge>}</td>
        </tr>
      ))}
    </tbody>
  );
}

function Head() {
  return (
    <thead className="text-xs text-ink-600">
      <tr className="border-b border-ink-200">
        <th scope="col" className="pb-2 pe-3 text-start font-semibold">סוג ליד או מסלול</th>
        <th scope="col" className="pb-2 pe-3 text-start font-semibold">שווי עסקה</th>
        <th scope="col" className="pb-2 pe-3 text-start font-semibold">סיכוי סגירה</th>
        <th scope="col" className="pb-2 pe-3 text-start font-semibold">ערך צפוי לליד</th>
        <th scope="col" className="pb-2 text-start font-semibold">
          <span className="sr-only">מצב</span>
        </th>
      </tr>
    </thead>
  );
}

/** The expected value per lead type and plan behind "צבר פוטנציאלי". Admins only. */
export default async function PipelineSettingsPage() {
  if (!isEnabled('commandCenter')) notFound();
  await requireRole('admin', '/admin/insights/pipeline/');
  const table = await loadExpectedValueTable();
  const plans = table.filter((r) => r.group === 'plan');
  const types = table.filter((r) => r.group === 'type');

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader title="הערך הצפוי לכל ליד" description="מה שווה ליד חדש, לפי הסוג שלו או המסלול שביקש. מכאן נבנה הצבר הפוטנציאלי בחדר הבקרה." back={{ href: '/admin/', label: 'חדר הבקרה' }} />

      <Card tone="sand" padding="md" className="text-sm text-ink-800">
        <p className="flex items-start gap-2">
          <Calculator className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
          <span>
            <strong>ערך צפוי = שווי עסקה × סיכוי סגירה.</strong> הצבר הפוטנציאלי הוא סכום הערך הצפוי של כל הלידים הפתוחים (חדש או נוצר קשר). ליד למסלול מסוים מתומחר לפי המסלול, כל השאר לפי סוג
            הפנייה. המספרים כאן הם הנחות התחלה: עדכנו אותם לפי מה שאתם רואים בפועל, והצבר יתעדכן מיד. מחירי המסלולים נלקחים מהאתר, לפני מע״מ.
          </span>
        </p>
      </Card>

      <ActionForm action={saveExpectedValues} successMessage="נשמר.">
        <Card as="section" padding="none" className="p-4 sm:p-5" aria-labelledby="ev-plans">
          <h2 id="ev-plans" className="mb-3 text-title-sm text-ink-900">
            מסלולי ליווי
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <Head />
              <Rows rows={plans} />
            </table>
          </div>
        </Card>
        <Card as="section" padding="none" className="mt-4 p-4 sm:p-5" aria-labelledby="ev-types">
          <h2 id="ev-types" className="mb-3 text-title-sm text-ink-900">
            סוגי פנייה
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <Head />
              <Rows rows={types} />
            </table>
          </div>
        </Card>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit">שמירה</Button>
          <span className="text-xs text-ink-500">ערך ששווה לברירת המחדל לא נשמר בנפרד, כך שעדכון מחיר מסלול באתר יעבור אליו.</span>
        </div>
      </ActionForm>

      <ActionForm action={resetExpectedValues} successMessage="הערכים חזרו לברירת המחדל.">
        <Button type="submit" variant="ghost" size="sm">
          החזרת כל הערכים לברירת המחדל
        </Button>
      </ActionForm>
    </div>
  );
}
