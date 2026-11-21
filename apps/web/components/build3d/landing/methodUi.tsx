'use client';

/**
 * Shared construction-method UI bits (picker, analysis, viewer switcher, finale comparison).
 * Light on purpose: no three.js, no step engine (the landing imports it).
 *
 * Numbers: months and cost come from METHOD_TOTALS (this house, summed from the steps),
 * computed at render time. METHODS_INFO is only used for the qualitative copy.
 */
import { useEffect, useRef, useState } from 'react';
import { BrickWall, Columns3, Layers2, PanelsTopLeft, TreePine, type LucideIcon } from 'lucide-react';
import { METHOD_TOTALS } from '@/lib/build3d/content/totals';
import type { MethodInfo } from '@/lib/build3d/content/methods';
import type { MethodId } from '@/lib/build3d/methods';
import { fmtMonths } from '../viewer/format';

/** "Build it in …" (the ב- form), for narration and buttons: "מתכנן את שלבי הבנייה בשלד פלדה קלה". */
export const METHOD_IN_HE: Record<MethodId, string> = {
  concrete: 'בבטון ובלוקים',
  icf: 'ב-ICF',
  steel: 'בשלד פלדה קלה',
  timber: 'במסגרת עץ',
  precast: 'בשיטה הטרומית',
};

/** Short ב- form for compact buttons: "צפו בבנייה בפלדה". */
export const METHOD_IN_SHORT_HE: Record<MethodId, string> = {
  concrete: 'בבטון',
  icf: 'ב-ICF',
  steel: 'בפלדה',
  timber: 'בעץ',
  precast: 'בטרומי',
};

/** Token colors per method (tile background + icon/text color). */
export const METHOD_TONE: Record<MethodId, { tile: string; ink: string }> = {
  concrete: { tile: 'bg-ink-100', ink: 'text-ink-700' },
  icf: { tile: 'bg-success-50', ink: 'text-success-700' },
  steel: { tile: 'bg-info-50', ink: 'text-info-700' },
  timber: { tile: 'bg-warning-50', ink: 'text-warning-700' },
  precast: { tile: 'bg-sand-100', ink: 'text-sand-700' },
};

const ICONS: Record<MethodId, LucideIcon> = {
  concrete: BrickWall,
  icf: Layers2,
  steel: Columns3,
  timber: TreePine,
  precast: PanelsTopLeft,
};

export function MethodIcon({ id, size = 18, className = '' }: { id: MethodId; size?: number; className?: string }) {
  const Icon = ICONS[id];
  return <Icon size={size} strokeWidth={2.2} className={className} aria-hidden />;
}

/** A small rounded tile with the method icon on its tone. */
export function MethodBadgeIcon({ id, size = 32 }: { id: MethodId; size?: number }) {
  const t = METHOD_TONE[id];
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${t.tile} ${t.ink}`} style={{ width: size, height: size }} aria-hidden>
      <MethodIcon id={id} size={Math.round(size * 0.55)} />
    </span>
  );
}

// ---- Numbers (this house, from METHOD_TOTALS) -------------------------------------------------

/** "כ-13.5 חודשים": working days / 22, to the nearest half month. */
export const methodMonthsHe = (m: MethodId) => fmtMonths(METHOD_TOTALS[m].days);

/** Relative cost vs concrete for this house (0.04 = 4% more). */
export const methodCostDelta = (m: MethodId) => METHOD_TOTALS[m].costILS / METHOD_TOTALS.concrete.costILS - 1;

/** "כ-4% יותר" / "כ-2% פחות" / "אותו מחיר" (within ±1%); concrete itself is the baseline. */
export function methodCostDeltaHe(m: MethodId): string {
  if (m === 'concrete') return 'מחיר הבסיס';
  const d = methodCostDelta(m);
  if (Math.abs(d) < 0.01) return 'אותו מחיר';
  return `כ-${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'יותר' : 'פחות'}`;
}

const nf2 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
/** "2.25 מיליון ₪" (Hebrew, no "M"). */
export const fmtMillionsHe = (ils: number) => `${nf2.format(Math.round(ils / 1e4) / 100)} מיליון ₪`;

// ---- URL ---------------------------------------------------------------------------------------

/** Put `?method=` (and `?step=` when given, else drop it) in the URL without a history entry. */
export function writeMethodUrl(method: MethodId, step?: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('method', method);
  if (step) url.searchParams.set('step', String(step));
  else url.searchParams.delete('step');
  url.searchParams.delete('pick');
  window.history.replaceState(window.history.state, '', url.toString());
}

/** Shareable deep link into the demo at a method + step. */
export function methodShareUrl(method: MethodId, step: number): string {
  return `${window.location.origin}/3d/?method=${method}&step=${step}`;
}

// ---- Scores ------------------------------------------------------------------------------------

const SCORE_LABELS: Array<{ key: keyof MethodInfo['scores']; he: string }> = [
  { key: 'thermal', he: 'בידוד' },
  { key: 'speed', he: 'מהירות' },
  { key: 'availability', he: 'זמינות' },
];

/** Three tiny 5-segment bars (בידוד / מהירות / זמינות); screen readers get "בידוד: 4 מתוך 5". */
export function ScoreBars({ scores, className = '' }: { scores: MethodInfo['scores']; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-2 gap-y-1 ${className}`}>
      {SCORE_LABELS.map((s) => (
        <li key={s.key} className="flex items-center gap-1 text-[11.5px] font-semibold text-ink-600">
          <span>{s.he}</span>
          <span aria-hidden className="flex gap-[2px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`h-[7px] w-[5px] rounded-[2px] ${i <= scores[s.key] ? 'bg-ink-700' : 'bg-ink-200'}`} />
            ))}
          </span>
          <span className="sr-only">
            {scores[s.key]} מתוך 5
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---- Thumbnail ---------------------------------------------------------------------------------

const LINE = 'rgb(var(--bb-ink-900) / 0.07)';
/** Placeholder textures that hint at each method's wall build-up (blocks, EPS courses, studs, panels). */
const PATTERN: Record<MethodId, React.CSSProperties> = {
  concrete: {
    backgroundImage: `linear-gradient(${LINE} 2px, transparent 2px), linear-gradient(90deg, ${LINE} 2px, transparent 2px), linear-gradient(90deg, ${LINE} 2px, transparent 2px)`,
    backgroundSize: '100% 20px, 40px 40px, 40px 40px',
    backgroundPosition: '0 0, 0 0, 20px 20px',
  },
  icf: { backgroundImage: `repeating-linear-gradient(0deg, ${LINE} 0 2px, transparent 2px 28px)` },
  steel: { backgroundImage: `repeating-linear-gradient(90deg, ${LINE} 0 3px, transparent 3px 22px)` },
  timber: { backgroundImage: `repeating-linear-gradient(90deg, ${LINE} 0 5px, transparent 5px 28px), linear-gradient(0deg, ${LINE} 5px, transparent 5px)` },
  precast: { backgroundImage: `linear-gradient(90deg, ${LINE} 3px, transparent 3px)`, backgroundSize: '33.4% 100%' },
};

/**
 * Method render (`/build3d/methods/<id>-800.webp`), shown once it loads; until then, or if it is
 * missing, a token-colored placeholder with the method icon.
 */
export function MethodThumb({ id, className = '', iconSize = 26 }: { id: MethodId; className?: string; iconSize?: number }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An image that failed before hydration never fires onError.
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? 'ok' : 'error');
  }, []);
  const t = METHOD_TONE[id];
  return (
    <div className={`relative overflow-hidden ${t.tile} ${className}`} aria-hidden>
      {state !== 'ok' && (
        <div className="absolute inset-0 grid place-items-center" style={PATTERN[id]}>
          <span className={`grid place-items-center rounded-2xl bg-white/90 shadow-sm ${t.ink}`} style={{ width: iconSize * 1.9, height: iconSize * 1.9 }}>
            <MethodIcon id={id} size={iconSize} />
          </span>
        </div>
      )}
      {state !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={`/build3d/methods/${id}-800.webp`}
          alt=""
          width={800}
          height={500}
          decoding="async"
          draggable={false}
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
          className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}
