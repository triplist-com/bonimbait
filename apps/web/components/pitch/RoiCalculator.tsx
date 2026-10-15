'use client';

import { useId, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  BASE_CASE,
  ROI_FIELDS,
  computeRoi,
  formatCount,
  formatFieldValue,
  formatNisRounded,
  type PlanKey,
  type PlanPricesNis,
  type RoiField,
  type RoiFieldDef,
  type RoiInputs,
} from '@/lib/pitch/roi';

const GROUPS: Array<{ id: RoiFieldDef['group']; title: string }> = [
  { id: 'traffic', title: 'התנועה שלכם' },
  { id: 'funnel', title: 'המשפך' },
  { id: 'mix', title: 'תמהיל התוכניות' },
  { id: 'partners', title: 'שותפים' },
];

function Slider({ def, value, onChange }: { def: RoiFieldDef; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const shown = formatFieldValue(def, value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink-900">
          {def.label}
        </label>
        <output htmlFor={id} className="num text-base font-extrabold text-primary-700">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        aria-describedby={hintId}
        aria-valuetext={shown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full cursor-pointer accent-primary-600"
      />
      <div className="-mt-1 flex justify-between text-xs text-ink-500" aria-hidden="true">
        <span className="num">{formatFieldValue(def, def.min)}</span>
        <span className="num">{formatFieldValue(def, def.max)}</span>
      </div>
      <p id={hintId} className="mt-0.5 text-xs text-ink-500">
        {def.hint}
      </p>
    </div>
  );
}

export interface RoiCalculatorProps {
  prices: PlanPricesNis;
  planNames: Record<PlanKey, string>;
}

/** Section 5: "your numbers": the owner's extra consults, plans and shekels a year. Never our price. */
export default function RoiCalculator({ prices, planNames }: RoiCalculatorProps) {
  const [inputs, setInputs] = useState<RoiInputs>({ ...BASE_CASE });
  const result = useMemo(() => computeRoi(inputs, prices), [inputs, prices]);
  const changed = (Object.keys(BASE_CASE) as RoiField[]).some((k) => inputs[k] !== BASE_CASE[k]);
  const set = (key: RoiField) => (value: number) => setInputs((prev) => ({ ...prev, [key]: value }));
  const budgetMix = Math.round(result.mix.budget * 100);

  const funnel = [
    { label: 'בונים מזדהים', value: result.identifiedPerYear },
    { label: 'מתאימים לליווי', value: result.qualifiedPerYear },
    { label: 'פגישות ייעוץ', value: result.consultsPerYear },
    { label: 'תוכניות', value: result.plans.total },
  ];
  const plans: Array<{ key: PlanKey; count: number; revenue: number }> = [
    { key: 'budget', count: result.plans.budget, revenue: result.planRevenue.budget },
    { key: 'plus', count: result.plans.plus, revenue: result.planRevenue.plus },
    { key: 'turnkey', count: result.plans.turnkey, revenue: result.planRevenue.turnkey },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      {/* Inputs */}
      <div className="lg:col-span-7">
        <div className="space-y-6 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
          {GROUPS.map((group) => (
            <fieldset key={group.id} className="space-y-5">
              <legend className="mb-1 text-xs font-bold text-primary-700">{group.title}</legend>
              {ROI_FIELDS.filter((f) => f.group === group.id).map((def) => (
                <Slider key={def.key} def={def} value={inputs[def.key]} onChange={set(def.key)} />
              ))}
              {group.id === 'mix' && (
                <p className="text-sm text-ink-600">
                  {planNames.budget}: <span className="num font-bold text-ink-900">{budgetMix}%</span> מהסגירות
                </p>
              )}
            </fieldset>
          ))}
          {changed && (
            <Button variant="ghost" size="sm" onClick={() => setInputs({ ...BASE_CASE })} iconStart={<RotateCcw aria-hidden="true" />}>
              חזרה למקרה הבסיס
            </Button>
          )}
        </div>

        {/* Phones: the bottom line stays in view while the sliders move */}
        <div className="sticky bottom-3 z-10 mt-4 lg:hidden" aria-hidden="true">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-dialog">
            <span className="text-sm text-white/75">להמחשה, בשנה</span>
            <span className="text-lg font-extrabold">
              <span dir="ltr" className="[unicode-bidi:isolate]">
                {formatNisRounded(result.totalRevenue)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="lg:col-span-5">
        <div className="rounded-3xl bg-ink-950 p-6 text-white shadow-dialog sm:p-7 lg:sticky lg:top-24">
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {`${formatNisRounded(result.totalRevenue)} בשנה, ${formatCount(result.consultsPerYear)} פגישות ייעוץ נוספות`}
          </p>
          <p className="text-sm font-bold text-primary-300">{changed ? 'לפי המספרים שהזנתם' : 'מקרה בסיס, הנחות לדוגמה'}</p>
          <p className="mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl">
            <span dir="ltr" className="[unicode-bidi:isolate]">
              {formatNisRounded(result.totalRevenue)}
            </span>
          </p>
          <p className="mt-1 text-sm text-white/75">הכנסה נוספת בשנה, להמחשה: תוכניות ליווי ושותפים</p>

          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {funnel.map((step, i) => (
              <li key={step.label} className={cn('rounded-2xl px-3 py-3', i === 2 ? 'bg-primary-600' : 'bg-white/[0.07]')}>
                <p className="text-xl font-extrabold">
                  <span dir="ltr" className="[unicode-bidi:isolate]">
                    {formatCount(step.value)}
                  </span>
                </p>
                <p className={cn('text-xs', i === 2 ? 'text-white' : 'text-white/70')}>{step.label}</p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-white/60">
            בשנה. כ-<span className="num">{formatCount(result.consultsPerWeek)}</span> פגישות ייעוץ נוספות בשבוע.
          </p>

          <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {plans.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-bold">{planNames[p.key]}</span>{' '}
                  <span className="text-white/60">
                    × <span className="num">{formatCount(p.count)}</span>
                  </span>
                </span>
                <span dir="ltr" className="font-semibold [unicode-bidi:isolate]">
                  {formatNisRounded(p.revenue)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-bold">תוספת משותפים</span>
              <span dir="ltr" className="font-semibold [unicode-bidi:isolate]">
                {formatNisRounded(result.partnerRevenue)}
              </span>
            </li>
          </ul>

          <p className="mt-5 text-xs leading-5 text-white/60">
            *החישוב הוא המחשה בלבד לפי ההנחות שבמחשבון, ואינו התחייבות לכמות פניות, פגישות, עסקאות או הכנסות. המחירים הם של התוכניות שלכם,
            לפני מע״מ; {planNames.turnkey} לפי ממוצע שני הגדלים. החליפו כל הנחה במספר האמיתי שלכם.
          </p>
        </div>
      </div>
    </div>
  );
}
