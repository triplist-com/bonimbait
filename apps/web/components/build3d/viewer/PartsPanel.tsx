'use client';

/**
 * "Parts for this step" (IKEA-style): one tile per bill-of-materials line with an icon for
 * the material kind, a big quantity and its unit, and a short name. Data-driven: the kind is
 * a keyword match over `nameHe`, so every construction method's materials get an icon
 * (unknown names fall back to a generic package).
 */
import {
  AppWindow,
  Armchair,
  Bath,
  BrickWall,
  CalendarDays,
  Car,
  Columns3,
  Construction,
  Container,
  CookingPot,
  DoorOpen,
  Droplets,
  Fan,
  Fence,
  Frame,
  House,
  Layers,
  LayoutGrid,
  Lightbulb,
  MapPin,
  Nut,
  Package,
  PaintBucket,
  PaintRoller,
  Ruler,
  Shovel,
  Sprout,
  Sun,
  Truck,
  WashingMachine,
  Weight,
  Zap,
} from 'lucide-react';
import type { MaterialLine } from '@/lib/build3d/engine/types';
import { fmtNum } from './format';

type Tone = 'ink' | 'primary' | 'sand' | 'success' | 'warning' | 'danger' | 'info';
type IconC = ((p: { size?: number }) => JSX.Element) & { displayName?: string };

/** Token classes per tone (literal strings so Tailwind keeps them). */
const TONE: Record<Tone, string> = {
  ink: 'bg-ink-100 text-ink-700',
  primary: 'bg-primary-50 text-primary-700',
  sand: 'bg-sand-100 text-sand-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
};

// --- construction icons lucide does not have (24 px grid, stroke = currentColor) -------------
function Svg({ size = 22, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const Rebar: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M4 20 20 4M3.5 14.5l11-11M9.5 20.5l11-11" />
    <path d="M7 15l2 2M11 11l2 2M15 7l2 2" />
  </Svg>
);
const Concrete: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M3 17.5h18V21H3z" />
    <path d="M9 3.5c0 2.2-2.2 3.3-2.2 5.4a2.2 2.2 0 0 0 4.4 0C11.2 6.8 9 5.7 9 3.5z" />
    <path d="M15.5 7.5c0 1.5-1.5 2.3-1.5 3.7a1.5 1.5 0 0 0 3 0c0-1.4-1.5-2.2-1.5-3.7z" />
  </Svg>
);
const IBeam: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M5 3h14v3.5h-5v11h5V21H5v-3.5h5v-11H5z" />
  </Svg>
);
const Panel: IconC = ({ size }) => (
  <Svg size={size}>
    <rect x="3" y="5.5" width="18" height="15" rx="1" />
    <rect x="8" y="9.5" width="5" height="6.5" />
    <path d="M7 5.5V2.8h2.2v2.7M14.8 5.5V2.8H17v2.7" />
  </Svg>
);
const HollowCore: IconC = ({ size }) => (
  <Svg size={size}>
    <rect x="2" y="8" width="20" height="8" rx="1" />
    <circle cx="6.5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="17.5" cy="12" r="1.6" />
  </Svg>
);
const Pipe: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M3 6h9a6 6 0 0 1 6 6v9" />
    <path d="M3 13h6a2 2 0 0 1 2 2v6" />
    <path d="M3 4.5v10M9.5 21h10" />
  </Svg>
);
const Crane: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M7 21V4M4 21h6M7 4h14M7 8l4-4M3 4h4M18.5 4v5" />
    <path d="M17 9h3v2.6h-3z" />
  </Svg>
);
const Board: IconC = ({ size }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="M3 9.3h18M3 14.6h18" />
    <path d="M7.5 6.7c1 .6 2 .6 3 0M13 12c1 .6 2 .6 3 0M8.5 17.4c1 .6 2 .6 3 0" />
  </Svg>
);
const Insulation: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M3 5h18M3 19h18" />
    <path d="M3 12l2.25-4 2.25 8 2.25-8 2.25 8 2.25-8 2.25 8 2.25-8L21 12" />
  </Svg>
);
const Pile: IconC = ({ size }) => (
  <Svg size={size}>
    <path d="M2.5 7.5h19" />
    <path d="M9 4v16.5a3 1.2 0 0 0 6 0V4" />
    <path d="M9 4a3 1.2 0 0 0 6 0 3 1.2 0 0 0-6 0" />
  </Svg>
);

export interface Kind {
  /** Stable kind id (tests, analytics). */
  id: string;
  icon: IconC;
  tone: Tone;
  /** Any of these substrings in the name (checked in order, first kind wins). Mind Hebrew final letters: 'חלון' does not match 'חלונות'. */
  any: string[];
  /** Or a matching unit. */
  units?: string[];
  /** Or the name starts with one of these. */
  starts?: string[];
}

function L(I: typeof Zap): IconC {
  const C: IconC = ({ size = 22 }) => <I size={size} strokeWidth={1.8} aria-hidden />;
  C.displayName = `Part${I.displayName ?? 'Icon'}`;
  return C;
}

/** Order matters: specific kinds before the generic ones that share words. */
const KINDS: Kind[] = [
  { id: 'weight', icon: L(Weight), tone: 'ink', any: [], starts: ['משקל'] },
  { id: 'measure', icon: L(Ruler), tone: 'ink', any: [], starts: ['שטח', 'אורך', 'הפרש', 'עומק', 'רדיוס'] },
  { id: 'time', icon: L(CalendarDays), tone: 'ink', any: ['הרטבת'], units: ['יום', 'ימים'], starts: ['ימי'] },
  { id: 'crane', icon: Crane, tone: 'ink', any: ['מנוף'] },
  { id: 'truck', icon: L(Truck), tone: 'ink', any: ['משאבת', 'משאבה', 'מערבל', 'משאיות'], units: ['נסיעות'] },
  { id: 'scaffold', icon: L(Construction), tone: 'ink', any: ['פיגום', 'לוחות עבודה'] },
  { id: 'fence', icon: L(Fence), tone: 'success', any: ['גדר'] },
  { id: 'container', icon: L(Container), tone: 'ink', any: ['מכולת'] },
  { id: 'marking', icon: L(MapPin), tone: 'primary', any: ['סימון', 'שלט'] },
  { id: 'sanitary', icon: L(Bath), tone: 'primary', any: ['אסלות', 'אסלה', 'כיור', 'מקלח', 'שירותים', 'אמבט'] },
  { id: 'lighting', icon: L(Lightbulb), tone: 'warning', any: ['תאורה', 'ספוט', 'מנורות', 'פנסי', 'LED'] },
  { id: 'electric', icon: L(Zap), tone: 'warning', any: ['חשמל', 'שרשור'] },
  { id: 'kitchen', icon: L(CookingPot), tone: 'primary', any: ['מטבח', 'ארונות', 'שיש'] },
  { id: 'appliance', icon: L(WashingMachine), tone: 'primary', any: ['מכונת כביסה', 'מייבש'] },
  { id: 'furniture', icon: L(Armchair), tone: 'primary', any: ['ספות', 'מיטות', 'ריהוט', 'שולחן', 'שולחנ', 'מנגל'] },
  { id: 'car', icon: L(Car), tone: 'ink', any: ['מכוניות', 'חניות'] },
  { id: 'garden', icon: L(Sprout), tone: 'success', any: ['דשא', 'עצים', 'שיחים', 'עציצ', 'אדניות', 'צמחי'] },
  { id: 'sun', icon: L(Sun), tone: 'warning', any: ['דוד שמש', 'פרגול', 'לוחות צל'] },
  { id: 'hvac', icon: L(Fan), tone: 'info', any: ['מיזוג', 'מאייד', 'מפזרים'] },
  { id: 'water', icon: L(Droplets), tone: 'info', any: ['ממטרות', 'השקיה', 'ברז מים'] },
  { id: 'insulation', icon: Insulation, tone: 'warning', any: ['בידוד', 'XPS', 'EPS', 'צמר', 'קלקר'] },
  { id: 'earth', icon: L(Shovel), tone: 'sand', any: ['חצץ', 'חפירה', 'מצע', 'מילוי', 'הידוק', 'עפר', 'קרקע'] },
  { id: 'pipe', icon: Pipe, tone: 'info', any: ['צינור', 'צנרת', 'שוחות', 'ניקוז', 'ביוב', 'שרוול', 'נקודות מים', 'קולקטור', 'אוורור'] },
  { id: 'door', icon: L(DoorOpen), tone: 'info', any: ['דלת'] },
  { id: 'window', icon: L(AppWindow), tone: 'info', any: ['חלון', 'חלונ', 'זכוכית', 'תריס'] },
  { id: 'frame', icon: L(Frame), tone: 'info', any: ['משקו'] },
  { id: 'waterproofing', icon: L(Layers), tone: 'info', any: ['איטום', 'ביטומ', 'יריעת', 'יריעות', 'פריימר', 'אטם', 'פוליאתילן', 'מחזיר קרינה', 'ממברנה'] },
  { id: 'rebar', icon: Rebar, tone: 'danger', any: ['ברזל', 'זיון', 'חישוק', 'מוטות', 'כלוב', 'ספירלה'] },
  { id: 'hollowcore', icon: HollowCore, tone: 'ink', any: ['חלולים', 'חלולות'] },
  { id: 'panel', icon: Panel, tone: 'ink', any: ['פאנל', 'טרומי', 'מודול ממ'] },
  { id: 'concrete', icon: Concrete, tone: 'ink', any: ['בטון', 'דיס', 'מלט', 'יציקה', 'יצוק', 'החלקה'] },
  { id: 'block', icon: L(BrickWall), tone: 'sand', any: ['בלוק', 'לבנים'] },
  { id: 'tiles', icon: L(LayoutGrid), tone: 'sand', any: ['אבן', 'אבני', 'אריח', 'פורצלן', 'קרמיקה', 'ריצוף', 'משתלבות', 'פרקט', 'מפתן', 'מדרגות'] },
  { id: 'paint', icon: L(PaintRoller), tone: 'primary', any: ['צבע', 'טיח', 'שליכט', 'שפכטל', 'סיוד', 'גבס', 'פיברגלס', 'זיגוג'] },
  { id: 'adhesive', icon: L(PaintBucket), tone: 'primary', any: ['דבק', 'גרוט'] },
  { id: 'fastener', icon: L(Nut), tone: 'ink', any: ['ברג', 'עוגנ', 'קשרים', 'מהדק', 'ציר', 'מנעול', 'ספייסר', 'מרווח', 'מסמר', 'חיבורי'] },
  { id: 'board', icon: Board, tone: 'warning', any: ['תבני', 'טפסנות', 'דיקט', 'H20', 'עץ', 'OSB', 'לוחות הגנה'] },
  { id: 'steel', icon: IBeam, tone: 'info', any: ['פלדה', 'פרופי', 'ניצב', 'מגולוונ', 'ווילר', 'תמיכ', 'מעמדי'] },
  { id: 'pile', icon: Pile, tone: 'sand', any: ['כלונס'] },
  { id: 'column', icon: L(Columns3), tone: 'ink', any: ['עמודים', 'עמוד'] },
  { id: 'house', icon: L(House), tone: 'primary', any: ['בית'] },
];

const FALLBACK: Kind = { id: 'generic', icon: L(Package), tone: 'ink', any: [] };

export function partKind(m: MaterialLine): Kind {
  const name = m.nameHe;
  return (
    KINDS.find(
      (k) => k.any.some((w) => name.includes(w)) || k.units?.includes(m.unitHe) || k.starts?.some((w) => name.startsWith(w)),
    ) ?? FALLBACK
  );
}

/** Tile name: without the parenthesized details (they stay in the tooltip / screen-reader text). */
export function shortName(name: string): string {
  const s = name.replace(/\s*\([^)]*\)/g, '').trim();
  return s || name;
}

export default function PartsPanel({ materials, layout = 'grid' }: { materials: MaterialLine[]; layout?: 'grid' | 'scroll' }) {
  if (!materials.length) return null;
  if (layout === 'scroll') {
    return (
      <ul
        aria-label="חלקים לשלב"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {materials.map((m, i) => {
          const k = partKind(m);
          return (
            <li key={`${m.nameHe}-${i}`} title={m.nameHe} className="flex w-[152px] shrink-0 snap-start items-center gap-2 rounded-xl border border-ink-200 bg-white px-2 py-1.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONE[k.tone]}`}>
                <k.icon size={20} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[15px] font-extrabold tabular-nums text-ink">
                  {fmtNum(m.qty)} <span className="text-[11.5px] font-semibold text-ink-500">{m.unitHe}</span>
                </span>
                <span className="block truncate text-[11.5px] text-ink-600" aria-hidden>
                  {shortName(m.nameHe)}
                </span>
                <span className="sr-only">{m.nameHe}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul aria-label="חלקים לשלב" className="grid grid-cols-3 gap-2">
      {materials.map((m, i) => {
        const k = partKind(m);
        return (
          <li
            key={`${m.nameHe}-${i}`}
            title={m.nameHe}
            className="flex min-w-0 flex-col items-center rounded-2xl border border-ink-200 bg-white px-1.5 pb-2 pt-2.5 text-center shadow-[0_1px_0_rgba(35,31,32,0.04)]"
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONE[k.tone]}`}>
              <k.icon size={22} />
            </span>
            <span className="mt-1.5 text-[18px] font-extrabold leading-none tabular-nums text-ink">{fmtNum(m.qty)}</span>
            <span className="mt-0.5 text-[11px] font-semibold leading-none text-ink-500">{m.unitHe}</span>
            <span className="mt-1.5 line-clamp-2 w-full break-words text-[11.5px] leading-[1.25] text-ink-700" aria-hidden>
              {shortName(m.nameHe)}
            </span>
            <span className="sr-only">{m.nameHe}</span>
          </li>
        );
      })}
    </ul>
  );
}
