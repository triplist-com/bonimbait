import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowLeft, CalendarCheck, CircleAlert, CircleCheck, Heart, Info, Search, Sparkles, Star, TriangleAlert } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Chip, ChipLink } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Accordion } from '@/components/ui/Accordion';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Checkbox, Radio, Switch } from '@/components/ui/Choice';
import { Progress, Steps } from '@/components/ui/Steps';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { RatingStars } from '@/components/ui/RatingStars';
import { Logo } from '@/components/ui/Logo';
import { PageHeader } from '@/components/ui/PageHeader';
import { contrastRatio } from '@/lib/design/contrast';
import { COLOR_SCALES, brandHex, dataViz, ink, motion, semantic } from '@/lib/design/tokens';
import { BUILD_STAGES } from '@/lib/stages';
import { calculateCost } from '@/lib/calculator';
import { BUDGET_TEASER } from '@/lib/home/content';
import { getKnowledgeStats, getStageArticleCounts } from '@/lib/home/data';
import { loadPriceBook } from '@/lib/planner/price-book';
import { OverlayDemos, TabsDemo, ToastDemo, TooltipDemo } from './Demos';

export const metadata: Metadata = {
  title: 'מערכת העיצוב',
  description: 'מערכת העיצוב של בונים בית: טוקנים, רכיבים ודפוסים.',
  robots: { index: false, follow: false },
};

export const revalidate = 3600;

const SECTIONS = [
  ['principles', 'עקרונות'],
  ['brand', 'מותג'],
  ['color', 'צבע'],
  ['dataviz', 'צבעי נתונים'],
  ['type', 'טיפוגרפיה'],
  ['shape', 'צורה ותנועה'],
  ['actions', 'כפתורים ותגיות'],
  ['forms', 'טפסים'],
  ['surfaces', 'משטחים ותוכן'],
  ['media', 'מדיה ודירוג'],
  ['overlays', 'שכבות וחיווי'],
  ['patterns', 'דפוסים'],
] as const;

function Block({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-ink-100 py-14 first:border-t-0 first:pt-0">
      <h2 id={`${id}-h`} className="text-headline text-ink-900">
        {title}
      </h2>
      {intro && <p className="mt-3 max-w-3xl text-body-lg text-ink-600">{intro}</p>}
      <div className="mt-8 space-y-10">{children}</div>
    </section>
  );
}

function Example({ title, code, children, className }: { title: string; code?: string; children: ReactNode; className?: string }) {
  return (
    <figure className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <figcaption className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
        <span className="text-sm font-bold text-ink-900">{title}</span>
      </figcaption>
      <div className={className ?? 'p-5 sm:p-6'}>{children}</div>
      {code && (
        <pre dir="ltr" className="overflow-x-auto border-t border-ink-100 bg-ink-950 px-5 py-4 text-left text-[0.8125rem] leading-relaxed text-ink-100">
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}

/** Inline code, isolated LTR inside Hebrew. */
function C({ children }: { children: ReactNode }) {
  return (
    <code dir="ltr" className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[0.8125em] text-ink-800 [unicode-bidi:isolate]">
      {children}
    </code>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  const onWhite = contrastRatio(hex, '#FFFFFF');
  const onInk = contrastRatio(hex, ink[900]);
  const textOn = onWhite >= onInk ? '#FFFFFF' : ink[900];
  return (
    <li className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
      <div className="flex h-16 items-end p-2 text-xs font-bold" style={{ background: hex, color: textOn }}>
        {name}
      </div>
      <div className="space-y-0.5 px-2.5 py-2 text-[0.6875rem] leading-tight text-ink-600">
        <p dir="ltr" className="text-right font-semibold text-ink-900">
          {hex}
        </p>
        <p>
          לבן <span className="num">{onWhite.toFixed(1)}</span> · דיו <span className="num">{onInk.toFixed(1)}</span>
        </p>
      </div>
    </li>
  );
}

const TYPE_SCALE: Array<[string, string, string]> = [
  ['text-display-xl', 'אתכם עד המפתח', '40→72px · 800 · lh 1.04 · -3%'],
  ['text-display', 'נבחרת המומלצים', '36→56px · 800 · lh 1.08'],
  ['text-headline', 'המסע לבית, שלב אחרי שלב', '28→40px · 800 · lh 1.15'],
  ['text-headline-sm', 'סרטונים נוספים', '24→30px · 800 · lh 1.2'],
  ['text-title-lg', 'מסלול בונים בית פלוס', '22px · 700'],
  ['text-title', 'תבניות אלומיניום ליציקות', '18px · 700'],
  ['text-title-sm', 'שלב עבודות שלד', '16px · 700'],
  ['text-body-lg', 'שאלו כל שאלה על בניית בית וקבלו תשובה מהשטח.', '19px · lh 1.75'],
  ['text-body', 'הטקסט הרגיל באתר. שורות נוחות לקריאה בעברית, עם ריווח נדיב.', '16px · lh 1.75'],
  ['text-body-sm', 'טקסט משני בכרטיסים ובטפסים.', '15px · lh 1.65'],
  ['text-caption', 'מחירים נכונים ל-2026 · לא כולל מע״מ', '13px · lh 1.45'],
];

export default async function DesignSystemPage() {
  const [counts, stats, priceBook] = await Promise.all([getStageArticleCounts(), getKnowledgeStats(), loadPriceBook()]);
  const stageBars = BUILD_STAGES.map((s) => ({ label: s.label, value: counts[s.categorySlug.normalize('NFC')] ?? 0 }));
  const maxBar = Math.max(1, ...stageBars.map((b) => b.value));
  // The owner's current price book (the admin price book), as on the homepage.
  const budget = calculateCost({ ...BUDGET_TEASER.example.answers, special_features: [] }, priceBook.book);

  return (
    <>
      <PageHeader
        eyebrow="Platform · Design system"
        title="מערכת העיצוב של בונים בית"
        description={
          <>
            הטוקנים, הרכיבים והדפוסים שכל הפלטפורמה בנויה מהם: המותג של בונים בית (מג׳נטה, שחור, לבן), חם, אמין ומודרני. התיעוד המלא ב-
            <C>docs/platform/DESIGN_SYSTEM.md</C>.
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <ChipLink key={id} href={`#${id}`} size="sm" prefetch={false}>
              {label}
            </ChipLink>
          ))}
        </div>
      </PageHeader>

      <div className="container-page py-14">
        {/* Principles */}
        <Block id="principles" title="עקרונות" intro="שישה כללים שמכריעים כשמתלבטים.">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
              ['המותג של תומר, לא שלנו', <>מג׳נטה <C>#E61559</C>, שחור ולבן. אנחנו מרוממים את מה שקיים, לא מחליפים.</>],
              ['מהשטח, בגובה העיניים', 'עברית טבעית בגוף שני רבים. בלי הייפ, בלי "AI" בכותרות. עלויות עם תאריך.'],
              ['שאלה קודם', 'תיבת השאלה היא הכניסה הראשית. כל עמוד מוביל לתשובה, לרגע בסרטון או לאדם.'],
              ['חם ושקט', 'נייר, חול ובטון כרקע; מג׳נטה רק למה שחשוב. כפתור ראשי אחד בכל אזור.'],
              ['טלפון קודם', '390px הוא המסך הראשי. אזורי מגע של 44px ומעלה, בלי גלילה אופקית מקרית.'],
              ['מהיר ונגיש', 'LCP מתחת ל-2.5 שניות בנייד, ניגודיות AA, מקלדת ופוקוס גלוי, תנועה רק כשמותר.'],
              ] as Array<[string, ReactNode]>
            ).map(([t, d]) => (
              <li key={t}>
                <Card padding="md" className="h-full">
                  <p className="text-title text-ink-900">{t}</p>
                  <p className="mt-2 text-body-sm text-ink-600">{d}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Block>

        {/* Brand */}
        <Block
          id="brand"
          title="מותג"
          intro={
            <>
              הלוגו, הסמל ואייקוני השלבים של בונים בית, מתוך האתר החי. הקבצים ב-<C>public/brand/</C>.
            </>
          }
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <Example title="לוגו על נייר">
              <div className="flex h-28 items-center justify-center rounded-2xl bg-paper">
                <Logo className="h-10 text-ink-900" accent />
              </div>
            </Example>
            <Example title="לוגו על דיו">
              <div className="flex h-28 items-center justify-center rounded-2xl bg-ink-950">
                <Logo className="h-10 text-white" accent />
              </div>
            </Example>
            <Example title="סמל (favicon)">
              <div className="flex h-28 items-center justify-center gap-4 rounded-2xl bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/monogram.svg" alt="סמל בונים בית" width={64} height={64} className="size-16" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/monogram.svg" alt="" width={32} height={32} className="size-8" />
              </div>
            </Example>
          </div>
          <Example title="אייקוני שלבי הבנייה (lib/stages.ts)">
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {BUILD_STAGES.map((s) => (
                <li key={s.id} className="flex flex-col items-center gap-2 rounded-2xl bg-sand-50 p-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.icon} alt="" width={56} height={40} className="h-10 w-14 object-contain" />
                  <span className="text-sm font-bold text-ink-900">
                    <span className="num text-ink-400">{s.order}</span> {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </Example>
          <Example title="ביקורת מותג: מה נמצא באתר החי" className="overflow-x-auto p-0">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-sand-100 text-ink-900">
                <tr>
                  <th className="px-5 py-3 text-start">שימוש באתר החי</th>
                  <th className="px-5 py-3 text-start">Hex</th>
                  <th className="px-5 py-3 text-start">טוקן</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {[
                  ['לוגו, אייקונים, כותרות', brandHex.magenta, 'primary-600 (DEFAULT)'],
                  ['כפתורים ומסגרות (Elementor)', brandHex.magentaButton, '≈ primary-600'],
                  ['Accent / Calendly', brandHex.accent, 'primary-500'],
                  ['Hover', brandHex.hover, 'primary-700'],
                  ['Pressed', brandHex.pressed, 'primary-800'],
                  ['טקסט ולוגו', brandHex.ink, 'ink-900 (DEFAULT)'],
                ].map(([use, hex, token]) => (
                  <tr key={use}>
                    <td className="px-5 py-3 text-ink-800">{use}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-4 rounded-md ring-1 ring-ink-900/10" style={{ background: hex }} />
                        <span dir="ltr" className="font-mono text-xs">
                          {hex}
                        </span>
                      </span>
                    </td>
                    <td dir="ltr" className="px-5 py-3 text-right font-mono text-xs text-ink-700">
                      {token}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Example>
        </Block>

        {/* Color */}
        <Block
          id="color"
          title="צבע"
          intro="כל צבע הוא משתנה CSS (app/globals.css) עם מראה ב-lib/design/tokens.ts. מחלקות ישנות מתעדכנות לבד: primary למג'נטה, secondary ו-gray לדיו החם. בכל משטח מוצג יחס הניגודיות מול לבן ומול דיו."
        >
          {Object.entries(COLOR_SCALES).map(([name, scale]) => (
            <div key={name}>
              <h3 dir="ltr" className="mb-3 text-right font-mono text-sm font-bold text-ink-900">
                {name}-*
              </h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
                {Object.entries(scale).map(([step, hex]) => (
                  <Swatch key={step} name={step} hex={hex} />
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="mb-3 text-title text-ink-900">תפקידים</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(semantic).map(([role, hex]) => (
                <Swatch key={role} name={role} hex={hex} />
              ))}
            </ul>
          </div>
        </Block>

        {/* Data viz */}
        <Block
          id="dataviz"
          title="צבעי נתונים"
          intro="לדשבורדים (Command Center, פורטל בעלי מקצוע). הסדר הקטגורי נבחר בבדיקה ממוחשבת, עם המג'נטה של המותג במקום הראשון: הפרש CVD מינימלי 10.0 בין שכנים, 24.8 בראייה רגילה. מקצים לפי הסדר, לא מחזרים; סדרה תשיעית נכנסת ל״אחר״."
        >
          <Example title="קטגורי (8, לפי הסדר)">
            <ol className="grid grid-cols-4 gap-3 sm:grid-cols-8">
              {dataViz.categorical.map((hex, i) => (
                <li key={hex} className="text-center">
                  <span className="block h-14 rounded-xl" style={{ background: hex }} />
                  <span className="num mt-1.5 block text-xs font-bold text-ink-900">{i + 1}</span>
                  <span dir="ltr" className="block font-mono text-[0.6875rem] text-ink-500">
                    {hex}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-caption text-ink-500">צבע 3 (ענבר) מתחת ל-3:1 על לבן: בגרף שמשתמש בו חובה תוויות ישירות או טבלה.</p>
          </Example>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="רציף (עוצמה, גוון אחד)">
              <div className="flex h-10 overflow-hidden rounded-xl">
                {dataViz.sequential.map((hex) => (
                  <span key={hex} className="flex-1" style={{ background: hex }} />
                ))}
              </div>
              <p className="mt-3 text-caption text-ink-500">לסימונים בדידים (שלבי משפך) מתחילים מ-300 ומעלה.</p>
            </Example>
            <Example title="מתפצל (מתחת / מעל, ניטרלי באמצע)">
              <div className="flex h-10 overflow-hidden rounded-xl">
                {[...dataViz.diverging.negative, dataViz.diverging.neutral, ...dataViz.diverging.positive].map((hex) => (
                  <span key={hex} className="flex-1" style={{ background: hex }} />
                ))}
              </div>
              <p className="mt-3 text-caption text-ink-500">כחול = מתחת לתקציב, מג׳נטה = מעליו.</p>
            </Example>
          </div>
          <Example title="סטטוס (תמיד עם אייקון ותווית)">
            <ul className="flex flex-wrap gap-3">
              <li>
                <Badge tone="success" icon={<CircleCheck />}>
                  בתקציב
                </Badge>
              </li>
              <li>
                <Badge tone="warning" icon={<TriangleAlert />}>
                  קרוב לחריגה
                </Badge>
              </li>
              <li>
                <Badge tone="danger" icon={<CircleAlert />}>
                  חריגה
                </Badge>
              </li>
              <li>
                <Badge tone="info" icon={<Info />}>
                  לידיעה
                </Badge>
              </li>
            </ul>
          </Example>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="דוגמה: מאמרים לפי שלב (סדרה אחת, גוון אחד)">
              <ul className="space-y-3" aria-label="מאמרים לפי שלב">
                {stageBars.map((b) => (
                  <li key={b.label} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="font-medium text-ink-800">{b.label}</span>
                    <span className="h-3 overflow-hidden rounded-e-md bg-ink-50" title={`${b.label}: ${b.value}`}>
                      <span className="block h-full rounded-e-md" style={{ width: `${(b.value / maxBar) * 100}%`, background: dataViz.categorical[0] }} />
                    </span>
                    <span className="num text-end font-semibold text-ink-900">{b.value}</span>
                  </li>
                ))}
              </ul>
            </Example>
            <Example title="דוגמה: פירוק תקציב (קטגורי, עם מקרא)">
              <div className="flex h-8 gap-[2px] overflow-hidden rounded-lg" role="img" aria-label="פירוק תקציב לפי שלבים">
                {budget.breakdown.map((b, i) => (
                  <span key={b.phase} style={{ width: `${b.percentage}%`, background: dataViz.categorical[i] }} title={`${b.label}: ${b.percentage}%`} />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {budget.breakdown.map((b, i) => (
                  <li key={b.phase} className="flex items-center gap-2">
                    <span className="size-3 shrink-0 rounded-sm" style={{ background: dataViz.categorical[i] }} />
                    <span className="text-ink-700">{b.label}</span>
                    <span className="num ms-auto font-semibold text-ink-900">{b.percentage}%</span>
                  </li>
                ))}
              </ul>
            </Example>
          </div>
        </Block>

        {/* Type */}
        <Block
          id="type"
          title="טיפוגרפיה"
          intro="Heebo (משתנה, משקלים 100–900) מוגש עם next/font. הגופן של האתר החי, Atlas, מסחרי ולא ניתן להפצה; Heebo הוא הסנס העברי החינמי הקרוב אליו, וכותרות 800 עם ריווח צר נותנות את הנוכחות של המותג. אין גופן תצוגה נוסף: קובץ אחד, מהיר."
        >
          <div className="divide-y divide-ink-100 rounded-3xl border border-ink-100 bg-white">
            {TYPE_SCALE.map(([cls, sample, spec]) => (
              <div key={cls} className="grid gap-2 p-5 sm:grid-cols-[12rem_1fr] sm:items-baseline sm:gap-6">
                <div>
                  <p dir="ltr" className="text-right font-mono text-xs font-bold text-primary-700">
                    {cls}
                  </p>
                  <p dir="ltr" className="text-right text-caption text-ink-500">{spec}</p>
                </div>
                <p className={`${cls} text-ink-900`}>{sample}</p>
              </div>
            ))}
          </div>
          <Example title="מספרים בתוך עברית" code={`<span className="num">50,000+</span>  // direction: ltr; isolate; tabular-nums`}>
            <p className="text-body-lg text-ink-800">
              <span className="num font-bold">50,000+</span> השמעות בספוטיפיי, <span className="num font-bold">112</span> פרקים, החל מ-
              <span className="font-bold">₪6,900</span> לא כולל מע״מ.
            </p>
          </Example>
        </Block>

        {/* Shape + motion */}
        <Block id="shape" title="צורה ותנועה">
          <div className="grid gap-4 lg:grid-cols-3">
            <Example title="רדיוסים">
              <ul className="grid grid-cols-3 gap-3 text-center text-xs text-ink-600">
                {[
                  ['rounded-lg', '8'],
                  ['rounded-xl', '12'],
                  ['rounded-2xl', '16'],
                  ['rounded-3xl', '24'],
                  ['rounded-4xl', '32'],
                  ['rounded-full', '∞'],
                ].map(([c, px]) => (
                  <li key={c}>
                    <span className={`mx-auto block size-14 border-2 border-primary-600 bg-primary-50 ${c}`} />
                    <span dir="ltr" className="mt-1 block font-mono">
                      {c}
                    </span>
                    <span className="num">{px}px</span>
                  </li>
                ))}
              </ul>
            </Example>
            <Example title="צללים (דיו חם)">
              <ul className="grid grid-cols-2 gap-4 text-center text-xs text-ink-600">
                {['shadow-xs', 'shadow-card', 'shadow-card-hover', 'shadow-lift', 'shadow-dialog', 'shadow-brand'].map((c) => (
                  <li key={c}>
                    <span className={`mx-auto block h-12 w-full rounded-xl bg-white ${c}`} />
                    <span dir="ltr" className="mt-2 block font-mono">
                      {c}
                    </span>
                  </li>
                ))}
              </ul>
            </Example>
            <Example title="תנועה">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {Object.entries(motion.duration).map(([k, v]) => (
                    <tr key={k}>
                      <td dir="ltr" className="py-1.5 text-right font-mono text-xs">
                        {k}
                      </td>
                      <td className="num py-1.5 text-end text-ink-700">{v}ms</td>
                    </tr>
                  ))}
                  {Object.entries(motion.easing).map(([k, v]) => (
                    <tr key={k}>
                      <td dir="ltr" className="py-1.5 text-right font-mono text-xs">
                        ease-{k}
                      </td>
                      <td dir="ltr" className="py-1.5 text-end font-mono text-[0.6875rem] text-ink-500">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-caption text-ink-500">CSS בלבד. prefers-reduced-motion מכבה אנימציות ומעברים בכל האתר.</p>
            </Example>
          </div>
        </Block>

        {/* Actions */}
        <Block id="actions" title="כפתורים ותגיות" intro="כפתור ראשי (מג'נטה) אחד בכל אזור. השאר משני, מתאר או רפאים.">
          <Example
            title="Button"
            code={`<Button>שאלו</Button>
<Button variant="secondary" size="lg" iconEnd={<ArrowLeft />}>לכל הסרטונים</Button>
<Button loading>שולחים…</Button>
<Button asChild variant="outline"><Link href="/calculator/">למחשבון</Link></Button>
<ButtonLink href="/recommended/" variant="link">לכל בעלי המקצוע</ButtonLink>`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>ראשי</Button>
              <Button variant="secondary">משני</Button>
              <Button variant="outline">מתאר</Button>
              <Button variant="ghost">רפאים</Button>
              <ButtonLink href="#actions" variant="link">
                קישור
              </ButtonLink>
              <Button loading>שולחים</Button>
              <Button disabled>מושבת</Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="sm">קטן</Button>
              <Button size="md">בינוני</Button>
              <Button size="lg" iconStart={<CalendarCheck />}>
                גדול
              </Button>
              <Button size="xl" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
                ענק
              </Button>
            </div>
            <div className="mt-5 rounded-2xl bg-primary-600 p-5">
              <Button variant="inverse">על רקע מג׳נטה</Button>
            </div>
          </Example>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="IconButton" code={`<IconButton label="שמירה" icon={<Heart />} variant="outline" round />`}>
              <div className="flex flex-wrap items-center gap-3">
                <IconButton label="חיפוש" icon={<Search />} />
                <IconButton label="שמירה" icon={<Heart />} variant="outline" round />
                <IconButton label="שאלו" icon={<Sparkles />} variant="primary" round />
                <IconButton label="מועדף" icon={<Star />} variant="secondary" size="lg" />
              </div>
            </Example>
            <Example title="Badge" code={`<Badge tone="brand" dot>חדש</Badge>`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>ניטרלי</Badge>
                <Badge tone="brand" dot>
                  חדש
                </Badge>
                <Badge tone="ink">פודקאסט</Badge>
                <Badge tone="sand">דוד שמש</Badge>
                <Badge tone="success" dot>
                  מאומת
                </Badge>
                <Badge tone="outline">מעצבי פנים</Badge>
              </div>
            </Example>
          </div>
          <Example title="Chip" code={`<Chip selected count={42}>שלד</Chip>\n<ChipLink href={aiHref(q)}>{q}</ChipLink>`}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip selected count={244}>
                שלד
              </Chip>
              <Chip count={270}>תשתיות</Chip>
              <Chip>גמרים</Chip>
              <ChipLink href="#actions" size="sm">
                כמה עולה ריצוף למ״ר?
              </ChipLink>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 rounded-2xl bg-ink-950 p-4">
              <Chip tone="dark" selected>
                הכול
              </Chip>
              <Chip tone="dark">פודקאסט</Chip>
              <Chip tone="dark">סרטונים</Chip>
            </div>
          </Example>
        </Block>

        {/* Forms */}
        <Block id="forms" title="טפסים" intro="Field מחבר תווית, רמז ושגיאה לשדה (aria-describedby, aria-invalid). שדות טבעיים: מקלדת, טפסים וקוראי מסך עובדים כמו שהם.">
          <Example
            title="Field + Input / Select / Textarea"
            code={`<Field label="טלפון" hint="נחזור תוך יום עבודה" error={errors.phone} required>
  <Input type="tel" name="phone" dir="ltr" />
</Field>`}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="שם מלא" required>
                <Input placeholder="ישראל ישראלי" />
              </Field>
              <Field label="טלפון" hint="נחזור אליכם תוך יום עבודה" required>
                <Input type="tel" dir="ltr" placeholder="050-0000000" />
              </Field>
              <Field label="גודל הבית" error="נא להזין מספר בין 50 ל-1,000">
                <Input endAdornment="מ״ר" defaultValue="20000" />
              </Field>
              <Field label="שלב הבנייה">
                <Select placeholder="בחרו שלב">
                  {BUILD_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="חיפוש" hideLabel>
                <Input startIcon={<Search />} placeholder="חיפוש בעל מקצוע" />
              </Field>
              <Field label="הערות" optional className="sm:col-span-2">
                <Textarea placeholder="ספרו לנו על הפרויקט" rows={3} />
              </Field>
            </div>
          </Example>
          <Example title="Checkbox / Radio / Switch">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-3">
                <Checkbox label="אשמח להצטרף לקבוצת הוואטסאפ" defaultChecked />
                <Checkbox label="עדכונים במייל" description="פעם בשבוע, בלי ספאם" />
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold text-ink-800">רמת גמר</legend>
                <Radio name="finish" label="סטנדרט" defaultChecked />
                <Radio name="finish" label="גבוהה" />
              </fieldset>
              <div className="space-y-4">
                <Switch label="התראות על תוכן חדש" defaultChecked />
                <Switch label="מצב חיסכון בנתונים" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Radio name="plan" card label="בונים תקציב" description="תקציב מדויק ושלוש ישיבות ייעוץ" defaultChecked />
              <Radio name="plan" card label="בונים בית פלוס" description="כולל מכרז קבלנים" />
            </div>
          </Example>
        </Block>

        {/* Surfaces */}
        <Block id="surfaces" title="משטחים ותוכן">
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="Card (tones)">
              <div className="grid grid-cols-2 gap-3">
                <Card padding="sm">לבן</Card>
                <Card tone="sand" padding="sm">
                  חול
                </Card>
                <Card tone="ink" padding="sm">
                  דיו
                </Card>
                <Card tone="brand" padding="sm">
                  מותג
                </Card>
              </div>
            </Example>
            <Example title="Stat">
              <div className="grid grid-cols-3 gap-4">
                <Stat value={stats.videos.toLocaleString('he-IL')} label="סרטונים" />
                <Stat value={stats.hours.toLocaleString('he-IL')} label="שעות וידאו" />
                <Stat value={stats.articles.toLocaleString('he-IL')} label="מאמרים" />
              </div>
            </Example>
          </div>
          <Example title="SectionHeader" code={`<SectionHeader eyebrow="בונים בית TV" title="ערוץ הבנייה המוביל בישראל" highlight="ערוץ הבנייה" action={{ href: '/videos/', label: 'לכל הסרטונים' }} />`}>
            <SectionHeader
              className="!mb-0"
              eyebrow="בונים בית TV"
              title="ערוץ הבנייה המוביל בישראל"
              highlight="ערוץ הבנייה"
              description="סיורי שטח, טיפים מבעלי מקצוע ופרקי פודקאסט."
              action={{ href: '#surfaces', label: 'לכל הסרטונים' }}
            />
          </Example>
          <Example title="Accordion (details/summary)">
            <Accordion
              name="faq-demo"
              items={[
                { id: 'a', title: 'המחירים כוללים מע״מ?', content: 'לא. המחירים המוצגים אינם כוללים מע״מ.', defaultOpen: true },
                { id: 'b', title: 'האם הפגישה הראשונה בתשלום?', content: 'לא. פגישת ההיכרות היא ללא עלות וללא התחייבות.' },
              ]}
            />
          </Example>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="Steps + Progress">
              <Steps steps={BUILD_STAGES.slice(0, 4).map((s) => ({ label: s.label }))} current={2} />
              <Progress className="mt-6" value={3} max={7} label="התקדמות בפרויקט" showValue />
            </Example>
            <Example title="Steps (אנכי)">
              <Steps
                orientation="vertical"
                current={1}
                steps={[
                  { label: 'פרטי הפרויקט', description: 'אזור, גודל ושלב' },
                  { label: 'תקציב ראשוני', description: 'שלוש דקות' },
                  { label: 'פגישת ייעוץ', description: 'ללא עלות' },
                ]}
              />
            </Example>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="Skeleton">
              <div className="grid grid-cols-2 gap-4">
                <SkeletonCard />
                <div className="space-y-3">
                  <Skeleton className="h-6 w-2/3" />
                  <SkeletonText lines={4} />
                </div>
              </div>
            </Example>
            <Example title="EmptyState">
              <EmptyState
                icon={<Heart />}
                title="עוד לא שמרתם כלום"
                description="שמרו סרטונים, מאמרים ובעלי מקצוע, והם יחכו לכם כאן."
                actions={<Button size="sm">לסרטונים</Button>}
              />
            </Example>
          </div>
        </Block>

        {/* Media */}
        <Block id="media" title="מדיה ודירוג">
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="VideoThumb" code={`<VideoThumb src={thumb} duration={543} badge={<Badge tone="glass">פרק 112</Badge>} href={href} />`}>
              <div className="grid grid-cols-2 gap-4">
                <VideoThumb src="https://i.ytimg.com/vi/9803SaFIvXM/hqdefault.jpg" duration={1240} badge={<Badge tone="glass" size="sm">פרק 112</Badge>} />
                <VideoThumb src={null} duration={543} size="sm" />
              </div>
            </Example>
            <Example title="RatingStars + Avatar">
              <div className="space-y-4">
                <RatingStars value={10} scale={10} count={6} showValue />
                <RatingStars value={7.3} scale={10} count={2} size="lg" />
                <div className="flex items-center gap-3">
                  <Avatar name="תומר חן ריחאנה" size="lg" />
                  <Avatar name="דנה לוי" size="md" />
                  <Avatar name="בונים בית" size="sm" shape="rounded" />
                </div>
              </div>
            </Example>
          </div>
        </Block>

        {/* Overlays */}
        <Block id="overlays" title="שכבות וחיווי" intro="Dialog, Sheet ו-Drawer בנויים על dialog טבעי: מלכודת פוקוס, Escape, רקע, נעילת גלילה, החזרת פוקוס.">
          <Example title="Dialog / Sheet / Drawer" code={`const [open, setOpen] = useState(false);
<Dialog open={open} onClose={() => setOpen(false)} title="שמירת הפרויקט">…</Dialog>
<Sheet side="end" …>   <Drawer …>`}>
            <OverlayDemos />
          </Example>
          <Example title="Tabs" code={`<Tabs label="סוג תוכן" tabs={[{ id: 'videos', label: 'סרטונים', content: … }]} />`}>
            <TabsDemo />
          </Example>
          <div className="grid gap-4 lg:grid-cols-2">
            <Example title="Toast" code={`const { toast } = useToast();  // inside <ToastProvider>
toast({ title: 'נשמר', tone: 'success' });`}>
              <ToastDemo />
            </Example>
            <Example title="Tooltip">
              <TooltipDemo />
            </Example>
          </div>
        </Block>

        {/* Patterns */}
        <Block id="patterns" title="דפוסים">
          <ul className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ['ניווט מקונפיגורציה', <>Header, תפריט הנייד וה-Footer נבנים מ-<C>lib/nav.ts</C>. יעד חדש = שורה אחת. שם היועץ מ-<C>NEXT_PUBLIC_ADVISOR_NAME</C>.</>],
                ['פעולה צפה אחת', <>כפתור עגול אחד: ייעוץ, WhatsApp, שאלה, טלפון. מוסתר מעל ה-hero, מעל אזורים עם <C>data-floating-cta=&quot;hide&quot;</C> ובזמן גלילה למטה.</>],
                ['קצב אזורים', <><C>Section</C>: <C>py-14 sm:py-20</C>. נייר לבסיס, לבן להפרדה, חול לאזורים חמים, דיו לרגעי במה. לכל היותר אזור כהה אחד בכל גובה מסך.</>],
                ['מסלולי גלילה בנייד', <><C>className=&quot;rail&quot;</C>: כרטיס ברוחב כ-78% שמציץ מהצד. מ-<C>lg</C> ומעלה הופך לגריד.</>],
                ['RTL', <>רק מאפיינים לוגיים: <C>ms/me/ps/pe/start/end</C>. חץ קדימה הוא <C>ArrowLeft</C> עם <C>ltr:rotate-180</C>. מספרים בתוך <C>.num</C>.</>],
                ['תמונות LCP', <><C>next/image</C> עם <C>priority</C> רק לתמונה הראשית (<C>SmartImage</C>, <C>YouTubeFacade</C>). כל השאר <C>loading=&quot;lazy&quot;</C>.</>],
              ] as Array<[string, ReactNode]>
            ).map(([t, d]) => (
              <li key={t}>
                <Card padding="md" className="h-full">
                  <p className="text-title text-ink-900">{t}</p>
                  <p className="mt-2 text-body-sm text-ink-600">{d}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="flex justify-start">
            <ButtonLink href="#principles" variant="outline" iconEnd={<ArrowLeft className="rotate-90" />}>
              חזרה למעלה
            </ButtonLink>
          </div>
        </Block>
      </div>
    </>
  );
}
