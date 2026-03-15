import type { Metadata } from 'next';
import { getVideoDetail } from '@/lib/api';
import VideoPageClient from './VideoPageClient';

interface VideoPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  try {
    const video = await getVideoDetail(params.id);
    const thumbnailUrl = video.thumbnail_url || `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`;

    return {
      title: video.title,
      description: video.summary || `צפו בסרטון "${video.title}" בנושא ${video.category_name} - בונים בית`,
      alternates: {
        canonical: `https://bonimbait.com/video/${params.id}`,
      },
      openGraph: {
        title: video.title,
        description: video.summary || `סרטון בנושא ${video.category_name} - בונים בית`,
        type: 'video.other',
        url: `https://bonimbait.com/video/${params.id}`,
        images: [{ url: thumbnailUrl, width: 480, height: 360, alt: video.title }],
      },
      twitter: {
        card: 'summary_large_image',
        title: video.title,
        description: video.summary || `סרטון בנושא ${video.category_name}`,
        images: [thumbnailUrl],
      },
    };
  } catch {
    return {
      title: 'סרטון',
      description: 'צפו בסרטון בנושא בנייה פרטית - בונים בית',
    };
  }
}

export default function VideoPage() {
  return <VideoPageClient />;
}
