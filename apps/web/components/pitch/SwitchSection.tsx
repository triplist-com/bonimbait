import { CircleCheck, DatabaseBackup, Gauge, Languages, Lock, RotateCcw, SearchCheck, Timer } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  hebrewShortDate,
  parityRows,
  secondsLabel,
  speedup,
  type MigrationFacts,
  type ParityFacts,
  type SpeedFile,
} from '@/lib/pitch/facts';

const n = (value: number) => value.toLocaleString('he-IL');

/** Single-series bar list: one magenta, value at the bar tip (text tokens), bars ≤ 24px. */
function ParityBars({ byType }: { byType: Record<string, number> }) {
  const rows = parityRows(byType);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li
          key={row.key}
          title={`${row.label}: ${n(row.value)}`}
          className="grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-lg transition-colors hover:bg-primary-50/60"
        >
          <span className="text-sm text-ink-600">{row.label}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 rounded-e-[4px] bg-primary-600"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
            <span className="num text-sm font-bold text-ink-900">{n(row.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Emphasis pair: the old site in gray, the new one in magenta, labelled rows (never colour alone). */
function SpeedBars({ speed }: { speed: SpeedFile }) {
  const rows = [
    { key: 'old', label: 'האתר הקיים', ms: speed.old.lcpMs.simulate, tone: 'bg-ink-400' },
    { key: 'new', label: 'האתר החדש', ms: speed.new.lcpMs.simulate, tone: 'bg-primary-600' },
  ];
  const max = Math.max(...rows.map((r) => r.ms), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} title={`${row.label}: ${secondsLabel(row.ms)} שניות`} className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
          <span className="text-sm font-semibold text-ink-700">{row.label}</span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-5 rounded-e-[4px] ${row.tone}`} style={{ width: `${Math.max(4, (row.ms / max) * 100)}%` }} />
            <span className="whitespace-nowrap text-sm font-bold text-ink-900">
              <span className="num">{secondsLabel(row.ms)}</span> שנ׳
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SwitchSectionProps {
  parity: ParityFacts;
  speed: SpeedFile;
  migration: MigrationFacts;
  adminScreens: number;
  adminAreas: string[];
}

/** Section 4: why the switch is safe: URL parity, speed, content, the admin, and the way back. */
export default function SwitchSection({ parity, speed, migration, adminScreens, adminAreas }: SwitchSectionProps) {
  const direct = parity.byResult['200'] ?? 0;
  const redirected = parity.total - direct;
  const kb = (bytes: number) => n(Math.round(bytes / 1024));
  const migrated = [
    { key: 'posts', label: 'מאמרים' },
    { key: 'video_pages', label: 'עמודי וידאו' },
    { key: 'businesses', label: 'בעלי מקצוע' },
    { key: 'reviews', label: 'ביקורות' },
  ].filter((m) => migration.counts[m.key]);

  return (
    <Section tone="sand" id="switch" labelledBy="switch-title" className="scroll-mt-8 md:scroll-mt-0">
      <SectionHeader
        id="switch-title"
        eyebrow="מעבר בלי סיכון"
        title="גוגל ירגיש רק שהאתר מהיר יותר"
        highlight="מהיר יותר"
        description="כל הכתובות, כל התוכן וכל הדירוגים כבר עברו, ונבדקו. והמעבר עצמו הפיך בכל רגע."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* URL parity */}
        <Card as="article" padding="lg" className="lg:col-span-7" aria-labelledby="parity-title">
          <h3 id="parity-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <SearchCheck aria-hidden="true" className="size-5 text-primary-600" />
            דוח ההתאמה
          </h3>
          <p className="mt-1 max-w-lg text-sm text-ink-600">כל כתובת שגוגל מכיר באתר הקיים נבדקה מול האתר החדש: אותו נתיב, אותה תשובה.</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span dir="ltr" className="text-5xl font-extrabold tracking-tight text-ink-900 [unicode-bidi:isolate] sm:text-6xl">
              {n(parity.passed)}/{n(parity.total)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700 ring-1 ring-inset ring-success-100">
              <CircleCheck aria-hidden="true" className="size-4" />
              כל הכתובות עוברות
            </span>
          </p>
          <div className="mt-6">
            <ParityBars byType={parity.byType} />
          </div>
          <p className="mt-5 text-caption text-ink-500">
            <span className="num">{n(direct)}</span> עונות ישירות, <span className="num">{n(redirected)}</span> מפנות בדיוק כמו היום
            {parity.acceptedExceptions > 0 && (
              <>
                , מתוכן <span className="num">{parity.acceptedExceptions}</span> שינויים מכוונים (הכניסה לפורטל השותפים ועמוד תוצאות החיפוש
                הישן)
              </>
            )}
            . נבדק ב-<span className="num">{hebrewShortDate(parity.checkedAt)}</span>.
          </p>
        </Card>

        {/* Speed */}
        <Card as="article" padding="lg" className="lg:col-span-5" aria-labelledby="speed-title">
          <h3 id="speed-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <Gauge aria-hidden="true" className="size-5 text-primary-600" />
            מהירות בנייד
          </h3>
          <p className="mt-1 text-sm text-ink-600">הזמן עד שהתוכן הראשי מופיע (LCP), דף הבית:</p>
          <div className="mt-5">
            <SpeedBars speed={speed} />
          </div>
          <p className="mt-5 text-3xl font-extrabold tracking-tight text-ink-900">
            פי <span dir="ltr">{speedup(speed.old.lcpMs.simulate, speed.new.lcpMs.simulate)}</span> מהר יותר
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'ציון ביצועים', old: n(speed.old.performance.simulate), next: n(speed.new.performance.simulate) },
              { label: 'משקל הדף (KB)', old: kb(speed.old.bytes), next: kb(speed.new.bytes) },
              { label: 'בקשות', old: n(speed.old.requests), next: n(speed.new.requests) },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-paper px-2 py-2.5">
                <dt className="text-2xs font-medium text-ink-600 sm:text-xs">{m.label}</dt>
                <dd className="mt-1 text-sm font-bold text-ink-900">
                  <span className="text-ink-500 line-through decoration-ink-300">{m.old}</span>{' '}
                  <span aria-hidden="true" className="text-ink-400">
                    ←
                  </span>{' '}
                  <span>{m.next}</span>
                </dd>
              </div>
            ))}
          </dl>
          <dl className="mt-4 space-y-1 text-caption text-ink-500">
            <div className="flex gap-1.5">
              <dt className="shrink-0 whitespace-nowrap font-semibold text-ink-600">נמדד:</dt>
              <dd>
                <span className="num">{hebrewShortDate(speed.measuredAt)}</span>, <bdi>{speed.tool}</bdi>, נייד, חציון של{' '}
                <span className="num">{speed.runs}</span> מדידות לכל אתר
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 whitespace-nowrap font-semibold text-ink-600">שיטה:</dt>
              <dd>
                האטה מדומה, כמו בדוח של <bdi>PageSpeed Insights</bdi>. בהאטה בפועל בדפדפן:{' '}
                <span className="num">{secondsLabel(speed.old.lcpMs.devtools)}</span> מול{' '}
                <span className="num">{secondsLabel(speed.new.lcpMs.devtools)}</span> שנ׳
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 whitespace-nowrap font-semibold text-ink-600">האתר החדש:</dt>
              <dd>
                בניית <bdi>production</bdi> מקומית (<bdi>next start</bdi>), באותה מכונה ובאותן הגדרות
              </dd>
            </div>
          </dl>
        </Card>

        {/* Content migrated */}
        <Card as="article" padding="lg" className="lg:col-span-4" aria-labelledby="migrated-title">
          <h3 id="migrated-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <DatabaseBackup aria-hidden="true" className="size-5 text-primary-600" />
            התוכן כבר עבר
          </h3>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
            {migrated.map((m) => (
              <div key={m.key} className="flex flex-col">
                <dt className="order-2 text-sm text-ink-600">{m.label}</dt>
                <dd className="order-1 text-3xl font-extrabold tracking-tight text-ink-900">
                  <span dir="ltr" className="[unicode-bidi:isolate]">
                    {n(migration.counts[m.key])}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-600">ועוד החנות, תוכניות הליווי, הלידים והמשתמשים.</p>
          <p className="mt-1 text-caption text-ink-500">
            הועבר ב-<span className="num">{hebrewShortDate(migration.loadedAt)}</span>, ומתעדכן שוב לפני המעבר.
          </p>
        </Card>

        {/* Hebrew admin */}
        <Card as="article" padding="lg" className="lg:col-span-4" aria-labelledby="admin-title">
          <h3 id="admin-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <Languages aria-hidden="true" className="size-5 text-primary-600" />
            ניהול בעברית
          </h3>
          <p className="mt-1 text-sm text-ink-600">
            <span className="num font-bold text-ink-900">{adminScreens}</span> מסכי ניהול, על המושגים שהצוות כבר מכיר מוורדפרס: פוסטים,
            קטגוריות, מדיה ולידים.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {adminAreas.map((area) => (
              <li key={area} className="rounded-full bg-paper px-3 py-1 text-sm text-ink-700 ring-1 ring-inset ring-ink-100">
                {area}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <ButtonLink href="/admin/" size="sm" variant="outline" prefetch={false} iconStart={<Lock aria-hidden="true" />} title="דורש כניסה כמנהל">
              הניהול בעברית
            </ButtonLink>
          </div>
        </Card>

        {/* The way back */}
        <Card as="article" padding="lg" className="lg:col-span-4" aria-labelledby="rollback-title">
          <h3 id="rollback-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <RotateCcw aria-hidden="true" className="size-5 text-primary-600" />
            הדרך חזרה תמיד פתוחה
          </h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink-700">
            <li className="flex gap-2.5">
              <Timer aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-600" />
              <span>
                <strong className="text-ink-900">שבועיים במקביל.</strong> הצוות עובד על האתר החדש, ובינתיים וורדפרס ממשיך לרוץ כרגיל.
              </span>
            </li>
            <li className="flex gap-2.5">
              <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-600" />
              <span>
                <strong className="text-ink-900">מעבר ב-DNS, בשעה שקטה.</strong> צריך לחזור? אותו צעד, בדקות.
              </span>
            </li>
            <li className="flex gap-2.5">
              <DatabaseBackup aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-600" />
              <span>
                <strong className="text-ink-900">וורדפרס נשאר 30 יום</strong> במצב קריאה בלבד, מוכן לחזרה.
              </span>
            </li>
            <li className="flex gap-2.5">
              <SearchCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-600" />
              <span>
                <strong className="text-ink-900">מעקב יומי ב-Search Console,</strong> ובדיקות SEO ביום 30 וביום 90.
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </Section>
  );
}
