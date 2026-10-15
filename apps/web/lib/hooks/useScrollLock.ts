'use client';

import { useEffect } from 'react';

let locks = 0;
let saved: { overflow: string; gutter: string } | null = null;

/** Lock page scroll (ref-counted, so stacked overlays unlock in order). */
export function lockScroll(): () => void {
  const root = document.documentElement;
  if (locks === 0) {
    saved = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    // Keep the scrollbar's space so the page does not jump sideways.
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow;
      root.style.scrollbarGutter = saved.gutter;
      saved = null;
    }
  };
}

/** Locks page scroll while `active` is true. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockScroll();
  }, [active]);
}
