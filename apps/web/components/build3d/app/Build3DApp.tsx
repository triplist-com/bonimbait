'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import Landing from '@/components/build3d/landing/Landing';
import Analysis from '@/components/build3d/landing/Analysis';
import { DEFAULT_METHOD, readUrlMethod, type MethodId } from '@/lib/build3d/methods';

type Phase = 'landing' | 'analyzing' | 'viewer';

const loadViewer = () => import('./ViewerSlot');
const AssemblyViewer = dynamic(loadViewer, {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-50 text-ink/60">המודל נטען…</div>
  ),
});

export default function Build3DApp() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [viewerOn, setViewerOn] = useState(false);
  const [initialStep, setInitialStep] = useState<number | undefined>(undefined);
  const [deepLink, setDeepLink] = useState(false);
  const [method, setMethod] = useState<MethodId>(DEFAULT_METHOD);

  // ?step=N deep link goes straight to the viewer.
  useEffect(() => {
    setMethod(readUrlMethod());
    const raw = new URLSearchParams(window.location.search).get('step');
    if (raw !== null && /^\d+$/.test(raw)) {
      setInitialStep(parseInt(raw, 10));
      setDeepLink(true);
      setViewerOn(true);
      setPhase('viewer');
    }
  }, []);

  const start = useCallback(() => {
    void loadViewer(); // warm the viewer chunk while the animation plays
    // The viewer's intro opens on this crop; have it decoded before the hand-off.
    const plan = new Image();
    plan.src = '/build3d/plan-entrance.webp';
    setPhase('analyzing');
  }, []);
  const reveal = useCallback(() => setViewerOn(true), []);
  const done = useCallback(() => setPhase('viewer'), []);

  return (
    <div className="absolute inset-0">
      {viewerOn && (
        <div className="absolute inset-0 z-10">
          <AssemblyViewer key={method} className="h-full w-full" method={method} initialStep={initialStep} intro={deepLink ? 'none' : 'plan'} />
        </div>
      )}
      {phase === 'landing' && <Landing onStart={start} />}
      {phase === 'analyzing' && <Analysis onReveal={reveal} onDone={done} />}
    </div>
  );
}
