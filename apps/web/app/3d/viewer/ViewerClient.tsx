'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { readUrlMethod, type MethodId } from '@/lib/build3d/methods';
import { writeMethodUrl } from '@/components/build3d/landing/methodUi';

const AssemblyViewer = dynamic(() => import('@/components/build3d/viewer/AssemblyViewer'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-ink-100 font-heebo text-[15px] text-ink-500" dir="rtl">
      טוענים את המודל…
    </div>
  ),
});

interface ViewState {
  method: MethodId;
  intro: 'plan' | 'none';
  /** 1-based; undefined = the URL's ?step= (read by the viewer). */
  step?: number;
}

export default function ViewerClient() {
  const [view, setView] = useState<ViewState | null>(null);
  useEffect(() => {
    setView({ method: readUrlMethod(), intro: new URLSearchParams(window.location.search).get('intro') === 'plan' ? 'plan' : 'none' });
  }, []);
  // Method switch: remount at the mapped step, no intro replay.
  const onMethodChange = useCallback((method: MethodId, step: number) => {
    writeMethodUrl(method, step);
    setView({ method, intro: 'none', step });
  }, []);
  if (!view) return null;
  return (
    <div className="h-[100dvh] w-full">
      <AssemblyViewer key={view.method} method={view.method} initialStep={view.step} intro={view.intro} onMethodChange={onMethodChange} />
    </div>
  );
}
