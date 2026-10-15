import { nisShortParts } from '@/lib/project-file/format';

/**
 * Amounts inside Hebrew text. Only the digits are LTR-isolated (`.num`), so
 * the unit stays on the reading side: "220 מ״ר", "2.4–2.8 מיליון ₪".
 * Server-safe.
 */

export function Num({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}

/** 2600000 -> 2.6 מיליון ₪ */
export function NisShort({ value }: { value: number }) {
  const p = nisShortParts(value);
  return (
    <>
      <Num>{p.value}</Num>
      {p.unit ? ` ${p.unit}` : ''} ₪
    </>
  );
}

/** [2400000, 2800000] -> 2.4–2.8 מיליון ₪ */
export function NisRange({ range }: { range: readonly [number, number] }) {
  const [lo, hi] = range;
  if (lo === hi) return <NisShort value={lo} />;
  const a = nisShortParts(lo);
  const b = nisShortParts(hi);
  if (a.unit === b.unit) {
    return (
      <>
        <Num>
          {a.value}–{b.value}
        </Num>
        {b.unit ? ` ${b.unit}` : ''} ₪
      </>
    );
  }
  return (
    <>
      <Num>{a.value}</Num>
      {a.unit ? ` ${a.unit}` : ''} – <Num>{b.value}</Num>
      {b.unit ? ` ${b.unit}` : ''} ₪
    </>
  );
}

/** 220 מ״ר */
export function Sqm({ value }: { value: number }) {
  return (
    <>
      <Num>{value}</Num> מ״ר
    </>
  );
}

/** Whole shekels with separators: 6,900 ₪ (he-IL currency style, already bidi-safe). */
export function Nis({ value }: { value: number }) {
  return <>{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.round(value))}</>;
}
