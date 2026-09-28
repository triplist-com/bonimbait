'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalleryImage } from '@/lib/db/types';

/** Thumbnail grid + keyboard/swipe-friendly lightbox (native <dialog>). */
export default function Gallery({ images, businessName }: { images: GalleryImage[]; businessName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = images.length;

  const openAt = (i: number) => {
    setIndex(i);
    dialogRef.current?.showModal();
  };
  // RTL: "next" moves left visually, but the index still increases.
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (!dialog.open) return;
      if (e.key === 'ArrowLeft') step(1);
      if (e.key === 'ArrowRight') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  if (count === 0) return null;
  const current = images[index];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={`${img.url}-${i}`}>
            <button
              type="button"
              onClick={() => openAt(i)}
              className="group block aspect-[4/3] w-full overflow-hidden rounded-xl bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`הגדלת תמונה ${i + 1} מתוך ${count}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || `${businessName} - תמונה ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={`גלריה של ${businessName}`}
        className="m-auto max-h-[100dvh] max-w-[100vw] bg-transparent p-0 backdrop:bg-black/85"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div
          className="relative flex h-[100dvh] w-[100vw] items-center justify-center p-4"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            if (start !== null && end !== undefined && Math.abs(end - start) > 40) step(end > start ? 1 : -1);
            touchX.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt || `${businessName} - תמונה ${index + 1}`}
            className="max-h-[85dvh] max-w-full rounded-lg object-contain"
          />
          <p className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            {index + 1} / {count}
          </p>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="סגירה"
            className="absolute end-4 top-4 rounded-full bg-white/10 px-3 py-2 text-xl text-white hover:bg-white/20"
          >
            ✕
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="התמונה הקודמת"
                className="absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="התמונה הבאה"
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
              >
                ‹
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
