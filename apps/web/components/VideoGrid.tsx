import type { Video } from '@/lib/types';
import VideoCard from './VideoCard';
import { VideoGridSkeleton } from './Skeleton';

interface VideoGridProps {
  videos: Video[];
  title?: string;
  isLoading?: boolean;
}

export default function VideoGrid({ videos, title, isLoading }: VideoGridProps) {
  if (isLoading) {
    return (
      <section>
        {title && <h2 className="text-xl font-bold text-gray-900 mb-6">{title}</h2>}
        <VideoGridSkeleton />
      </section>
    );
  }

  if (videos.length === 0) {
    return null;
  }

  return (
    <section>
      {title && <h2 className="text-xl font-bold text-gray-900 mb-6">{title}</h2>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}
