'use client';

import { useState } from 'react';
import ActionForm, { SubmitButton, type FormAction } from '../ActionForm';
import FormField, { Checkbox, Section, TextArea, TextInput } from '../FormField';
import RichTextEditor from '../editor/RichTextEditor';
import type { ServicePlanFeature, ServicePlanPriceRow, ServicePlanRow } from '@/lib/db/types';
import { formatAgorotPlain } from '@/lib/admin/labels';

type Price = { id?: string; label: string; min_sqm: string; max_sqm: string; price: string; vat_included: boolean };
type Feature = { category: string; label: string; kind: 'yes' | 'no' | 'text'; text: string };

const cell = 'rounded border border-gray-300 px-2 py-1 text-sm w-full';

/** Service plan editor: card texts, prices (per size band), comparison table, online purchase toggle. */
export default function PlanForm({
  action,
  plan,
  prices,
  features,
  highlights,
}: {
  action: FormAction;
  plan: ServicePlanRow;
  prices: ServicePlanPriceRow[];
  features: ServicePlanFeature[];
  highlights: string[];
}) {
  const [rows, setRows] = useState<Price[]>(
    prices.map((p) => ({
      id: p.id,
      label: p.label ?? '',
      min_sqm: p.min_sqm?.toString() ?? '',
      max_sqm: p.max_sqm?.toString() ?? '',
      price: formatAgorotPlain(p.price_agorot),
      vat_included: p.vat_included,
    })),
  );
  const [feats, setFeats] = useState<Feature[]>(
    features.map((f) => ({
      category: f.category ?? '',
      label: f.label,
      kind: f.value === true ? 'yes' : f.value === false ? 'no' : 'text',
      text: typeof f.value === 'string' ? f.value : '',
    })),
  );
  const setPrice = (i: number, patch: Partial<Price>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const setFeat = (i: number, patch: Partial<Feature>) => setFeats((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const moveFeat = (i: number, d: -1 | 1) =>
    setFeats((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const featuresJson = JSON.stringify(
    feats.map((f) => ({ category: f.category, label: f.label, value: f.kind === 'yes' ? true : f.kind === 'no' ? false : f.text })),
  );

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <input type="hidden" name="id" value={plan.id} />
      <input type="hidden" name="prices" value={JSON.stringify(rows)} />
      <input type="hidden" name="features" value={featuresJson} />
      <div className="min-w-0 space-y-5">
        <Section title="כרטיס המסלול">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="שם" htmlFor="name" required>
              <TextInput id="name" name="name" defaultValue={plan.name} required />
            </FormField>
            <FormField label="תווית מסלול" htmlFor="track_label">
              <TextInput id="track_label" name="track_label" defaultValue={plan.track_label ?? ''} />
            </FormField>
            <FormField label="כותרת משנה" htmlFor="subtitle">
              <TextInput id="subtitle" name="subtitle" defaultValue={plan.subtitle ?? ''} />
            </FormField>
            <FormField label="טקסט הכפתור" htmlFor="cta_label">
              <TextInput id="cta_label" name="cta_label" defaultValue={plan.cta_label ?? ''} />
            </FormField>
          </div>
          <FormField label="נקודות בכרטיס" htmlFor="highlights" hint="נקודה בכל שורה.">
            <TextArea id="highlights" name="highlights" defaultValue={highlights.join('\n')} rows={5} />
          </FormField>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">תיאור</p>
            <RichTextEditor name="description_html" defaultValue={plan.description_html ?? ''} minHeight={160} label="תיאור המסלול" />
          </div>
        </Section>

        <Section
          title="מחירים"
          aside={
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-1 text-sm" onClick={() => setRows((r) => [...r, { label: '', min_sqm: '', max_sqm: '', price: '', vat_included: false }])}>
              + מחיר
            </button>
          }
        >
          <p className="text-xs text-gray-500">מחיר לכל טווח שטח (מ&quot;ר). ללא טווח = מחיר אחיד. המחירים באתר מוצגים לפני מע&quot;מ אלא אם סומן אחרת.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-gray-500">
                  <th className="p-1 text-start font-medium">תווית</th>
                  <th className="p-1 text-start font-medium">ממ&quot;ר</th>
                  <th className="p-1 text-start font-medium">עד מ&quot;ר</th>
                  <th className="p-1 text-start font-medium">מחיר (₪)</th>
                  <th className="p-1 text-start font-medium">כולל מע&quot;מ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `n${i}`}>
                    <td className="p-1"><input className={cell} value={r.label} onChange={(e) => setPrice(i, { label: e.target.value })} aria-label="תווית" /></td>
                    <td className="p-1"><input className={cell} value={r.min_sqm} onChange={(e) => setPrice(i, { min_sqm: e.target.value })} inputMode="numeric" aria-label="ממ״ר" /></td>
                    <td className="p-1"><input className={cell} value={r.max_sqm} onChange={(e) => setPrice(i, { max_sqm: e.target.value })} inputMode="numeric" aria-label="עד מ״ר" /></td>
                    <td className="p-1"><input className={cell} value={r.price} onChange={(e) => setPrice(i, { price: e.target.value })} inputMode="decimal" dir="ltr" aria-label="מחיר" required /></td>
                    <td className="p-1 text-center"><input type="checkbox" checked={r.vat_included} onChange={(e) => setPrice(i, { vat_included: e.target.checked })} aria-label="כולל מע״מ" /></td>
                    <td className="p-1"><button type="button" className="text-red-700" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>הסרה</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="טבלת השוואה"
          aside={
            <button type="button" className="rounded-lg border border-gray-300 px-3 py-1 text-sm" onClick={() => setFeats((r) => [...r, { category: r[r.length - 1]?.category ?? '', label: '', kind: 'yes', text: '' }])}>
              + שורה
            </button>
          }
        >
          <p className="text-xs text-gray-500">השורות של המסלול הזה בטבלת ההשוואה בעמוד המסלולים. ✓ כלול, ✗ לא כלול, או טקסט (למשל &quot;לבחירה&quot;).</p>
          <div className="space-y-1">
            {feats.map((f, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_7rem_auto] items-center gap-1 sm:grid-cols-[10rem_1fr_7rem_8rem_auto]">
                <input className={cell} value={f.category} onChange={(e) => setFeat(i, { category: e.target.value })} placeholder="קבוצה" aria-label="קבוצה" />
                <input className={cell} value={f.label} onChange={(e) => setFeat(i, { label: e.target.value })} placeholder="שירות" aria-label="שירות" />
                <select className={cell} value={f.kind} onChange={(e) => setFeat(i, { kind: e.target.value as Feature['kind'] })} aria-label="ערך">
                  <option value="yes">✓ כלול</option>
                  <option value="no">✗ לא כלול</option>
                  <option value="text">טקסט</option>
                </select>
                {f.kind === 'text' ? (
                  <input className={`${cell} hidden sm:block`} value={f.text} onChange={(e) => setFeat(i, { text: e.target.value })} aria-label="טקסט" />
                ) : (
                  <span className="hidden sm:block" />
                )}
                <span className="flex gap-1 text-xs">
                  <button type="button" onClick={() => moveFeat(i, -1)} aria-label="למעלה">▲</button>
                  <button type="button" onClick={() => moveFeat(i, 1)} aria-label="למטה">▼</button>
                  <button type="button" className="text-red-700" onClick={() => setFeats((r) => r.filter((_, k) => k !== i))}>✕</button>
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <aside className="space-y-5">
        <Section title="הגדרות">
          <Checkbox name="is_active" defaultChecked={plan.is_active} label="פעיל (מוצג באתר)" />
          <Checkbox name="is_featured" defaultChecked={plan.is_featured} label="מסלול מומלץ (מודגש)" />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Checkbox name="is_purchasable_online" defaultChecked={plan.is_purchasable_online} label="ניתן לרכישה ותשלום באתר" />
            <p className="mt-1 text-xs text-amber-900">כבוי: הכפתור מוביל לשיחת ייעוץ וטופס ליד, והקופה מסרבת לרכישת המסלול.</p>
          </div>
          <FormField label="תווית בטבלת ההשוואה" htmlFor="compare_label">
            <TextInput id="compare_label" name="compare_label" defaultValue={plan.compare_label ?? ''} />
          </FormField>
          <FormField label="סדר" htmlFor="sort_order">
            <TextInput id="sort_order" name="sort_order" type="number" defaultValue={plan.sort_order} />
          </FormField>
          <SubmitButton>שמירה</SubmitButton>
          <a href="/membership-tiers/" target="_blank" rel="noopener" className="ms-2 text-sm text-primary hover:underline">
            לעמוד המסלולים
          </a>
        </Section>
      </aside>
    </ActionForm>
  );
}
