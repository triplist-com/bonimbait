'use client';

/**
 * The planner price book editor (/admin/planner/). Edits a copy of the book in
 * shekels and percents, shows a live preview of three example houses, and saves
 * the whole book as a new version (lib/admin/actions/planner.ts).
 */
import { useMemo, useState } from 'react';
import ActionForm, { SubmitButton, type FormAction } from '../ActionForm';
import FormField, { Section, Select, TextArea, TextInput } from '../FormField';
import { BUILD_STAGES } from '@/lib/stages';
import { EXTRAS, FINISH_LEVELS, PLANNER_REGIONS } from '@/lib/planner/content';
import { estimateBudget } from '@/lib/planner/engine';
import { rangeText } from '@/lib/planner/format';
import { EXTRA_IDS, FINISH_LEVEL_IDS, type PlannerInput, type PriceBook, type PriceBookSource, type StageId } from '@/lib/planner/types';

export interface PriceBookHistoryRow {
  id: string;
  validAsOf: string;
  createdAt: string;
  editor: string | null;
  note: string | null;
  book: PriceBook | null;
}

const EXAMPLES: Array<{ label: string; input: PlannerInput }> = [
  { label: '200 מ״ר, 2 קומות, מרכז, סטנדרטי-טוב', input: { sizeM2: 200, floors: 2, regionSlug: 'center', finishLevel: 'standard', extras: [] } },
  { label: '150 מ״ר, קומה אחת, דרום, בסיסי', input: { sizeM2: 150, floors: 1, regionSlug: 'south', finishLevel: 'basic', extras: [] } },
  { label: '250 מ״ר, 2 קומות, שרון, יוקרה, מרתף ובריכה', input: { sizeM2: 250, floors: 2, regionSlug: 'sharon', finishLevel: 'luxury', extras: ['basement', 'pool'] } },
];

const num = 'w-28';
const toShekels = (agorot: number) => Math.round(agorot / 100);
const toAgorot = (value: string) => Math.max(0, Math.round(Number(value || 0) * 100));
const n = (value: string) => (value === '' ? 0 : Number(value));

function clone(book: PriceBook): PriceBook {
  return JSON.parse(JSON.stringify(book)) as PriceBook;
}

export default function PriceBookForm({ action, book: initial, history }: { action: FormAction; book: PriceBook; history: PriceBookHistoryRow[] }) {
  const [book, setBook] = useState<PriceBook>(() => clone(initial));
  const [restored, setRestored] = useState<string | null>(null);
  const update = (fn: (b: PriceBook) => void) =>
    setBook((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });

  const splitSum = BUILD_STAGES.reduce((a, s) => a + (book.stageSplitPct[s.id] ?? 0), 0);
  const previews = useMemo(() => {
    try {
      return EXAMPLES.map((e) => ({ label: e.label, estimate: estimateBudget(e.input, book) }));
    } catch {
      return [];
    }
  }, [book]);

  const setSource = (i: number, patch: Partial<PriceBookSource>) =>
    update((b) => {
      b.sources[i] = { ...b.sources[i], ...patch };
    });

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" successMessage="המחירון נשמר.">
      <input type="hidden" name="book" value={JSON.stringify(book)} />
      <div className="min-w-0 space-y-5">
        {restored && (
          <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700" role="status">
            נטענה גרסה קודמת ({restored}). שמרו כדי להחזיר אותה לאוויר.
          </p>
        )}

        <Section title="תוקף והצגה">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="נכון לתאריך" htmlFor="validAsOf" hint="יוצג כ״נכון ל-…״ בכל תוצאה" required>
              <TextInput id="validAsOf" type="date" value={book.validAsOf} onChange={(e) => update((b) => (b.validAsOf = e.target.value))} required />
            </FormField>
            <FormField label="טווח (±%)" htmlFor="rangePct" hint="ההערכה מוצגת כטווח סביב הממוצע">
              <TextInput id="rangePct" type="number" min={1} max={50} step={1} value={book.rangePct} onChange={(e) => update((b) => (b.rangePct = n(e.target.value)))} className={num} />
            </FormField>
            <FormField label="מע״מ (%)" htmlFor="vatRatePct" hint="כל המחירים במחירון לפני מע״מ">
              <TextInput id="vatRatePct" type="number" min={0} max={30} step={1} value={book.vatRatePct} onChange={(e) => update((b) => (b.vatRatePct = n(e.target.value)))} className={num} />
            </FormField>
          </div>
        </Section>

        <Section title="מחיר למ״ר לפי רמת גמר (תכנון ובנייה, לפני מע״מ)">
          <div className="space-y-4">
            {FINISH_LEVEL_IDS.map((id) => (
              <div key={id} className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr] sm:items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{FINISH_LEVELS[id].label}</p>
                  <p className="text-xs text-gray-500">{FINISH_LEVELS[id].description}</p>
                </div>
                <FormField label="₪ למ״ר" htmlFor={`fl-${id}`}>
                  <TextInput
                    id={`fl-${id}`}
                    type="number"
                    min={1000}
                    step={100}
                    value={toShekels(book.finishLevels[id].perM2Agorot)}
                    onChange={(e) => update((b) => (b.finishLevels[id].perM2Agorot = toAgorot(e.target.value)))}
                  />
                </FormField>
                <FormField label="מקור והערה" htmlFor={`fl-note-${id}`}>
                  <TextArea id={`fl-note-${id}`} rows={2} value={book.finishLevels[id].note} onChange={(e) => update((b) => (b.finishLevels[id].note = e.target.value))} />
                </FormField>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="חלוקה ל-7 השלבים ולוח זמנים"
          aside={
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${splitSum === 100 ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
              סך הכול {splitSum}%{splitSum === 100 ? '' : ' (צריך 100%)'}
            </span>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-gray-500">
                <th className="py-1 text-start font-medium">שלב</th>
                <th className="py-1 text-start font-medium">% מהתכנון והבנייה</th>
                <th className="py-1 text-start font-medium">חודשים (מ-עד)</th>
              </tr>
            </thead>
            <tbody>
              {BUILD_STAGES.map((s) => {
                const months = book.timelineMonths[s.id as StageId];
                return (
                  <tr key={s.id} className="border-t border-gray-100">
                    <th scope="row" className="py-2 text-start font-medium text-gray-900">
                      {s.order}. {s.label}
                    </th>
                    <td className="py-2">
                      <TextInput
                        aria-label={`אחוז לשלב ${s.label}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={book.stageSplitPct[s.id]}
                        onChange={(e) => update((b) => (b.stageSplitPct[s.id] = n(e.target.value)))}
                        className="w-20"
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <TextInput aria-label={`חודשים מינימום, ${s.label}`} type="number" min={0} max={60} value={months[0]} onChange={(e) => update((b) => (b.timelineMonths[s.id][0] = n(e.target.value)))} className="w-16" />
                        <span aria-hidden="true">–</span>
                        <TextInput aria-label={`חודשים מקסימום, ${s.label}`} type="number" min={0} max={60} value={months[1]} onChange={(e) => update((b) => (b.timelineMonths[s.id][1] = n(e.target.value)))} className="w-16" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <FormField label="מקור החלוקה" htmlFor="note-split">
            <TextArea id="note-split" rows={2} value={book.notes.split} onChange={(e) => update((b) => (b.notes.split = e.target.value))} />
          </FormField>
          <FormField label="מקור לוח הזמנים" htmlFor="note-timeline">
            <TextArea id="note-timeline" rows={2} value={book.notes.timeline} onChange={(e) => update((b) => (b.notes.timeline = e.target.value))} />
          </FormField>
        </Section>

        <Section title="תוספות">
          <div className="space-y-4">
            {EXTRA_IDS.map((id) => (
              <div key={id} className="grid gap-3 rounded-lg border border-gray-100 p-3 sm:grid-cols-[10rem_8rem_9rem_1fr] sm:items-start">
                <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    checked={book.extras[id].enabled}
                    onChange={(e) => update((b) => (b.extras[id].enabled = e.target.checked))}
                    className="h-4 w-4 rounded border-gray-300 text-primary"
                  />
                  {EXTRAS[id].label}
                </label>
                <FormField label="₪ (לפני מע״מ)" htmlFor={`ex-${id}`}>
                  <TextInput id={`ex-${id}`} type="number" min={0} step={1000} value={toShekels(book.extras[id].amountAgorot)} onChange={(e) => update((b) => (b.extras[id].amountAgorot = toAgorot(e.target.value)))} />
                </FormField>
                <FormField label="שלב" htmlFor={`ex-stage-${id}`}>
                  <Select id={`ex-stage-${id}`} value={book.extras[id].stage} onChange={(e) => update((b) => (b.extras[id].stage = e.target.value as StageId))}>
                    {BUILD_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="מקור והערה" htmlFor={`ex-note-${id}`}>
                  <TextArea id={`ex-note-${id}`} rows={2} value={book.extras[id].note} onChange={(e) => update((b) => (b.extras[id].note = e.target.value))} />
                </FormField>
              </div>
            ))}
          </div>
        </Section>

        <Section title="מקדמים: אזור וקומות">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {PLANNER_REGIONS.map((r) => (
              <div key={r.slug} className="grid grid-cols-[1fr_5.5rem] items-center gap-3">
                <label htmlFor={`rf-${r.slug}`} className="text-sm text-gray-800">
                  {r.name}
                </label>
                <TextInput
                  id={`rf-${r.slug}`}
                  type="number"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={book.regionFactors[r.slug] ?? 1}
                  onChange={(e) => update((b) => (b.regionFactors[r.slug] = n(e.target.value)))}
                />
              </div>
            ))}
          </div>
          <FormField label="הערה לאזור הדרום (מוצגת בתוצאה)" htmlFor="rn-south">
            <TextInput id="rn-south" value={book.regionNotes.south ?? ''} onChange={(e) => update((b) => (b.regionNotes.south = e.target.value))} />
          </FormField>
          <FormField label="מקור המקדמים האזוריים" htmlFor="note-regions">
            <TextArea id="note-regions" rows={2} value={book.notes.regions} onChange={(e) => update((b) => (b.notes.regions = e.target.value))} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['1', '2', '3'] as const).map((f) => (
              <FormField key={f} label={f === '1' ? 'קומה אחת (מקדם שלד)' : f === '2' ? 'שתי קומות' : 'שלוש קומות ומעלה'} htmlFor={`ff-${f}`}>
                <TextInput id={`ff-${f}`} type="number" min={0.5} max={2} step={0.01} value={book.floorShellFactors[f]} onChange={(e) => update((b) => (b.floorShellFactors[f] = n(e.target.value)))} />
              </FormField>
            ))}
          </div>
          <FormField label="מקור מקדם הקומות" htmlFor="note-floors">
            <TextArea id="note-floors" rows={2} value={book.notes.floors} onChange={(e) => update((b) => (b.notes.floors = e.target.value))} />
          </FormField>
        </Section>

        <Section title="מחוץ לסכום: אכלוס ובלת״מים">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="אכלוס, ₪ למ״ר (מ-)" htmlFor="mi-min">
              <TextInput id="mi-min" type="number" min={0} step={50} value={toShekels(book.movingInPerM2Agorot.min)} onChange={(e) => update((b) => (b.movingInPerM2Agorot.min = toAgorot(e.target.value)))} />
            </FormField>
            <FormField label="אכלוס, ₪ למ״ר (עד)" htmlFor="mi-max">
              <TextInput id="mi-max" type="number" min={0} step={50} value={toShekels(book.movingInPerM2Agorot.max)} onChange={(e) => update((b) => (b.movingInPerM2Agorot.max = toAgorot(e.target.value)))} />
            </FormField>
          </div>
          <FormField label="מקור האכלוס" htmlFor="mi-note">
            <TextArea id="mi-note" rows={2} value={book.movingInPerM2Agorot.note} onChange={(e) => update((b) => (b.movingInPerM2Agorot.note = e.target.value))} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-4">
            {(['withBudget', 'withoutBudget'] as const).map((k) =>
              ([0, 1] as const).map((i) => (
                <FormField key={`${k}-${i}`} label={`בלת״מים ${k === 'withBudget' ? 'עם תקציב' : 'בלי תקציב'} (${i === 0 ? 'מ-' : 'עד'} %)`} htmlFor={`ct-${k}-${i}`}>
                  <TextInput id={`ct-${k}-${i}`} type="number" min={0} max={100} value={book.contingencyPct[k][i]} onChange={(e) => update((b) => (b.contingencyPct[k][i] = n(e.target.value)))} />
                </FormField>
              )),
            )}
          </div>
          <FormField label="מקור הבלת״מים" htmlFor="ct-note">
            <TextArea id="ct-note" rows={2} value={book.contingencyPct.note} onChange={(e) => update((b) => (b.contingencyPct.note = e.target.value))} />
          </FormField>
        </Section>

        <Section
          title="מקורות (מוצגים בכל תוצאה ובדוח)"
          aside={
            <button
              type="button"
              onClick={() =>
                update((b) => {
                  b.sources.push({ id: `source-${b.sources.length + 1}`, kind: 'article', title: '', date: b.validAsOf, href: '/' });
                })
              }
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              הוספת מקור
            </button>
          }
        >
          <div className="space-y-4">
            {book.sources.map((s, i) => (
              <fieldset key={i} className="grid gap-3 rounded-lg border border-gray-100 p-3 sm:grid-cols-6">
                <legend className="sr-only">מקור {i + 1}</legend>
                <FormField label="כותרת" htmlFor={`src-title-${i}`} className="sm:col-span-4">
                  <TextInput id={`src-title-${i}`} value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} />
                </FormField>
                <FormField label="סוג" htmlFor={`src-kind-${i}`}>
                  <Select id={`src-kind-${i}`} value={s.kind} onChange={(e) => setSource(i, { kind: e.target.value as PriceBookSource['kind'] })}>
                    <option value="article">מאמר</option>
                    <option value="podcast">פודקאסט</option>
                  </Select>
                </FormField>
                <FormField label="תאריך" htmlFor={`src-date-${i}`}>
                  <TextInput id={`src-date-${i}`} type="date" value={s.date} onChange={(e) => setSource(i, { date: e.target.value })} />
                </FormField>
                <FormField label="קישור" htmlFor={`src-href-${i}`} className="sm:col-span-3">
                  <TextInput id={`src-href-${i}`} dir="ltr" value={s.href} onChange={(e) => setSource(i, { href: e.target.value })} />
                </FormField>
                <FormField label="ציטוט קצר" htmlFor={`src-quote-${i}`} className="sm:col-span-3">
                  <TextInput id={`src-quote-${i}`} value={s.quote ?? ''} onChange={(e) => setSource(i, { quote: e.target.value || undefined })} />
                </FormField>
                <div className="flex items-center justify-between gap-3 sm:col-span-6">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={Boolean(s.primary)} onChange={(e) => setSource(i, { primary: e.target.checked || undefined })} className="h-4 w-4 rounded border-gray-300" />
                    מקור ראשי (מוצג בתוצאה)
                  </label>
                  <button
                    type="button"
                    onClick={() => update((b) => void b.sources.splice(i, 1))}
                    className="text-sm text-danger-700 hover:underline"
                  >
                    הסרה
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
        </Section>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
        <Section title="תצוגה מקדימה">
          <ul className="space-y-3">
            {previews.map((p) => (
              <li key={p.label} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-600">{p.label}</p>
                <p className="mt-0.5 text-base font-bold text-gray-900">{rangeText(p.estimate.total)}</p>
                <p className="text-xs text-gray-600">
                  שלד: {rangeText(p.estimate.stages.find((s) => s.id === 'frame')!)} · {p.estimate.perM2.min.toLocaleString('he-IL')}–{p.estimate.perM2.max.toLocaleString('he-IL')} ₪ למ״ר
                </p>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="שמירה">
          <FormField label="מה השתנה?" htmlFor="note" hint="נשמר בהיסטוריה">
            <TextInput id="note" name="note" maxLength={500} placeholder="למשל: עדכון מחירי שלד לפי הפרק החדש" />
          </FormField>
          <SubmitButton className="w-full">שמירת גרסה חדשה</SubmitButton>
          <p className="text-xs text-gray-500">כל שמירה יוצרת גרסה. המחשבון, התרחישים והדוח מתעדכנים מיד.</p>
        </Section>
        <Section title="היסטוריית גרסאות">
          {history.length === 0 ? (
            <p className="text-sm text-gray-600">עוד אין גרסאות שמורות. המחשבון משתמש במחירון הפתיחה.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={h.id} className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {new Date(h.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' })}
                      {i === 0 && <span className="ms-2 rounded bg-success-50 px-1.5 py-0.5 text-xs text-success-700">פעילה</span>}
                    </p>
                    <p className="truncate text-xs text-gray-600">
                      נכון ל-{h.validAsOf} · {h.editor ?? 'מחירון פתיחה'}
                    </p>
                    {h.note && <p className="text-xs text-gray-700">{h.note}</p>}
                  </div>
                  {i > 0 && h.book && (
                    <button
                      type="button"
                      onClick={() => {
                        setBook(clone(h.book!));
                        setRestored(new Date(h.createdAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }));
                      }}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      טעינה
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>
      </aside>
    </ActionForm>
  );
}
