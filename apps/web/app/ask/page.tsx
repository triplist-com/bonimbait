import type { Metadata } from 'next';
import { Suspense } from 'react';
import AdvisorExperience from '@/components/advisor/AdvisorExperience';
import AdvisorOff from '@/components/advisor/AdvisorOff';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { isEnabled } from '@/lib/flags';
import { getKnowledgeStats } from '@/lib/home/data';
import { advisorName } from '@/lib/nav';
import { absoluteUrl } from '@/lib/site';

/**
 * /ask/: the advisor ("שאלו את בונים בית"). The page is static (ISR): the
 * question comes from ?q= in the browser, so the shell is served from the
 * cache and the answer starts streaming as soon as the page hydrates.
 */
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const name = advisorName();
  return {
    title: name,
    description: 'שאלו כל שאלה על בניית בית פרטי, וקבלו תשובה מהשטח מתוך הסרטונים, הפודקאסט והמאמרים של בונים בית, עם הרגע המדויק בסרטון.',
    alternates: { canonical: absoluteUrl('/ask/') },
    openGraph: { title: name, url: absoluteUrl('/ask/'), type: 'website' },
  };
}

function libraryLine(videos: number, articles: number): string {
  const parts: string[] = [];
  if (videos > 0) parts.push(`${videos.toLocaleString('he-IL')} סרטונים ופרקי פודקאסט`);
  if (articles > 0) parts.push(`${articles.toLocaleString('he-IL')} מאמרים`);
  return parts.length === 2 ? `${parts[0]} ו-${parts[1]}` : parts[0] ?? 'הסרטונים והמאמרים';
}

function AskShell() {
  return (
    <div className="container-page max-w-3xl pb-16 pt-10 sm:pt-16" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-12 w-3/4" />
      <SkeletonText lines={2} className="mt-5 max-w-2xl" />
      <Skeleton className="mt-8 h-16 w-full rounded-[1.75rem]" />
    </div>
  );
}

export default async function AskPage() {
  if (!isEnabled('advisor')) {
    return (
      <Suspense fallback={<AskShell />}>
        <AskShell />
        <AdvisorOff />
      </Suspense>
    );
  }
  const stats = await getKnowledgeStats();
  return (
    <Suspense fallback={<AskShell />}>
      <AdvisorExperience advisorLabel={advisorName()} libraryLine={libraryLine(stats.videos, stats.articles)} canSave={isEnabled('hub')} />
    </Suspense>
  );
}
