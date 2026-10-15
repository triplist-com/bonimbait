import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, CalendarCheck, Flame, Gauge, Handshake, Layers, MessageCircleQuestion, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { agoHe } from '@/lib/demo/format';
import { formatCount, formatNis, formatShare, formatUsd } from '@/lib/command/format';
import { minutesBetween } from '@/lib/command/period';
import type { CommandCenterData, PeriodDays } from '@/lib/command/types';
import ColumnSpark from './ColumnSpark';
import HotLeadsList from './HotLeadsList';
import JourneyStrip from './JourneyStrip';
import PeriodSelector from './PeriodSelector';
import UnansweredList from './UnansweredList';
import { CapBadge, PartnerStatusBadge } from './badges';
import { BarRows, Meter, ScoreChip } from './marks';
import { DeltaText, Tile, vsPreviousLabel } from './Tile';

export type CommandLinks = {
  leads: string | null;
  insights: string | null;
  leadsAnalytics: string | null;
  content: string | null;
  digest: string | null;
  pipelineSettings: string | null;
};

function MaybeLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={cn('hover:text-primary-700 hover:underline', className)}>
      {children}
    </Link>
  );
}

function ListCard({ id, title, description, action, children }: { id: string; title: string; description?: ReactNode; action?: { href: string | null; label: string }; children: ReactNode }) {
  return (
    <Card as="section" padding="none" aria-labelledby={`${id}-title`} className="min-w-0 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-title text-ink-900">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
        </div>
        {action?.href && (
          <Link href={action.href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800 hover:underline">
            {action.label}
            <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </Card>
  );
}

function PendingStrip({ pending }: { pending: NonNullable<CommandCenterData['pending']> }) {
  const items = [
    { n: pending.newLeads, label: 'לידים חדשים', href: '/admin/leads/?status=new' },
    { n: pending.pendingReviews, label: 'ביקורות ממתינות', href: '/admin/directory/reviews/' },
    { n: pending.openRequests, label: 'בקשות ניהול והצטרפות', href: '/admin/directory/requests/' },
    { n: pending.pendingBusinesses, label: 'עסקים ממתינים לאישור', href: '/admin/directory/businesses/?status=pending' },
  ];
  return (
    <section aria-label="ממתין לטיפול" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm shadow-xs">
      <span className="font-semibold text-ink-900">ממתין לטיפול</span>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="inline-flex items-center gap-1.5 text-ink-700 hover:text-primary-700 hover:underline">
          <bdi dir="ltr" className={cn('font-bold', i.n > 0 ? 'text-primary-700' : 'text-ink-500')}>
            {i.n}
          </bdi>
          {i.label}
        </Link>
      ))}
    </section>
  );
}

export default function CommandCenter({
  data,
  periodHref,
  links,
  toolbar,
}: {
  data: CommandCenterData;
  periodHref: (days: PeriodDays) => string;
  links: CommandLinks;
  toolbar?: ReactNode;
}) {
  const days = data.period.days;
  const vs = vsPreviousLabel(days);
  const { pipeline, consults, planMix, topLeads, partners, ai, unanswered } = data;
  const capTone = ai.capStatus === 'reached' ? 'danger' : ai.capStatus === 'near' ? 'warning' : ai.capStatus === 'off' ? 'neutral' : 'brand';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector current={days} href={periodHref} />
        {toolbar}
      </div>

      {data.pending && <PendingStrip pending={data.pending} />}

      <JourneyStrip journey={data.journey} vs={vs} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* 1. Pipeline */}
        <Tile
          id="tile-pipeline"
          title="צבר פוטנציאלי"
          icon={<Wallet />}
          explain="לידים פתוחים מהתקופה כפול הערך הצפוי של כל סוג ליד או מסלול (שווי עסקה × סיכוי סגירה)."
          value={formatNis(pipeline.openAgorot, { compact: true })}
          valueSize="lg"
          sub={
            <>
              <p className="text-sm text-ink-600">
                <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(pipeline.openCount)}</bdi> לידים פתוחים
                {pipeline.wonAgorot > 0 && (
                  <>
                    {' '}
                    · נסגרו <bdi dir="ltr" className="font-semibold text-ink-900">{formatNis(pipeline.wonAgorot, { compact: true })}</bdi>
                  </>
                )}
              </p>
              <p className="text-sm text-ink-600">
                נוצר בתקופה <bdi dir="ltr" className="font-semibold text-ink-900">{formatNis(pipeline.createdAgorot, { compact: true })}</bdi>
              </p>
              <DeltaText delta={pipeline.createdDelta} label={`בצבר שנוצר, ${vs}`} />
            </>
          }
          footer={links.pipelineSettings ? { href: links.pipelineSettings, label: 'הערך הצפוי לכל סוג ליד' } : null}
        >
          <BarRows
            rows={pipeline.byGroup.slice(0, 4).map((g) => ({
              key: g.key,
              label: g.label,
              value: g.openAgorot,
              display: formatNis(g.openAgorot, { compact: true }),
              note: `${g.count} פתוחים`,
            }))}
            empty="אין לידים פתוחים בתקופה."
          />
        </Tile>

        {/* 2. Consults booked */}
        <Tile
          id="tile-consults"
          title="פגישות ייעוץ"
          icon={<CalendarCheck />}
          explain="פגישות שנקבעו ביומן (Calendly), פעם אחת לכל מבקר ביום, ובקשות ייעוץ שהגיעו כליד."
          value={formatCount(consults.booked.current)}
          sub={
            <>
              <DeltaText delta={consults.booked} label={vs} />
              <p className="text-sm text-ink-600">
                בקשות ייעוץ: <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(consults.requests.current)}</bdi>
              </p>
              <DeltaText delta={consults.requests} label={`בבקשות, ${vs}`} />
            </>
          }
        >
          <ColumnSpark points={consults.daily} label={`פגישות שנקבעו ביום, ${days} הימים האחרונים`} unit="פגישות" />
        </Tile>

        {/* 3. Plan mix */}
        <Tile
          id="tile-plans"
          title="תמהיל מסלולים"
          icon={<Layers />}
          explain="כמה פניות והזמנות הגיעו לכל מסלול ליווי בתקופה, וכמה שולם עליהן."
          value={formatCount(planMix.totalLeads)}
          sub={
            <>
              <p className="text-sm text-ink-600">
                פניות למסלולים · הזמנות: <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(planMix.totalOrders)}</bdi> · שולם:{' '}
                <bdi dir="ltr" className="font-semibold text-ink-900">{formatNis(planMix.paidAgorot, { compact: true })}</bdi>
              </p>
              <DeltaText delta={planMix.paidDelta} label={`בתשלומים, ${vs}`} />
            </>
          }
        >
          <BarRows
            rows={planMix.rows.map((r) => ({
              key: r.slug,
              label: r.name,
              value: r.leads,
              display: `${formatCount(r.leads)} פניות`,
              note: r.orders > 0 ? `${r.orders} הזמנות · ${formatNis(r.paidAgorot, { compact: true })}` : 'אין הזמנות',
            }))}
            empty="אין מסלולי ליווי פעילים."
          />
        </Tile>

        {/* 4. Top leads by score */}
        <Tile
          id="tile-top-leads"
          title={topLeads.usesScores ? 'לידים חמים' : 'לידים פתוחים אחרונים'}
          icon={<Flame />}
          explain={
            topLeads.usesScores
              ? 'לידים עם ציון 70 ומעלה (מתוך 100, לפי שלב, תקציב, השלמת פרטים ומה ששאלו). בראש: הציון הגבוה, ואז החדש.'
              : 'עד שניקוד הלידים יופעל, מוצגים הלידים הפתוחים החדשים ביותר.'
          }
          value={formatCount(topLeads.usesScores ? topLeads.hotCount.current : pipeline.openCount)}
          sub={
            topLeads.usesScores ? (
              <>
                <DeltaText delta={topLeads.hotCount} label={vs} />
                <p className="text-sm text-ink-600">
                  ציון ממוצע <bdi dir="ltr" className="font-semibold text-ink-900">{topLeads.avgScore ?? '—'}</bdi> ·{' '}
                  <bdi dir="ltr">{formatShare(topLeads.scoredShare)}</bdi> מהלידים קיבלו ציון
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-600">לידים פתוחים בתקופה</p>
            )
          }
          footer={links.leads ? { href: links.leads, label: 'לתיבת הלידים' } : null}
        >
          {topLeads.top.length === 0 ? (
            <p className="text-sm text-ink-500">אין לידים פתוחים בתקופה.</p>
          ) : (
            <ul className="space-y-2">
              {topLeads.top.map((l) => (
                <li key={l.id} className="flex items-center gap-2.5 text-sm">
                  <ScoreChip score={l.score} band={l.band} />
                  <MaybeLink href={l.href}>
                    <bdi dir="ltr" className="font-mono font-semibold">{l.ref}</bdi>
                  </MaybeLink>
                  <span className="min-w-0 truncate text-ink-600">
                    {l.typeLabel} · {agoHe(l.minutesAgo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* 5. Partner health */}
        <Tile
          id="tile-partners"
          title="בריאות שותפים"
          icon={<Handshake />}
          explain="חשיפות נצפות (50% מהמשבצת לשנייה), קליקים ולידים לכל שותף, מול היעד החודשי של המסלול שלו."
          value={formatCount(partners.impressions.current, { compact: true })}
          sub={
            <>
              <p className="text-sm text-ink-600">
                חשיפות · קליקים <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(partners.clicks.current)}</bdi> · לידים{' '}
                <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(partners.leads.current)}</bdi>
              </p>
              <DeltaText delta={partners.impressions} label={`בחשיפות, ${vs}`} />
            </>
          }
          badge={
            partners.atRisk > 0 ? (
              <Badge tone="danger" size="sm" dot>
                {partners.atRisk === 1 ? 'שותף אחד בסיכון' : `${partners.atRisk} בסיכון`}
              </Badge>
            ) : partners.behind > 0 ? (
              <Badge tone="warning" size="sm" dot>
                {partners.behind === 1 ? 'שותף אחד מתחת לקצב' : `${partners.behind} מתחת לקצב`}
              </Badge>
            ) : partners.onTrack > 0 ? (
              <Badge tone="success" size="sm" dot>
                כולם בקצב
              </Badge>
            ) : null
          }
        >
          {partners.rows.length === 0 ? (
            <p className="text-sm text-ink-500">עוד אין חשיפות שותפים. הן יופיעו כשמשבצות השותפים יעלו לאתר.</p>
          ) : (
            <ul className="space-y-3">
              {partners.rows.slice(0, 4).map((p) => (
                <li key={p.id} className="text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate font-medium text-ink-900">
                      {p.name}
                      {p.tierLabel && <span className="font-normal text-ink-500"> · {p.tierLabel}</span>}
                    </span>
                    <PartnerStatusBadge status={p.status} />
                  </div>
                  {p.impressionsTarget != null && (
                    <Meter
                      className="mt-1.5"
                      share={p.pace ?? 0}
                      tone={p.status === 'at_risk' ? 'danger' : p.status === 'behind' ? 'warning' : 'brand'}
                      label={`${p.name}: ${formatCount(p.impressions)} מתוך יעד ${formatCount(p.impressionsTarget)} חשיפות`}
                    />
                  )}
                  <p className="mt-1 text-xs text-ink-500">
                    <bdi dir="ltr">{formatCount(p.impressions)}</bdi> חשיפות
                    {p.impressionsTarget != null && (
                      <>
                        {' '}
                        מתוך יעד <bdi dir="ltr">{formatCount(p.impressionsTarget)}</bdi>
                      </>
                    )}{' '}
                    · <bdi dir="ltr">{formatCount(p.leads)}</bdi> לידים
                    {p.costPerLeadNis != null && (
                      <>
                        {' '}
                        · <bdi dir="ltr">₪{formatCount(p.costPerLeadNis)}</bdi> לליד
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* 6. AI usage and cost */}
        <Tile
          id="tile-ai"
          title="שימוש ועלות AI"
          icon={<Gauge />}
          explain="כל קריאה למודל נרשמת עם העלות שלה. תקרה יומית קבועה: כשמגיעים אליה, התשובות עוברות לקישורים לסרטונים ולמאמרים, בלי עלות."
          value={formatUsd(ai.spentTodayUsd)}
          badge={<CapBadge status={ai.capStatus} />}
          sub={
            <>
              <p className="text-sm text-ink-600">
                היום, מתוך תקרה של <bdi dir="ltr" className="font-semibold text-ink-900">{formatUsd(ai.budgetUsd)}</bdi>
              </p>
              <Meter share={ai.capShare} tone={capTone} label={`עלות היום ${formatUsd(ai.spentTodayUsd)} מתוך ${formatUsd(ai.budgetUsd)}`} />
              <p className="pt-1 text-sm text-ink-600">
                בתקופה <bdi dir="ltr" className="font-semibold text-ink-900">{formatUsd(ai.cost.current)}</bdi>
                {ai.costPerQuestionUsd != null && (
                  <>
                    {' '}
                    · <bdi dir="ltr">{formatUsd(ai.costPerQuestionUsd)}</bdi> לשאלה
                  </>
                )}
                {ai.daysAtCap > 0 && <> · {ai.daysAtCap} ימים בתקרה</>}
              </p>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="mb-1.5 text-xs text-ink-600">
                שאלות ביום · <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(ai.questions.current)}</bdi>
              </p>
              <ColumnSpark points={ai.dailyQuestions} label={`שאלות ליועץ ביום, ${days} הימים האחרונים`} unit="שאלות" />
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-xs text-ink-600">עלות ביום ($)</p>
              <ColumnSpark points={ai.dailyCost} label={`עלות AI ביום בדולרים, ${days} הימים האחרונים`} unit="דולר" format="usd" />
            </div>
          </div>
        </Tile>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          id="list-hot-leads"
          title={topLeads.usesScores ? 'לידים חמים לטיפול' : 'לידים פתוחים לטיפול'}
          description={topLeads.usesScores ? 'ציון, מספר הליד, מה ידוע על הפרויקט, מקור וכמה זמן מחכה.' : 'החדשים ביותר. הציון יופיע כאן כשניקוד הלידים יופעל.'}
          action={{ href: links.leads, label: 'כל הלידים' }}
        >
          <HotLeadsList leads={data.hotLeads} emptyText="אין כרגע לידים פתוחים בתקופה." />
        </ListCard>

        <ListCard
          id="list-unanswered"
          title="השאלות שעוד לא עניתם עליהן"
          description={
            unanswered.source === 'insights' ? (
              <>
                <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(unanswered.totalAsks)}</bdi> שאלות של בונים על נושאים שאין עליהם סרטון או מאמר מספיק טוב
                {unanswered.runAt && <> · נותח {agoHe(minutesBetween(unanswered.runAt, data.generatedAt))}</>}
              </>
            ) : unanswered.source === 'questions' ? (
              'השאלות הנפוצות בתקופה. רעננו את התובנות כדי לראות על מה עוד אין לכם תוכן.'
            ) : (
              'השאלות שבונים שואלים יופיעו כאן, עם הנושאים שעוד אין עליהם תוכן.'
            )
          }
          action={{ href: links.insights, label: 'עשרת הסרטונים הבאים' }}
        >
          {unanswered.items.length > 0 ? (
            <UnansweredList items={unanswered.items} />
          ) : (
            <p className="flex items-start gap-2 text-sm text-ink-500">
              <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              עוד אין שאלות בתקופה.
            </p>
          )}
        </ListCard>
      </div>

      {(links.leadsAnalytics || links.content || links.digest) && (
        <nav aria-label="עוד בחדר הבקרה" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.leadsAnalytics && <MaybeLink href={links.leadsAnalytics} className="font-semibold text-primary-700">ניתוח לידים: מקורות, שלבים, אזורים וזמן תגובה</MaybeLink>}
          {links.content && <MaybeLink href={links.content} className="font-semibold text-primary-700">ביצועי תוכן</MaybeLink>}
          {links.digest && <MaybeLink href={links.digest} className="font-semibold text-primary-700">הסיכום השבועי</MaybeLink>}
        </nav>
      )}
    </div>
  );
}
