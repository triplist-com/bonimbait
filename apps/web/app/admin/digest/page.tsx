import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Mail } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/Card';
import { DemoNotice } from '@/components/command/DemoNotice';
import { isEnabled } from '@/lib/flags';
import { buildCommandCenter } from '@/lib/command/build';
import { commandUserDb } from '@/lib/command/db';
import { demoCommandCenter, demoInsights } from '@/lib/command/demo';
import { buildDigest } from '@/lib/command/digest';
import { loadInsights } from '@/lib/command/insights/store';
import { loadCommandInputs } from '@/lib/command/load';
import { israelDay } from '@/lib/command/period';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = { title: 'הסיכום השבועי' };

function weekLabel(from: string, to: string): string {
  const f = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
  return `${f.format(new Date(from))} עד ${f.format(new Date(to))}`;
}

/**
 * Preview of the weekly owner digest as an e-mail. Nothing is sent from here.
 * Editors and admins; ?demo=1 previews it on demo data.
 */
export default async function DigestPage({ searchParams }: { searchParams: { demo?: string } }) {
  if (!isEnabled('commandCenter')) notFound();
  const demo = searchParams.demo === '1';
  const data = demo ? demoCommandCenter(7) : buildCommandCenter(await loadCommandInputs({ periodDays: 7 }));
  const topics = demo
    ? demoInsights().topics
    : await loadInsights(commandUserDb())
        .then((r) => r.shown?.topics ?? [])
        .catch(() => []);
  const digest = buildDigest(data, topics, {
    siteUrl: SITE_URL,
    weekLabel: weekLabel(data.period.from, data.period.to),
    isDemo: demo,
  });

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title="הסיכום השבועי"
        description="כך ייראה המייל השבועי לבעל העסק: 7 הימים האחרונים במבט אחד. זו תצוגה מקדימה, שום דבר לא נשלח."
        back={{ href: `/admin/${demo ? '?demo=1' : ''}`, label: 'חדר הבקרה' }}
      />
      {demo && <DemoNotice exitHref="/admin/digest/" />}
      <Card padding="none" className="p-4 sm:p-5">
        <dl className="grid gap-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
          <dt className="flex items-center gap-1.5 text-ink-500">
            <Mail className="size-4" aria-hidden="true" />
            נושא
          </dt>
          <dd className="font-semibold text-ink-900">{digest.subject}</dd>
          <dt className="text-ink-500">תקציר</dt>
          <dd className="text-ink-700">{digest.preheader}</dd>
          <dt className="text-ink-500">נכון ל</dt>
          <dd className="text-ink-700">
            <bdi dir="ltr">{israelDay(data.generatedAt)}</bdi>
          </dd>
        </dl>
      </Card>
      <iframe
        title="תצוגה מקדימה של המייל השבועי"
        srcDoc={digest.html}
        sandbox=""
        className="h-[1500px] w-full rounded-2xl border border-ink-100 bg-white shadow-card"
      />
    </div>
  );
}
