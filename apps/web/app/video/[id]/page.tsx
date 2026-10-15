import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStaticVideo, getVideos } from '@/app/api/_lib/data';
import RuntimeVideoPage from '@/components/autopilot/RuntimeVideoPage';
import LegacyVideoPage from '@/components/content/LegacyVideoPage';
import { loadPublishedRuntimeVideo, type RuntimeVideo } from '@/lib/autopilot/videos';
import { decodeSlug } from '@/lib/content/db';
import { htmlToText } from '@/lib/content/sanitize';
import { buildContentMetadata, canonicalPath } from '@/lib/content/seo';
import { YOUTUBE_ID, loadVideoPage, videoThumb } from '@/lib/content/videos';
import { absoluteUrl } from '@/lib/site';
import type { Video } from '@/lib/types';
import SaveButton from '@/components/hub/SaveButton';
import { isEnabled } from '@/lib/flags';
import VideoPageClient from './VideoPageClient';
import PartnerOfferSlot from '@/components/revenue/PartnerOfferSlot';
import { loadIndexedVideoDetail, loadRelatedIndexedVideos } from '@/lib/content/indexed-video';

/**
 * /video/<param>/ accepts two forms (PARITY_PLAN URL rule 3):
 *  1. a legacy WordPress Hebrew slug from `video_pages` (188 pages)
 *  2. a YouTube id: the existing AI-indexed video page (unchanged behaviour),
 *     or, for a video not in the static index, a video published by Content
 *     Autopilot (knowledge_sources, server-rendered)
 */

export const revalidate = 3600;

// Rendered on first request, then cached (ISR).
export function generateStaticParams() {
  return [];
}

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

  // 404 from metadata: app/loading.tsx streams the page after a 200 is sent.
  if (!YOUTUBE_ID.test(decodeSlug(params.id))) notFound();
  const video = safeGetVideo(params.id);
  if (!video) {
    // Neither in the static index nor published by Content Autopilot: a real 404.
    const runtime = await loadPublishedRuntimeVideo(params.id);
    if (!runtime) notFound();
    return runtimeMetadata(runtime);
  }

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

/** Static AI-index video only (a runtime video must not reach the client page, which reads videos.json). */
function safeGetVideo(id: string) {
  try {
    return getStaticVideo(id);
  } catch {
    return null;
  }
}

function runtimeMetadata(video: RuntimeVideo): Metadata {
  const path = `/video/${video.youtube_id}/`;
  const description = video.summary.summary || `צפו בסרטון "${video.title}" בנושא ${video.category_name} - בונים בית`;
  return {
    title: video.title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      title: video.title,
      description,
      type: 'video.other',
      url: absoluteUrl(path),
      images: [{ url: video.thumbnail_url, width: 480, height: 360, alt: video.title }],
    },
    twitter: { card: 'summary_large_image', title: video.title, description, images: [video.thumbnail_url] },
  };
}

/** Up to three static videos of the same category ("more on this topic"). */
function relatedVideos(categorySlug: string): Video[] {
  try {
    return getVideos({ category: categorySlug, limit: 3 }).videos.map((v) => ({
      id: v.id,
      youtube_id: v.youtube_id,
      title: v.title,
      channel_name: 'בונים בית',
      duration_seconds: v.duration_seconds,
      published_at: v.published_at,
      category_id: v.category_slug,
      category_name: v.category_name_he,
      category_slug: v.category_slug,
      thumbnail_url: v.thumbnail_url,
    }));
  } catch {
    return [];
  }
}

export default async function VideoPage({ params }: VideoPageProps) {
  const legacy = await loadLegacy(params.id);
  if (legacy) return <LegacyVideoPage page={legacy} />;

  // Not a legacy slug: only YouTube ids reach the video pages.
  if (!YOUTUBE_ID.test(decodeSlug(params.id))) notFound();
  if (!safeGetVideo(params.id)) {
    const runtime = await loadPublishedRuntimeVideo(params.id);
    if (!runtime) notFound();
    return <RuntimeVideoPage video={runtime} related={relatedVideos(runtime.category_slug)} />;
  }
  // Server-rendered initial data (same static index as /api/videos/[id]) so the
  // player poster is in the first HTML (LCP), not fetched after hydration.
  const initialVideo = loadIndexedVideoDetail(decodeSlug(params.id));
  const initialRelated = initialVideo ? loadRelatedIndexedVideos(initialVideo) : [];
  const saveSlot =
    isEnabled('hub') && initialVideo ? <SaveButton kind="video" refId={initialVideo.youtube_id} title={initialVideo.title} /> : null;
  const partnerSlot = initialVideo ? (
    <PartnerOfferSlot slot="video-page" context={{ topic: `${initialVideo.title} ${initialVideo.category_name ?? ''}`, placement: 'video' }} />
  ) : null;
  return (
    <VideoPageClient initialVideo={initialVideo} initialRelated={initialRelated} saveSlot={saveSlot} partnerSlot={partnerSlot} />
  );
}
