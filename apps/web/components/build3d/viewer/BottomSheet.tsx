'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mobile bottom sheet with three snap points (peek / half / full). The handle and
 * header area drag it; content scrolls when expanded. Height changes are applied to
 * the DOM directly while dragging (no re-render per pointer move).
 */
export default function BottomSheet({
  peek,
  header,
  children,
  onSnapChange,
}: {
  peek: number;
  header: React.ReactNode;
  children: React.ReactNode;
  onSnapChange?: (snap: 0 | 1 | 2) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<0 | 1 | 2>(0);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const heights = useCallback(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return [peek, Math.round(vh * 0.55), Math.round(vh * 0.88)] as const;
  }, [peek]);

  /** Peek keeps its full content height above the home indicator (safe area). */
  const cssHeight = useCallback((i: 0 | 1 | 2) => (i === 0 ? `calc(${peek}px + env(safe-area-inset-bottom, 0px))` : `${heights()[i]}px`), [peek, heights]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.style.height = cssHeight(snap);
    onSnapChange?.(snap);
  }, [snap, cssHeight, onSnapChange]);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || (e.target as HTMLElement).closest('button:not([data-handle]),a,summary,[role=slider],ul')) return;
    drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    const hs = heights();
    el.style.height = `${Math.max(hs[0] - 40, Math.min(hs[2] + 20, d.h + dy))}px`;
  };
  const onUp = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = '';
    const h = el.getBoundingClientRect().height;
    const hs = heights();
    if (!d.moved) {
      setSnap((s) => (s === 0 ? 1 : 0));
      el.style.height = cssHeight(snap === 0 ? 1 : 0);
      return;
    }
    let best: 0 | 1 | 2 = 0;
    hs.forEach((v, i) => {
      if (Math.abs(v - h) < Math.abs(hs[best] - h)) best = i as 0 | 1 | 2;
    });
    setSnap(best);
    el.style.height = cssHeight(best);
  };

  return (
    <div
      ref={ref}
      className="group/sheet pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[640px] flex-col rounded-t-[22px] border-t border-white/70 bg-white/[0.97] shadow-[0_-12px_40px_-12px_rgba(35,31,32,0.28)] backdrop-blur-xl transition-[height] duration-300 ease-out"
      style={{ height: `calc(${peek}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
      data-snap={snap}
    >
      <div className="shrink-0 cursor-grab touch-none px-4 pt-1" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* Drag handle; also a real button for keyboards (pointer taps toggle via onUp). */}
        <button
          type="button"
          data-handle
          aria-expanded={snap !== 0}
          aria-label={snap === 0 ? 'הרחבת הכרטיס' : 'כיווץ הכרטיס'}
          onClick={(e) => {
            if (e.detail === 0) setSnap((s) => (s === 0 ? 1 : 0));
          }}
          className="mx-auto -mt-1 flex h-7 w-20 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="h-1.5 w-10 rounded-full bg-ink-300" />
        </button>
        {header}
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3 ${snap === 0 ? 'invisible' : ''}`}>{children}</div>
    </div>
  );
}
