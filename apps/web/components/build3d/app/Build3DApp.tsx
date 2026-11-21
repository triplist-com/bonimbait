'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import Landing from '@/components/build3d/landing/Landing';
import Analysis from '@/components/build3d/landing/Analysis';
import MethodPicker from '@/components/build3d/landing/MethodPicker';
import { writeMethodUrl } from '@/components/build3d/landing/methodUi';
import { DEFAULT_METHOD, readUrlMethod, type MethodId } from '@/lib/build3d/methods';

/** landing → picking (method cards) → analyzing (2D plan reading) → viewer. */
type Phase = 'landing' | 'picking' | 'analyzing' | 'viewer';

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
  const [intro, setIntro] = useState<'plan' | 'none'>('plan');
  const [method, setMethod] = useState<MethodId>(DEFAULT_METHOD);

  const openPicker = useCallback(() => {
    void loadViewer(); // warm the viewer chunk while the user chooses
    setPhase('picking');
  }, []);

  // ?step=N deep link goes straight to the viewer (no intro); ?pick=1 opens the method cards.
  useEffect(() => {
    setMethod(readUrlMethod());
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('step');
    if (raw !== null && /^\d+$/.test(raw)) {
      setInitialStep(parseInt(raw, 10));
      setIntro('none');
      setViewerOn(true);
      setPhase('viewer');
    } else if (params.get('pick') === '1') openPicker();
  }, [openPicker]);

  const start = useCallback((m: MethodId) => {
    setMethod(m);
    writeMethodUrl(m);
    setInitialStep(undefined);
    setIntro('plan');
    void loadViewer();
    // The viewer's intro opens on this crop; have it decoded before the hand-off.
    const plan = new Image();
    plan.src = '/build3d/plan-entrance.webp';
    setPhase('analyzing');
  }, []);
  const reveal = useCallback(() => setViewerOn(true), []);
  const done = useCallback(() => setPhase('viewer'), []);

  // In-viewer method switch: remount at the mapped step, no intro replay.
  const switchMethod = useCallback((m: MethodId, step: number) => {
    writeMethodUrl(m, step);
    setInitialStep(step);
    setIntro('none');
    setMethod(m);
  }, []);

  return (
    <div className="absolute inset-0">
      {viewerOn && (
        <div className="absolute inset-0 z-10">
          <AssemblyViewer key={method} className="h-full w-full" method={method} initialStep={initialStep} intro={intro} onMethodChange={switchMethod} />
        </div>
      )}
      {phase === 'landing' && <Landing onStart={openPicker} />}
      {phase === 'picking' && <MethodPicker initial={method} onPick={start} onBack={() => setPhase('landing')} />}
      {phase === 'analyzing' && <Analysis method={method} onReveal={reveal} onDone={done} />}
    </div>
  );
}
