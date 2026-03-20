'use client';

import { useRef, useState } from 'react';

export default function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg group bg-gray-900 aspect-video">
      <video
        ref={videoRef}
        src="/promo.mp4"
        className="w-full h-full object-cover"
        playsInline
        muted
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={() => {
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
        }}
      />

      {/* Play button overlay */}
      {!isPlaying && (
        <button
          onClick={handlePlay}
          aria-label="הפעל סרטון"
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all duration-300 cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary/90 rounded-full flex items-center justify-center shadow-xl backdrop-blur-sm transition-transform duration-200 hover:scale-110">
            <svg
              className="w-7 h-7 sm:w-9 sm:h-9 text-white ms-1"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}
