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

  useEffect(() => {
    const el = ref.current;
    if (el) el.style.height = `${heights()[snap]}px`;
    onSnapChange?.(snap);
  }, [snap, heights, onSnapChange]);

  const onDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || (e.target as HTMLElement).closest('button,a,[role=slider]')) return;
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
      el.style.height = `${hs[snap === 0 ? 1 : 0]}px`;
      return;
    }
    let best: 0 | 1 | 2 = 0;
    hs.forEach((v, i) => {
      if (Math.abs(v - h) < Math.abs(hs[best] - h)) best = i as 0 | 1 | 2;
    });
    setSnap(best);
    el.style.height = `${hs[best]}px`;
  };

  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[22px] border-t border-white/70 bg-white/92 shadow-[0_-12px_40px_-12px_rgba(35,31,32,0.28)] backdrop-blur-xl transition-[height] duration-300 ease-out"
      style={{ height: peek, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="shrink-0 cursor-grab touch-none px-4 pt-2" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#d8d1ca]" />
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}
