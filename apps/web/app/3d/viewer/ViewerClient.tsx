'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { readUrlMethod, type MethodId } from '@/lib/build3d/methods';

const AssemblyViewer = dynamic(() => import('@/components/build3d/viewer/AssemblyViewer'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-ink-100 font-heebo text-[15px] text-ink-500" dir="rtl">
      טוענים את המודל…
    </div>
  ),
});

export default function ViewerClient() {
  const [intro, setIntro] = useState<'plan' | 'none' | null>(null);
  const [method, setMethod] = useState<MethodId>('concrete');
  useEffect(() => {
    setMethod(readUrlMethod());
    setIntro(new URLSearchParams(window.location.search).get('intro') === 'plan' ? 'plan' : 'none');
  }, []);
  if (!intro) return null;
  return (
    <div className="h-[100dvh] w-full">
      <AssemblyViewer key={method} method={method} intro={intro} />
    </div>
  );
}
