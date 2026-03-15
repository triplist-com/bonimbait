interface VideoPlayerProps {
  youtubeId: string;
  title?: string;
  startTime?: number;
}

export default function VideoPlayer({ youtubeId, title, startTime }: VideoPlayerProps) {
  const src = `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1${
    startTime ? `&start=${Math.floor(startTime)}` : ''
  }`;

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gray-900 shadow-lg">
      <iframe
        src={src}
        title={title || 'Video player'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
