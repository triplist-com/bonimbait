import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import AskForm from '@/components/ask/AskForm';
import SharedAnswerView from '@/components/advisor/SharedAnswerView';
import { answerTeaser } from '@/lib/advisor/client/share';
import { monthYear } from '@/lib/advisor/format';
import { loadSharedAnswer } from '@/lib/advisor/shares';
import { isEnabled } from '@/lib/flags';
import { wantsNumbers } from '@/lib/knowledge/moments';
import { advisorName } from '@/lib/nav';
import { absoluteUrl } from '@/lib/site';

/**
 * /ask/a/<id>/: an advisor answer someone chose to share (WhatsApp or a
 * copied link). Read only and not indexed for now. Snapshots never change,
 * so the page is cached once rendered.
 */
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await loadSharedAnswer(params.id).catch(() => null);
  if (!share) return { title: advisorName(), robots: { index: false, follow: false } };
  const description = answerTeaser(share.payload.answer, 160);
  const firstVideo = share.payload.sources.find((s) => s.kind === 'video');
  const image = firstVideo && firstVideo.kind === 'video' ? firstVideo.thumbnail_url : undefined;
  return {
    title: share.payload.question,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: absoluteUrl(`/ask/a/${share.id}/`) },
    openGraph: {
      title: share.payload.question,
      description,
      url: absoluteUrl(`/ask/a/${share.id}/`),
      type: 'article',
      ...(image ? { images: [{ url: image, alt: '' }] } : {}),
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: share.payload.question, description },
  };
}

export default async function SharedAnswerPage({ params }: Props) {
  const share = await loadSharedAnswer(params.id);
  if (!share) notFound();
  const when = monthYear(share.payload.at);
  return (
    <div className="container-page max-w-[52rem] pb-20 pt-6 sm:pt-10">
      <p className="eyebrow mb-6">
        <Sparkles aria-hidden="true" className="size-4" />
        {advisorName()} · תשובה ששותפה{when ? ` · ${when}` : ''}
      </p>
      <SharedAnswerView id={share.id} payload={share.payload} intent={{ cost: wantsNumbers(share.payload.question) }} canSave={isEnabled('hub')} />
      <section aria-labelledby="own-question" className="relative isolate mt-14 overflow-hidden rounded-3xl bg-ink-950 p-6 text-white shadow-lift sm:p-10" data-floating-cta="hide">
        <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10 opacity-60" />
        <h2 id="own-question" className="text-headline-sm text-white">
          יש לכם שאלה משלכם?
        </h2>
        <p className="mt-2 text-body text-white/75">שאלו, ותקבלו תשובה מהשטח עם הרגע המדויק בסרטון.</p>
        <AskForm size="lg" tone="dark" className="mt-6" label={advisorName()} />
      </section>
    </div>
  );
}
