import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getVideo } from '@/app/api/_lib/data';
import LegacyVideoPage from '@/components/content/LegacyVideoPage';
import { decodeSlug } from '@/lib/content/db';
import { htmlToText } from '@/lib/content/sanitize';
import { buildContentMetadata, canonicalPath } from '@/lib/content/seo';
import { YOUTUBE_ID, loadVideoPage, videoThumb } from '@/lib/content/videos';
import { absoluteUrl } from '@/lib/site';
import VideoPageClient from './VideoPageClient';

/**
 * /video/<param>/ accepts two forms (PARITY_PLAN URL rule 3):
 *  1. a legacy WordPress Hebrew slug from `video_pages` (188 pages)
 *  2. a YouTube id: the existing AI-indexed video page (unchanged behaviour)
 */

export const revalidate = 3600;

interface VideoPageProps {
  params: { id: string };
}

async function loadLegacy(param: string) {
  try {
    return await loadVideoPage(decodeSlug(param));
  } catch (err) {
    console.error('[video] legacy lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  const legacy = await loadLegacy(params.id);
  if (legacy) {
    const path = `/video/${legacy.legacy_slug}/`;
    return buildContentMetadata({
      path,
      canonical: canonicalPath(legacy, path),
      title: legacy.title,
      seoTitle: legacy.seo_title,
      description: legacy.seo_description || htmlToText(legacy.excerpt || legacy.body_html, 160) || undefined,
      image: videoThumb(legacy),
      noindex: legacy.noindex,
      type: 'video.other',
    });
  }

  const video = YOUTUBE_ID.test(params.id) ? safeGetVideo(params.id) : null;
  if (!video) return { title: 'סרטון', description: 'צפו בסרטון בנושא בנייה פרטית - בונים בית' };

  const thumbnailUrl = video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`;
  const description = video.summary || `צפו בסרטון "${video.title}" בנושא ${video.category_name_he} - בונים בית`;
  return {
    title: video.title,
    description,
    alternates: { canonical: absoluteUrl(`/video/${params.id}/`) },
    openGraph: {
      title: video.title,
      description,
      type: 'video.other',
      url: absoluteUrl(`/video/${params.id}/`),
      images: [{ url: thumbnailUrl, width: 480, height: 360, alt: video.title }],
    },
    twitter: { card: 'summary_large_image', title: video.title, description, images: [thumbnailUrl] },
  };
}

function safeGetVideo(id: string) {
  try {
    return getVideo(id);
  } catch {
    return null;
  }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const legacy = await loadLegacy(params.id);
  if (legacy) return <LegacyVideoPage page={legacy} />;

  // Not a legacy slug: only YouTube ids reach the existing (client) video page.
  if (!YOUTUBE_ID.test(decodeSlug(params.id))) notFound();
  return <VideoPageClient />;
}
