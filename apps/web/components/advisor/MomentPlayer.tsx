'use client';

/**
 * The exact moment, playing inline: the YouTube player (privacy-enhanced
 * domain) starts at the second the answer comes from, without leaving the
 * page. Mounted only after a click (the lite facade is the source card), so no
 * player loads with the page.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { youtubeEmbedUrl } from '@/components/ui/YouTubeFacade';
import { clock } from '@/lib/advisor/format';

export interface MomentPlayerProps {
  youtubeId: string;
  title: string;
  second: number;
  quote?: string;
  n?: number;
  onClose: () => void;
}

export default function MomentPlayer({ youtubeId, title, second, quote, n, onClose }: MomentPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Bring the player into view when a moment starts (not on every re-render).
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [youtubeId, second]);

  return (
    <div ref={ref} className="scroll-mt-24 overflow-hidden rounded-3xl bg-ink-950 shadow-lift motion-safe:animate-scale-in">
      <div className="relative aspect-video" dir="ltr">
        <iframe
          key={`${youtubeId}-${second}`}
          src={youtubeEmbedUrl(youtubeId, second)}
          title={`${title} (מ-${clock(second)})`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      </div>
      <div className="flex items-start gap-3 p-4 text-white">
        <div className="min-w-0 flex-1">
          <p className="text-caption text-white/65">
            {n ? `מקור ${n} · ` : ''}מתנגן מ-<span className="num">{clock(second)}</span>
          </p>
          <p className="mt-0.5 line-clamp-1 font-semibold">{title}</p>
          {quote && <p className="mt-1 line-clamp-2 text-body-sm text-white/75">{quote}</p>}
        </div>
        <IconButton label="סגירת הנגן" icon={<X />} variant="glass" size="sm" round onClick={onClose} />
      </div>
    </div>
  );
}
