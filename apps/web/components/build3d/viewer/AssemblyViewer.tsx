'use client';

/**
 * Plan → 3D assembly viewer (docs/build3d/SPEC.md §1.3). Default export, client-only
 * (load with next/dynamic, ssr: false).
 *
 * Props:
 *   initialStep — 1-based step to open at (as shown in the UI and in `?step=`).
 *                 Defaults to the URL's `?step=` or 1.
 *   intro       — 'plan': open top-down on the plan sheet and glide into 3D (continues
 *                 the landing's 2D analysis animation). Only applies when opening at step 1.
 *   className   — sizing of the root (it fills its parent: give the parent a height).
 */
import { ChevronLeft, ChevronRight, Focus, Highlighter, House, Layers, ListOrdered, Maximize2, Minimize2, Pause, Play, Rotate3d, ScanEye, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { house } from '@/lib/build3d/house';
import { getTimeline } from '@/lib/build3d/engine/timeline';
import { DEFAULT_METHOD, type MethodId } from '@/lib/build3d/methods';
import Stage, { type Insets } from './Stage';
import StepCard, { StepHeader, StepNumbers } from './StepCard';
import PartsPanel from './PartsPanel';
import StepProgress from './StepProgress';
import ViewMenu, { type ViewToggle } from './ViewMenu';
import { useReducedMotion } from './useReducedMotion';
import StepList from './StepList';
import Scrubber from './Scrubber';
import BottomSheet from './BottomSheet';
import Summary from './Summary';
import MethodSwitcher from './MethodSwitcher';
import { divergenceStep, equivalentStep } from './methodSwitch';
import { setPhaseMethod } from '@/lib/build3d/engine/phases';
import { writeMethodUrl } from '../landing/methodUi';
import { FOCUS } from './format';

export interface AssemblyViewerProps {
  initialStep?: number;
  intro?: 'plan' | 'none';
  /** Construction method (docs/build3d/METHODS.md). Remount (key) to switch. */
  method?: MethodId;
  /** Switch request (1-based step already mapped): the parent remounts with the new method. */
  onMethodChange?: (method: MethodId, step: number) => void;
  className?: string;
}

const DAY_BG = 'linear-gradient(180deg, #E4EDF5 0%, #F1F2F0 42%, #F6F2EC 72%, #F2ECE3 100%)';
const DUSK_BG = 'linear-gradient(180deg, #2E3A58 0%, #6E5A72 38%, #C98F78 70%, #E8C8A4 100%)';
const PEEK = 272;

function readUrlStep(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = Number.parseInt(new URLSearchParams(window.location.search).get('step') ?? '', 10);
  return Number.isFinite(v) && v >= 1 ? v : undefined;
}

export default function AssemblyViewer({ initialStep, intro = 'none', method = DEFAULT_METHOD, onMethodChange, className = '' }: AssemblyViewerProps) {
  const timeline = useMemo(() => getTimeline(house, method), [method]);
  setPhaseMethod(method); // phase names in the card / scrubber / list follow the method
  const n = timeline.steps.length;
  const clamp = useCallback((i: number) => Math.max(0, Math.min(n - 1, i)), [n]);
  const [step, setStep] = useState(() => clamp((initialStep ?? readUrlStep() ?? 1) - 1));
  const [introRunning, setIntroRunning] = useState(() => intro === 'plan' && step === 0);
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [xray, setXray] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [emphasis, setEmphasis] = useState(true);
  const reducedMotion = useReducedMotion();
  const [listOpen, setListOpen] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  const [summary, setSummary] = useState(false);
  const [summaryTick, setSummaryTick] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [cardW, setCardW] = useState(392);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const cur = timeline.steps[step];
  const dusk = cur?.view?.lighting === 'dusk';

  // Layout mode.
  useEffect(() => {
    // Bottom-sheet layout on phones, small tablets and portrait tablets (the side card would crop the house).
    const mq = window.matchMedia('(max-width: 900px), (orientation: portrait) and (max-width: 1199px)');
    const update = () => {
      setMobile(mq.matches);
      setCardW(Math.round(Math.min(392, Math.max(320, window.innerWidth * 0.3))));
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const go = useCallback(
    (i: number, fromPlay = false) => {
      setStep(clamp(i));
      if (!fromPlay) setPlaying(false);
    },
    [clamp],
  );

  /** Relative move (functional, so fast repeated key presses accumulate). */
  const goRel = useCallback(
    (delta: number) => {
      setStep((s) => clamp(s + delta));
      setPlaying(false);
    },
    [clamp],
  );

  /** Switch method: 'same' = the phase-equivalent step (header), 'diverge' = where the builds part (finale). */
  const switchMethod = useCallback(
    (m: MethodId, to: 'same' | 'diverge') => {
      if (m === method) return;
      const next = getTimeline(house, m);
      const i = to === 'same' ? equivalentStep(timeline, step, next) : divergenceStep(timeline, next);
      if (onMethodChange) onMethodChange(m, i + 1);
      else {
        writeMethodUrl(m, i + 1);
        window.location.reload();
      }
    },
    [method, timeline, step, onMethodChange],
  );
  const openSummary = useCallback(() => {
    setSummary(true);
    setSummaryTick((t) => t + 1);
  }, []);

  // Keep ?step= in sync (1-based), without adding history entries.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(step + 1));
    window.history.replaceState(window.history.state, '', url.toString());
  }, [step]);

  // Autoplay: wait for the step's animation plus a short reading pause.
  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      setPlaying(false);
      return;
    }
    // Animation + a reading pause that scales with the text (about 2.4 to 3.6 s).
    const read = Math.min(3600, Math.max(2400, (timeline.steps[step].descHe?.length ?? 0) * 14));
    const ms = Math.max(3800, timeline.span[step] * 1000 + 800 + read) + (introRunning ? 3000 : 0);
    const t = window.setTimeout(() => go(step + 1, true), ms);
    return () => window.clearTimeout(t);
  }, [playing, step, n, timeline, go, introRunning]);

  // Finale summary after the last step's animation.
  useEffect(() => {
    setSummary(false);
    setSummaryTick(0);
    if (step !== n - 1) return;
    const t = window.setTimeout(() => setSummary(true), (timeline.span[step] + 1.8) * 1000);
    return () => window.clearTimeout(t);
  }, [step, n, timeline]);

  // Keyboard: ← next / → previous (RTL), space play/pause, Home/End.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageDown') {
        e.preventDefault();
        goRel(1);
      } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
        e.preventDefault();
        goRel(-1);
      } else if (e.key === ' ') {
        // Space activates a focused button / link / disclosure; the slider keeps its own keys.
        if (el?.closest('button,a,summary,[role=slider],[role=button]')) return;
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, go, goRel]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const insets: Insets = useMemo(
    () =>
      mobile
        ? { top: 64, right: 0, bottom: PEEK, left: 0 }
        : { top: 76, right: cardW + 32, bottom: 100, left: listOpen ? 318 : 0 },
    [mobile, listOpen, cardW],
  );

  const ui = !introRunning;
  const onIntroDone = useCallback(() => setIntroRunning(false), []);
  // Leaving the plan step (arrow keys, a click) ends the intro early; the UI must come back.
  useEffect(() => {
    if (step !== 0) setIntroRunning(false);
  }, [step]);

  const viewToggles: ViewToggle[] = [
    { label: 'הדגשת החלקים החדשים', icon: <Highlighter size={18} />, active: emphasis, onClick: () => setEmphasis((v) => !v) },
    { label: 'תצוגה מקדימה של השלבים הבאים', icon: <Layers size={18} />, active: ghost, onClick: () => setGhost((v) => !v) },
    { label: 'שקיפות אוטומטית', icon: <ScanEye size={18} />, active: xray, onClick: () => setXray((v) => !v) },
    { label: 'סיבוב אוטומטי', icon: <Rotate3d size={18} />, active: autoRotate, onClick: () => setAutoRotate((v) => !v) },
  ];
  const nextStep = step < n - 1 ? { title: timeline.steps[step + 1].titleHe, onGo: () => goRel(1) } : undefined;

  const toggles = (
    <>
      <ToolButton label="כל השלבים" active={listOpen} onClick={() => setListOpen((v) => !v)}>
        <ListOrdered size={18} />
      </ToolButton>
      <span className="mx-0.5 h-5 w-px bg-ink-200" />
      {mobile ? (
        <ViewMenu items={viewToggles} />
      ) : (
        viewToggles.map((t) => (
          <ToolButton key={t.label} label={t.label} active={t.active} onClick={t.onClick}>
            {t.icon}
          </ToolButton>
        ))
      )}
      <ToolButton label="איפוס מבט" onClick={() => setResetTick((v) => v + 1)}>
        <Focus size={18} />
      </ToolButton>
      {!mobile && (
        <ToolButton label={fullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </ToolButton>
      )}
    </>
  );

  const nav = (big: boolean) => (
    <div className={`flex items-center gap-1.5 ${big ? '' : 'w-full'}`}>
      <button
        onClick={() => goRel(-1)}
        disabled={step === 0}
        aria-label="השלב הקודם"
        title="השלב הקודם (→)"
        className={`grid shrink-0 place-items-center rounded-full border border-ink-200 bg-white text-ink transition hover:bg-ink-50 disabled:opacity-35 ${FOCUS} ${big ? 'h-11 w-11' : 'h-12 w-12'}`}
      >
        <ChevronRight size={20} />
      </button>
      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'עצירה' : 'הפעלה אוטומטית'}
        title={playing ? 'עצירה (רווח)' : 'הפעלה אוטומטית (רווח)'}
        className={`grid shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-black ${FOCUS} ${big ? 'h-11 w-11' : 'h-12 w-12'}`}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="-me-0.5" />}
      </button>
      <button
        onClick={() => (step === n - 1 ? openSummary() : goRel(1))}
        aria-label={step === n - 1 ? 'סיכום והשוואה בין שיטות' : 'השלב הבא'}
        title={step === n - 1 ? 'סיכום והשוואה בין שיטות' : 'השלב הבא (←)'}
        className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-primary font-bold text-white shadow-[0_8px_18px_-8px_rgba(230,21,89,0.9)] transition hover:bg-primary-700 disabled:opacity-40 ${FOCUS} ${big ? 'h-11 pe-3 ps-4 text-[15px]' : 'h-12 flex-1 pe-3 ps-4 text-[16px]'}`}
      >
        {step === n - 1 ? 'סיכום והשוואה' : 'הבא'}
        <ChevronLeft size={19} />
      </button>
    </div>
  );

  return (
    <div ref={rootRef} dir="rtl" lang="he" className={`relative h-full w-full overflow-hidden font-heebo text-ink ${className}`}>
      <div className="absolute inset-0" style={{ background: DAY_BG }} />
      <div className="absolute inset-0 transition-opacity duration-[1600ms]" style={{ background: DUSK_BG, opacity: dusk ? 1 : 0 }} />

      <div className="absolute inset-0" onPointerDownCapture={() => setPlaying(false)} onWheelCapture={() => setPlaying(false)}>
      <Stage
        house={house}
        timeline={timeline}
        step={step}
        ghost={ghost}
        xray={xray}
        autoRotate={autoRotate}
        resetTick={resetTick}
        intro={intro === 'plan' && introRunning}
        insets={insets}
        mobile={mobile}
        lighting={dusk ? 'dusk' : 'day'}
        onIntroDone={onIntroDone}
        emphasis={emphasis}
        reducedMotion={reducedMotion}
        callout={ui && !dusk && step > 0 ? { n: step + 1, label: cur.titleHe } : null}
      />
      </div>

      {/* Top bar */}
      <header
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 transition-all duration-700 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] ${ui ? 'opacity-100' : '-translate-y-3 opacity-0'}`}
      >
        {/* Logo + construction-method switcher (wraps under the logo when the row is too narrow) */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <a
          href="/"
          aria-label="בונים בית, לאתר הראשי"
          className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-white/[0.85] py-1.5 pe-1.5 ps-1.5 min-[430px]:pe-3.5 shadow-[0_6px_24px_-10px_rgba(35,31,32,0.3)] backdrop-blur-xl"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white">
            <House size={19} strokeWidth={2.4} />
          </span>
          <span className="hidden whitespace-nowrap leading-tight min-[430px]:block">
            <span className="block text-[15px] font-black tracking-[-0.01em]">בונים בית</span>
            <span className="block text-[11.5px] font-medium text-ink-600">מתוכנית לבית</span>
          </span>
        </a>
        <MethodSwitcher method={method} onSelect={(m) => switchMethod(m, 'same')} />
        </div>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl bg-white/[0.85] p-1 shadow-[0_6px_24px_-10px_rgba(35,31,32,0.3)] backdrop-blur-xl">
          {toggles}
        </div>
      </header>

      {!mobile && (
        <>
          {/* Step card (start side) */}
          <aside
            className={`pointer-events-none absolute bottom-[100px] right-4 top-[76px] z-10 transition-all duration-700 ${ui ? 'opacity-100' : 'translate-x-6 opacity-0'}`}
            style={{ width: cardW }}
          >
            <div tabIndex={0} aria-label="פרטי השלב" className="pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_50px_-18px_rgba(35,31,32,0.35)] backdrop-blur-xl [scrollbar-width:thin]">
              <div key={step} className="animate-fade-in">
                <StepCard step={cur} index={step} total={n} cumCost={timeline.cumCostILS[step]} cumDays={timeline.cumDays[step]} next={nextStep} />
              </div>
            </div>
          </aside>

          {/* Steps list (end side) */}
          {listOpen && (
            <aside className={`absolute bottom-[100px] left-4 top-[76px] z-10 w-[290px] transition-all duration-700 ${ui ? 'opacity-100' : '-translate-x-6 opacity-0'}`}>
              <div className="h-full overflow-y-auto overscroll-contain rounded-3xl border border-white/70 bg-ink-50/85 p-3 shadow-[0_18px_50px_-18px_rgba(35,31,32,0.3)] backdrop-blur-xl [scrollbar-width:thin]">
                <StepList timeline={timeline} step={step} onSelect={(i) => go(i)} />
              </div>
            </aside>
          )}

          {/* Bottom bar */}
          <footer
            className={`absolute bottom-4 left-4 right-4 z-10 flex items-center gap-4 rounded-2xl border border-white/70 bg-white/[0.88] px-3 py-2.5 shadow-[0_18px_50px_-18px_rgba(35,31,32,0.35)] backdrop-blur-xl transition-all duration-700 ${ui ? 'opacity-100' : 'translate-y-4 opacity-0'}`}
          >
            <StepProgress key={step} seconds={timeline.span[step]} className="absolute inset-x-6 -top-px" />
            {nav(true)}
            <div className="min-w-0 flex-1 px-1">
              <Scrubber timeline={timeline} step={step} onSeek={(i) => go(i)} />
            </div>
            <div className="shrink-0 ps-1 text-[13px] font-semibold tabular-nums text-ink-600">
              <span dir="ltr">{step + 1} <span className="text-ink-300">/</span> {n}</span>
            </div>
          </footer>
        </>
      )}

      {mobile && (
        <>
          <div className={`transition-opacity duration-700 ${ui ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <BottomSheet
              peek={PEEK}
              header={
                <div className="flex flex-col gap-1.5">
                  <div className="min-w-0">
                    <StepHeader step={cur} index={step} total={n} />
                    <h2 className="mt-0.5 line-clamp-1 text-[18px] font-extrabold leading-tight group-data-[snap=1]/sheet:line-clamp-none group-data-[snap=2]/sheet:line-clamp-none" title={cur.titleHe}>
                      {cur.titleHe}
                    </h2>
                  </div>
                  <div key={step} className="animate-fade-in">
                    <PartsPanel materials={cur.materials} layout="scroll" />
                  </div>
                  <StepNumbers step={cur} />
                  <div className="relative">
                    <Scrubber timeline={timeline} step={step} onSeek={(i) => go(i)} thin />
                    <StepProgress key={step} seconds={timeline.span[step]} className="absolute inset-x-0 -bottom-0.5" />
                  </div>
                  {nav(false)}
                </div>
              }
            >
              <div key={step} className="animate-fade-in">
                <StepCard step={cur} index={step} total={n} cumCost={timeline.cumCostILS[step]} cumDays={timeline.cumDays[step]} variant="sheet" next={nextStep} />
              </div>
            </BottomSheet>
          </div>
          {listOpen && (
            <div className="absolute inset-0 z-30 flex animate-fade-in" onClick={() => setListOpen(false)}>
              <div className="absolute inset-0 bg-ink/30" />
              <aside
                className="relative ms-0 h-full w-[86%] max-w-[360px] animate-sheet-in-right overflow-y-auto bg-ink-50 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="text-[16px] font-extrabold">כל השלבים</span>
                  <button aria-label="סגירה" className={`rounded-full p-2.5 hover:bg-white ${FOCUS}`} onClick={() => setListOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
                <StepList
                  timeline={timeline}
                  step={step}
                  onSelect={(i) => {
                    go(i);
                    setListOpen(false);
                  }}
                />
              </aside>
            </div>
          )}
        </>
      )}

      {summary && (
        <Summary
          timeline={timeline}
          method={method}
          openSignal={summaryTick}
          sheetPeek={mobile ? PEEK : undefined}
          onSwitchMethod={(m) => switchMethod(m, 'diverge')}
          onClose={() => setSummary(false)}
          onRestart={() => {
            setSummary(false);
            go(0);
          }}
        />
      )}
    </div>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      // 44 px on touch screens, 36 px with a mouse; a text tooltip on hover / keyboard focus.
      className={`group/tb relative grid h-11 w-11 place-items-center rounded-xl transition [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9 ${FOCUS} ${
        active ? 'bg-primary text-white shadow-[0_4px_12px_-4px_rgba(230,21,89,0.8)]' : 'text-ink-700 hover:bg-ink-100'
      }`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute end-0 top-full z-30 mt-2 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[12px] font-medium text-white shadow-lg [@media(hover:hover)]:group-hover/tb:block group-focus-visible/tb:block"
      >
        {label}
      </span>
    </button>
  );
}
