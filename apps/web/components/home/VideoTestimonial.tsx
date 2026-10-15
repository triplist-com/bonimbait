'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { SmartImage } from '@/components/ui/SmartImage';

/**
 * A short vertical testimonial clip behind a lazy poster: nothing but a small
 * WebP loads until the visitor presses play (then the MP4 starts with sound
 * and native controls).
 */
export default function VideoTestimonial({ video, poster, label }: { video: string; poster: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="overflow-hidden rounded-3xl bg-ink-900 shadow-card">
      <div className="relative aspect-[9/16] w-full">
        {playing ? (
          <video controls autoPlay playsInline className="absolute inset-0 size-full bg-ink-900 object-cover" aria-label={label}>
            <source src={video} type="video/mp4" />
          </video>
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 block size-full" aria-label={`הפעלת ${label}`}>
            <SmartImage src={poster} alt="" sizes="(min-width: 640px) 16rem, 62vw" className="transition-transform duration-500 group-hover:scale-[1.03]" />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 inline-flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-primary-600 shadow-lift transition-transform duration-300 group-hover:scale-110"
            >
              <Play className="size-5 translate-x-[-1px] fill-current" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="px-4 py-3 text-sm font-semibold text-white">{label}</figcaption>
    </figure>
  );
}
