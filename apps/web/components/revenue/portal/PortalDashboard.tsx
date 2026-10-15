import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  Circle,
  Eye,
  FileText,
  MessageCircleQuestion,
  Phone,
  Search,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import DailyColumns from '@/components/platform/demo/DailyColumns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Steps';
import { cn } from '@/lib/cn';
import { agoHe } from '@/lib/demo/format';
import type { DealResult } from '@/lib/revenue/actions/portal';
import { LEAD_KIND_LABELS, type PortalView } from '@/lib/revenue/portal-server';
import type { Trend } from '@/lib/revenue/portal';
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/revenue/subscriptions';
import PartnerTierBadge from '../PartnerTierBadge';
import DealButton from './DealButton';

const NUM = new Intl.NumberFormat('he-IL');
const NIS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });

function Panel({ title, icon, children, className, action }: { title: string; icon: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-title text-ink-900">
          <span aria-hidden="true" className="text-primary-700 [&_svg]:size-5">
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TrendText({ t, days }: { t: Trend; days: number }) {
  if (t.pct === null) return <span className="text-caption text-ink-500">חדש: בתקופה הקודמת לא היה</span>;
  const tone = t.pct > 0 ? 'text-success-700' : t.pct < 0 ? 'text-danger-700' : 'text-ink-500';
  return (
    <span className="text-caption text-ink-500">
      <span dir="ltr" className={cn('font-semibold', tone)}>
        <span aria-hidden="true">{t.pct > 0 ? '▲' : t.pct < 0 ? '▼' : '•'}</span> {t.pct > 0 ? '+' : ''}
        {t.pct}%
      </span>{' '}
      לעומת {days} הימים הקודמים
    </span>
  );
}

function Kpi({ label, t, icon, days, hint }: { label: string; t: Trend; icon: ReactNode; days: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-xs sm:p-5">
      <p className="flex items-center gap-2 text-sm text-ink-600">
        <span aria-hidden="true" className="text-ink-400 [&_svg]:size-4">
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold text-ink-900">
        <span className="num">{NUM.format(t.value)}</span>
      </p>
      <p className="mt-1">
        <TrendText t={t} days={days} />
      </p>
      {hint && <p className="mt-1 text-caption text-ink-500">{hint}</p>}
    </div>
  );
}

/**
 * The pro and partner portal: what the platform did for this business in the
 * last 30 days (exposure, contact, leads and intent in its trade), how it
 * ranks among peers, what to complete, and the partner tiers. Server-safe and
 * data-driven: /partner-portal/ (real) and /platform/demo/pro/ (fixture).
 */
export default function PortalDashboard({
  view,
  upgradeAction,
  dealAction,
  reportHref,
  notice,
}: {
  view: PortalView;
  /** Server action for "שדרגו" (redirects to payment); omitted in the demo. */
  upgradeAction?: (fd: FormData) => Promise<void>;
  dealAction?: (fd: FormData) => Promise<DealResult>;
  /** The monthly partner report, for subscribed partners. */
  reportHref?: string | null;
  notice?: 'upgraded' | 'checkout_failed' | null;
}) {
  const { kpis, metrics, peer, completeness, days } = view;
  const currentRank = view.subscription ? view.tiers.find((t) => t.slug === view.subscription!.tierSlug)?.rank ?? 0 : 0;

  return (
    <div className="space-y-6">
      {notice === 'upgraded' && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-success-50 px-4 py-3 text-success-700">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
          המסלול הופעל. התג והקדימות יופיעו באתר תוך כמה דקות.
        </p>
      )}
      {notice === 'checkout_failed' && (
        <p role="alert" className="rounded-2xl bg-danger-50 px-4 py-3 text-danger-700">
          התשלום לא הושלם, והמסלול לא השתנה. אפשר לנסות שוב או לדבר איתנו.
        </p>
      )}

      <section aria-label="מדדים מרכזיים" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="צפיות בפרופיל" t={kpis.views} icon={<Eye />} days={days} />
        <Kpi label="חשיפות של הטלפון" t={kpis.reveals} icon={<Phone />} days={days} />
        <Kpi label="פניות" t={kpis.leads} icon={<FileText />} days={days} />
        <Kpi label="בונים ששאלו על התחום" t={kpis.askers} icon={<MessageCircleQuestion />} days={days} hint="שאלות באתר על העבודה שלכם" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <DailyColumns title="צפיות בפרופיל לפי יום" description={`${days} הימים האחרונים`} points={view.views} unit="צפיות" />

          <Panel
            title={`הפניות שלכם (${view.leads.length})`}
            icon={<Users />}
            action={
              reportHref ? (
                <Link href={reportHref} className="text-sm font-semibold text-primary-700 hover:underline">
                  הדוח החודשי
                </Link>
              ) : null
            }
          >
            {view.leads.length === 0 ? (
              <p className="text-body-sm text-ink-600">עדיין לא התקבלו פניות. פרופיל מלא ותמונות עבודה מביאים יותר פניות.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {view.leads.map((l) => (
                  <li key={l.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-bold text-ink-900">{l.name}</p>
                      <p className="text-caption text-ink-500">
                        <span dir="ltr" className="font-mono">
                          {l.ref}
                        </span>{' '}
                        · {agoHe(Math.max(0, Math.round((Date.now() - Date.parse(l.createdAt)) / 60_000)))}
                      </p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                      <Badge tone={l.kind === 'quote_request' ? 'brand' : 'neutral'} size="sm">
                        {LEAD_KIND_LABELS[l.kind]}
                      </Badge>
                      <Badge tone="outline" size="sm">
                        {l.statusLabel}
                      </Badge>
                      {l.project && <span className="text-ink-600">{l.project}</span>}
                    </p>
                    {l.message && <p className="mt-1.5 line-clamp-2 text-body-sm text-ink-700">{l.message}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      {l.phone && (
                        <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="font-semibold text-primary-700 hover:underline">
                          {l.phone}
                        </a>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} dir="ltr" className="text-ink-700 hover:underline">
                          {l.email}
                        </a>
                      )}
                      <span className="ms-auto">
                        {l.deal ? (
                          <Badge tone="success" icon={<Trophy />}>
                            עסקה נסגרה{l.deal.valueAgorot ? ` · ${NIS.format(l.deal.valueAgorot / 100)}` : ''}
                          </Badge>
                        ) : (
                          <DealButton businessId={view.business.id} leadId={l.id} action={dealAction} />
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="השלמת הפרופיל" icon={<BadgeCheck />}>
            <Progress value={completeness.score} label="שלמות הפרופיל" showValue />
            <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {completeness.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2.5 text-sm">
                  {i.done ? (
                    <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
                  ) : (
                    <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-300" />
                  )}
                  <span className="min-w-0">
                    {i.done ? (
                      <span className="text-ink-600">{i.label}</span>
                    ) : (
                      <a href={i.href} className="font-semibold text-ink-900 hover:text-primary-700 hover:underline">
                        {i.label}
                      </a>
                    )}
                    {!i.done && <span className="block text-caption text-ink-500">{i.why}</span>}
                  </span>
                  <span className="sr-only">{i.done ? 'הושלם' : 'עדיין חסר'}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="הביקוש בתחום שלכם" icon={<Search />}>
            <dl className="space-y-3 text-sm">
              {[
                ['בונים ששאלו על התחום באתר', metrics.category_askers],
                ['תיקי פרויקט באזורים שלכם ששאלו על התחום', metrics.regional_builders],
                ['הוסיפו אתכם לרשימה הקצרה', metrics.shortlist_adds],
                ['בקשות הצעת מחיר', metrics.quote_requests],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-700">{k}</dt>
                  <dd className="num text-lg font-bold text-ink-900">{NUM.format(Number(v))}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-caption text-ink-500">ב-{days} הימים האחרונים. בלי שמות: רק כמה בונים מחפשים בדיוק את מה שאתם עושים.</p>
          </Panel>

          <Panel title="המקום שלכם בין עמיתים" icon={<ChartNoAxesColumnIncreasing />}>
            {peer.peers > 1 && peer.view_rank ? (
              <>
                <p className="text-body text-ink-800">
                  מקום <span className="num text-2xl font-extrabold text-ink-900">{peer.view_rank}</span> מתוך{' '}
                  <span className="num font-semibold">{peer.peers}</span> {peer.specialty ?? 'בעלי מקצוע בתחום'} בצפיות בפרופיל
                </p>
                {peer.median_views !== undefined && (
                  <p className="mt-2 text-sm text-ink-600">
                    החציון בתחום: <span className="num font-semibold">{Math.round(peer.median_views)}</span> צפיות · אצלכם:{' '}
                    <span className="num font-semibold">{peer.views ?? 0}</span>
                  </p>
                )}
                <p className="mt-2 text-caption text-ink-500">ההשוואה אנונימית: אנחנו לא מציגים שמות של עסקים אחרים.</p>
              </>
            ) : (
              <p className="text-sm text-ink-600">אין עדיין מספיק עסקים בתחום כדי להשוות.</p>
            )}
          </Panel>

          <Panel title="ביקורות" icon={<Star />}>
            {view.reviews.count > 0 ? (
              <p className="text-body text-ink-800">
                <span className="num text-2xl font-extrabold text-ink-900">{view.reviews.percent ?? '–'}%</span> ציון משוקלל ·{' '}
                <span className="num font-semibold">{view.reviews.count}</span> חוות דעת
              </p>
            ) : (
              <p className="text-sm text-ink-600">עוד אין חוות דעת. שלחו ללקוח מרוצה את הקישור לעמוד חוות הדעת שלכם.</p>
            )}
            <Link href={`/business/${view.business.slug}/review/`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline">
              הקישור לחוות דעת
              <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
            </Link>
          </Panel>
        </aside>
      </div>

      <section aria-labelledby="tiers-title" className="rounded-[2rem] bg-sand-50 p-5 ring-1 ring-inset ring-sand-200 sm:p-8">
        <div className="max-w-2xl">
          <h2 id="tiers-title" className="text-headline-sm text-ink-900">
            {view.subscription ? `אתם במסלול ${view.subscription.tierName}` : 'מסלולי השותפות של בונים בית'}
          </h2>
          <p className="mt-2 text-body text-ink-600">
            {view.subscription
              ? `${SUBSCRIPTION_STATUS_LABELS[view.subscription.status]}${view.subscription.periodEnd ? ` · מתחדש ב-${new Date(view.subscription.periodEnd).toLocaleDateString('he-IL')}` : ''}. רוצים יותר חשיפה? אפשר לשדרג בכל רגע.`
              : 'שותפים מקבלים קדימות בנבחרת המומלצים ובהמלצות על בעלי מקצוע בתשובות באתר, תג בכרטיס העסק ודוח חודשי שמראה מה האתר הביא להם.'}
          </p>
        </div>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {view.tiers.map((t) => {
            const current = view.subscription?.tierSlug === t.slug;
            return (
              <li
                key={t.id}
                className={cn(
                  'flex flex-col rounded-3xl border bg-white p-5 shadow-card',
                  current ? 'border-primary-600 ring-1 ring-primary-600' : 'border-ink-100',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-title-lg text-ink-900">{t.name}</h3>
                  {current && (
                    <Badge tone="brand" size="sm">
                      המסלול שלכם
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-ink-900">
                  <span className="text-3xl font-extrabold">{NIS.format(t.priceAgorot / 100)}</span>
                  <span className="text-sm text-ink-600"> לחודש, לפני מע״מ</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-700">
                  {t.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-700" />
                      {b}
                    </li>
                  ))}
                </ul>
                {!current && (
                  <form action={upgradeAction} className="mt-5">
                    <input type="hidden" name="business_id" value={view.business.id} />
                    <input type="hidden" name="tier" value={t.slug} />
                    <Button
                      type={upgradeAction ? 'submit' : 'button'}
                      fullWidth
                      variant={t.rank > currentRank ? 'primary' : 'outline'}
                      disabled={!upgradeAction}
                      title={upgradeAction ? undefined : 'תצוגת הדגמה'}
                    >
                      {t.rank > currentRank ? `מעבר למסלול ${t.name}` : `מעבר ל${t.name}`}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-caption text-ink-500">התשלום מאובטח. אפשר לבטל בכל חודש. המחירים נכונים ל-2026.</p>
      </section>

      {view.business.badge && (
        <p className="flex items-center gap-2 text-sm text-ink-600">
          התג שלכם באתר: <PartnerTierBadge badge={view.business.badge} />
        </p>
      )}
    </div>
  );
}
