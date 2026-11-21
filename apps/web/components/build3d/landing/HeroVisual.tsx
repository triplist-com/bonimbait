'use client';

import { useEffect, useState } from 'react';
import frames from '@/public/build3d/landing/frames.json';
import { BUILD_TOTALS } from '@/lib/build3d/content/totals';

/**
 * Landing hero: real renders of the house going up, one fixed camera, crossfading
 * from the plan on the lot to the finished house at dusk. Frames come from
 * `data/tools/pw/cine-hero.mjs`; `-800.webp` twins are for phones.
 */

interface Frame {
  src: string;
  labelHe: string;
  step: number;
}

const FRAMES = frames as Frame[];
const LAST = FRAMES.length - 1;
const STEP_MS = 1700;
const HOLD_LAST_MS = 3600;
const FADE_MS = 700;

const small = (src: string) => src.replace(/\.webp$/, '-800.webp');

export default function HeroVisual({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStill(true);
      setIdx(LAST);
      return;
    }
    // Start the sequence only once every frame is decoded, so no step flashes blank.
    let cancelled = false;
    Promise.all(
      FRAMES.map(
        (f) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.srcset = `${small(f.src)} 800w, ${f.src} 1600w`;
            img.sizes = '(min-width: 1024px) 50vw, 100vw';
            img.src = f.src;
            img.decode().then(resolve, resolve);
          }),
      ),
    ).then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || still) return;
    const t = setTimeout(() => setIdx((i) => (i === LAST ? 0 : i + 1)), idx === LAST ? HOLD_LAST_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [idx, ready, still]);

  const cur = FRAMES[idx];

  return (
    <div className={className} aria-hidden>
      <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-ink-100 shadow-[0_24px_60px_-24px_rgba(35,31,32,.35)] ring-1 ring-[rgba(35,31,32,.08)]">
        {FRAMES.map((f, i) => {
          // Frames stack in build order; each new one fades in over the last.
          // On loop, the dusk frame fades out over frame 0 (the rest drop instantly underneath it).
          const shown = i === 0 || i <= idx;
          const animate = i === idx || (idx === 0 && i === LAST);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.src}
              src={f.src}
              srcSet={`${small(f.src)} 800w, ${f.src} 1600w`}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt=""
              draggable={false}
              decoding="async"
              loading={i === 0 || i === LAST ? 'eager' : 'lazy'}
              className="absolute inset-0 h-full w-full select-none object-cover"
              style={{
                objectPosition: '50% 58%',
                opacity: shown ? 1 : 0,
                transition: animate ? `opacity ${FADE_MS}ms ease-out` : 'none',
              }}
            />
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute bottom-3 start-3 end-3 flex items-end justify-between gap-3 sm:bottom-4 sm:start-4 sm:end-4">
          <div key={idx} className="b3d-hv-label rounded-full bg-white/95 px-3 py-1.5 text-[13px] font-bold text-ink shadow-sm backdrop-blur sm:text-sm">
            <span className="text-primary">שלב {cur.step}</span>
            <span className="text-ink/45"> מתוך {BUILD_TOTALS.steps} · </span>
            {cur.labelHe}
          </div>
          <div className="mb-2 hidden gap-1 min-[400px]:flex" dir="rtl">
            {FRAMES.map((f, i) => (
              <span
                key={f.src}
                className="h-1.5 w-4 rounded-full transition-colors duration-500"
                style={{ background: i <= idx ? '#fff' : 'rgba(255,255,255,.35)' }}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes b3d-hv-label { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .b3d-hv-label { animation: b3d-hv-label .35s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .b3d-hv-label { animation: none; } }
      `}</style>
    </div>
  );
}
