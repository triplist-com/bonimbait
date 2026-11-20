'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BUILD_TOTALS } from '@/lib/build3d/content/totals';
import type { ViewportId } from '@/lib/build3d/house/types';
import { overlay } from './overlayData';
import Counter from './Counter';

const MAGENTA = '#E61559';
const INK = '#231F20';
const BLUE = '#1F4FD8';
const TEAL = '#0F9D8A';

type BBox = [number, number, number, number];

interface StageDef {
  id: string;
  line: string;
  ms: number;
}

/** ~8.6 s total (reduced motion: ~55 %). */
const STAGES: StageDef[] = [
  { id: 'open', line: 'פותח את הקובץ…', ms: 700 },
  { id: 'views', line: 'מאתר שתי תוכניות: קומת כניסה וקומה תחתונה', ms: 800 },
  { id: 'site', line: 'קורא גבולות מגרש וגבהים', ms: 900 },
  { id: 'walls', line: 'מזהה קירות: בטון ובלוקים', ms: 1200 },
  { id: 'openings', line: 'מזהה פתחים: דלתות וחלונות', ms: 700 },
  { id: 'rooms', line: 'מזהה חדרים ומחשב שטחים', ms: 1000 },
  { id: 'dims', line: 'קורא מידות מהתוכנית', ms: 700 },
  { id: 'qty', line: 'מחשב כמויות: בטון, ברזל, בלוקים', ms: 900 },
  { id: 'plan', line: 'מתכנן את שלבי הבנייה', ms: 600 },
  { id: 'handoff', line: 'עוברים לבית בתלת-ממד…', ms: 1100 },
];
const S = Object.fromEntries(STAGES.map((s, i) => [s.id, i])) as Record<string, number>;
const RAIL_STAGES = STAGES.slice(0, -1);

const q = { concrete: Math.round(BUILD_TOTALS.concreteM3), rebar: BUILD_TOTALS.rebarT, blocks: BUILD_TOTALS.blocks };
const PLANNED_STEPS = BUILD_TOTALS.steps;

function union(boxes: BBox[]): BBox {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}
function pad(b: BBox, p: number): BBox {
  return [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
}

export interface AnalysisProps {
  /** Called when the viewer should mount underneath (start of the hand-off). */
  onReveal: () => void;
  /** Called when the animation is fully done. */
  onDone: () => void;
}

export default function Analysis({ onReveal, onDone }: AnalysisProps) {
  const o = overlay;
  const [stage, setStage] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const revealed = useRef(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    onReveal();
  }, [onReveal]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Timeline
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(rm);
    const k = rm ? 0.55 : 1;
    let at = 80;
    STAGES.forEach((s, i) => {
      if (i > 0) timers.current.push(window.setTimeout(() => setStage(i), at));
      if (i === S.handoff) timers.current.push(window.setTimeout(reveal, at + 80));
      at += s.ms * k;
    });
    timers.current.push(window.setTimeout(finish, at + 150));
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, [finish, reveal]);

  const skip = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSkipped(true);
    setStage(S.handoff);
    window.setTimeout(reveal, 60);
    window.setTimeout(finish, 900);
  };

  // Camera targets, in sheet points
  const boxes = useMemo(() => {
    const vpBox = (id: ViewportId) => o.viewports.find((v) => v.id === id)?.bboxPt ?? [0, 0, o.widthPt, o.heightPt];
    const houseBox = (id: ViewportId): BBox => {
      const pts: Array<[number, number]> = [
        ...o.rooms.filter((r) => r.viewport === id).map((r) => [r.x, r.y] as [number, number]),
        ...o.openings.filter((p) => p.viewport === id).map((p) => [p.x, p.y] as [number, number]),
      ];
      if (!pts.length) return vpBox(id) as BBox;
      return pad(
        [
          Math.min(...pts.map((p) => p[0])),
          Math.min(...pts.map((p) => p[1])),
          Math.max(...pts.map((p) => p[0])),
          Math.max(...pts.map((p) => p[1])),
        ],
        70,
      );
    };
    const full: BBox = [90, 130, o.widthPt - 90, o.heightPt - 330];
    return {
      full,
      entrance: vpBox('entrance') as BBox,
      houseE: houseBox('entrance'),
      houseBoth: union([houseBox('entrance'), houseBox('lower')]),
    };
  }, [o]);

  const compact = size.w < 700;
  const bottomInset = compact ? 220 : 190;
  const topInset = 60;

  const target: BBox = useMemo(() => {
    switch (stage) {
      case S.open:
      case S.views:
      case S.qty:
      case S.plan:
        return boxes.full;
      case S.site:
        return boxes.entrance;
      case S.openings:
        return boxes.houseBoth;
      case S.handoff:
        // The viewer's intro opens top-down on the entrance drawing frame.
        return boxes.entrance;
      default:
        return boxes.houseE;
    }
  }, [stage, boxes]);

  const cam = useMemo(() => {
    const cw = Math.max(size.w, 1);
    const ch = Math.max(size.h, 1);
    const availH = Math.max(ch - topInset - bottomInset, 120);
    const bw = target[2] - target[0];
    const bh = target[3] - target[1];
    const s = Math.min(cw / bw, availH / bh) * 0.94;
    const cx = (target[0] + target[2]) / 2;
    const cy = (target[1] + target[3]) / 2;
    return { s, tx: cw / 2 - cx * s, ty: topInset + availH / 2 - cy * s };
  }, [size, target, bottomInset]);

  const camMs = reduced ? 300 : stage === S.handoff ? 1100 : 1000;
  const camTransition = `transform ${camMs}ms cubic-bezier(0.65, 0, 0.25, 1)`;
  const toScreen = (x: number, y: number) => `translate(${(x * cam.s + cam.tx).toFixed(1)}px, ${(y * cam.s + cam.ty).toFixed(1)}px)`;

  const instant = skipped || reduced;
  const handoff = stage >= S.handoff;
  const tilt = handoff && !reduced;

  const dash = (on: boolean, ms = 900, delay = 0): React.CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: `stroke-dashoffset ${instant ? 200 : ms}ms cubic-bezier(0.4,0,0.2,1) ${instant ? 0 : delay}ms`,
  });
  const fade = (on: boolean, ms = 450, delay = 0): React.CSSProperties => ({
    opacity: on ? 1 : 0,
    transition: `opacity ${instant ? 150 : ms}ms ease ${instant ? 0 : delay}ms`,
  });

  const concreteWalls = o.walls.filter((w) => w.material === 'concrete');
  const blockWalls = o.walls.filter((w) => w.material === 'block');
  const entranceRooms = o.rooms.filter((r) => r.viewport === 'entrance');

  return (
    <div
      ref={rootRef}
      dir="rtl"
      className="absolute inset-0 z-20 overflow-hidden bg-[#ECE8E0] text-[#231F20]"
      style={{
        opacity: handoff ? 0 : 1,
        transition: handoff ? `opacity ${reduced || skipped ? 400 : 650}ms ease ${reduced || skipped ? 0 : 480}ms` : undefined,
        pointerEvents: handoff ? 'none' : 'auto',
        perspective: '1600px',
      }}
    >
      {/* Faint blueprint grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(35,31,32,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(35,31,32,.045) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Tilt wrapper (hand-off) */}
      <div
        className="absolute inset-0"
        style={{
          transformOrigin: '50% 55%',
          transform: tilt ? 'rotateX(58deg) scale(0.92) translateY(-4%)' : 'none',
          transition: tilt ? 'transform 1100ms cubic-bezier(0.55, 0, 0.2, 1)' : undefined,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* "Page lands" */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 1,
            animation: reduced ? 'b3d-fadein 400ms ease both' : 'b3d-land 750ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
          }}
        >
          {/* Camera */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: o.widthPt,
              height: o.heightPt,
              transformOrigin: '0 0',
              transform: `translate(${cam.tx.toFixed(1)}px, ${cam.ty.toFixed(1)}px) scale(${cam.s.toFixed(4)})`,
              transition: camTransition,
              willChange: 'transform',
              visibility: size.w ? 'visible' : 'hidden',
            }}
          >
            <div className="absolute inset-0 bg-white" style={{ boxShadow: '0 20px 80px rgba(35,31,32,.22), 0 0 0 2px rgba(35,31,32,.08)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/build3d/plan-sheet.webp"
                alt="תוכנית ההגשה של מגרש 43"
                width={3600}
                height={3225}
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full select-none"
              />
            </div>

            {/* Scan line */}
            <div
              aria-hidden
              className="b3d-scan absolute inset-x-0 top-0"
              style={{ height: 90, background: `linear-gradient(to bottom, transparent, ${MAGENTA}55 70%, ${MAGENTA})`, borderBottom: `3px solid ${MAGENTA}`, opacity: 0, animationPlayState: reduced ? 'paused' : 'running' }}
            />

            <svg
              viewBox={`0 0 ${o.widthPt} ${o.heightPt}`}
              className="absolute inset-0 h-full w-full"
              style={{ overflow: 'visible' }}
              aria-hidden
            >
              {/* Viewport frames */}
              {o.viewports.map((v, i) => (
                <rect
                  key={v.id}
                  x={v.bboxPt[0]}
                  y={v.bboxPt[1]}
                  width={v.bboxPt[2] - v.bboxPt[0]}
                  height={v.bboxPt[3] - v.bboxPt[1]}
                  rx={6}
                  fill="none"
                  stroke={MAGENTA}
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  style={{ ...dash(stage >= S.views, 800, i * 200), opacity: stage >= S.walls ? 0.25 : 1, transition: `stroke-dashoffset 800ms ease ${i * 200}ms, opacity 500ms ease` }}
                />
              ))}

              {/* Lot boundary */}
              {o.site.boundary.map((b, i) => (
                <path
                  key={i}
                  d={b.d}
                  fill="none"
                  stroke={MAGENTA}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  style={{ ...dash(stage >= S.site, 1100, i * 150), opacity: stage >= S.rooms ? 0.35 : 1 }}
                />
              ))}
              {o.site.elevations.map((e, i) => (
                <circle
                  key={i}
                  cx={e.x}
                  cy={e.y}
                  r={14}
                  fill={`${MAGENTA}33`}
                  stroke={MAGENTA}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  className={stage === S.site ? 'b3d-pulse' : undefined}
                  style={{ ...fade(stage >= S.site, 400, 500 + i * 120), opacity: stage >= S.site && stage < S.walls ? 1 : 0 }}
                />
              ))}

              {/* Room tints */}
              {o.rooms.map((r, i) => (
                <path
                  key={i}
                  d={r.d}
                  fill={i % 2 ? '#F5A623' : '#2BB3A3'}
                  fillOpacity={0.28}
                  style={{ ...fade(stage >= S.rooms, 500, (i % 8) * 90), opacity: stage >= S.rooms ? 1 : 0 }}
                />
              ))}

              {/* Walls: concrete (blue) then blocks (magenta) */}
              {concreteWalls.map((w, i) => (
                <path
                  key={`c${i}`}
                  d={w.d}
                  fill={BLUE}
                  stroke={BLUE}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{ ...fade(stage >= S.walls, 300, Math.min(i * 25, 400)) }}
                />
              ))}
              {blockWalls.map((w, i) => (
                <path
                  key={`b${i}`}
                  d={w.d}
                  fill={MAGENTA}
                  stroke={MAGENTA}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{ ...fade(stage >= S.walls, 300, 500 + Math.min(i * 25, 500)) }}
                />
              ))}

              {/* Openings */}
              {o.openings.map((p, i) => {
                const isWindow = /window|vitrine/.test(p.kind);
                return (
                  <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`}>
                    <rect
                      x={-p.w / 2}
                      y={-7}
                      width={p.w}
                      height={14}
                      rx={3}
                      fill={isWindow ? '#34B6F0' : '#F5A623'}
                      stroke={INK}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      className="b3d-pop"
                      style={{
                        transform: stage >= S.openings ? 'scale(1)' : 'scale(0)',
                        transition: `transform ${instant ? 120 : 380}ms cubic-bezier(0.34,1.56,0.64,1) ${instant ? 0 : (i % 10) * 45}ms`,
                      }}
                    />
                  </g>
                );
              })}

              {/* Dimension lines */}
              {o.dims.map((d, i) => (
                <g key={i} style={{ opacity: stage >= S.dims && stage < S.qty ? 1 : 0, transition: 'opacity 400ms ease' }}>
                  <line
                    x1={d.x1}
                    y1={d.y1}
                    x2={d.x2}
                    y2={d.y2}
                    stroke={TEAL}
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    style={dash(stage >= S.dims, 600, i * 150)}
                  />
                  <circle cx={d.x1} cy={d.y1} r={5} fill={TEAL} />
                  <circle cx={d.x2} cy={d.y2} r={5} fill={TEAL} />
                </g>
              ))}
            </svg>
          </div>

          {/* Chips: positioned with the same transform math + transition as the camera so they stay locked to the sheet */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {o.viewports.map((v, i) => (
              <Chip key={v.id} at={toScreen((v.bboxPt[0] + v.bboxPt[2]) / 2, v.bboxPt[1])} transition={camTransition} show={stage >= S.views && stage < S.site + 1} delay={300 + i * 200} tone="magenta" top>
                {v.titleHe}
              </Chip>
            ))}
            {o.site.elevations.map((e, i) => (
              <Chip key={`e${i}`} at={toScreen(e.x, e.y)} transition={camTransition} show={stage === S.site} delay={600 + i * 120} tone="ink" small>
                {e.text}
              </Chip>
            ))}
            {entranceRooms.map((r, i) => (
              <Chip key={`r${i}`} at={toScreen(r.x, r.y)} transition={camTransition} show={stage >= S.rooms && stage < S.qty} delay={200 + i * 110} tone="white">
                <b className="font-bold">{r.nameHe}</b>
                <span className="ms-1.5 text-[#E61559]">{r.area.toLocaleString('he-IL', { maximumFractionDigits: 1 })} מ״ר</span>
              </Chip>
            ))}
            {o.dims.map((d, i) => (
              <Chip key={`d${i}`} at={toScreen((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2)} transition={camTransition} show={stage >= S.dims && stage < S.qty} delay={250 + i * 150} tone="teal" small>
                {d.text}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Quantities card */}
      <div
        className="absolute inset-x-4 top-16 z-10 mx-auto max-w-xl rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_10px_40px_rgba(35,31,32,.15)] backdrop-blur-md sm:p-5"
        style={{
          opacity: stage >= S.qty && !handoff ? 1 : 0,
          transform: stage >= S.qty && !handoff ? 'translateY(0)' : 'translateY(-12px)',
          transition: 'opacity 450ms ease, transform 450ms ease',
        }}
      >
        <div className="mb-2 text-xs font-semibold tracking-wide text-[#231F20]/55">כמויות משוערות מהתוכנית</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric label="בטון" unit="מ״ק"><Counter value={q.concrete} active={stage >= S.qty} instant={instant} durationMs={800} /></Metric>
          <Metric label="ברזל" unit="טון"><Counter value={q.rebar} decimals={1} active={stage >= S.qty} instant={instant} durationMs={800} /></Metric>
          <Metric label="בלוקים" unit="יח׳"><Counter value={q.blocks} active={stage >= S.qty} instant={instant} durationMs={800} /></Metric>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-gradient-to-b from-[#ECE8E0] to-transparent px-4 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E61559]" style={{ animation: 'b3d-blink 1s ease-in-out infinite' }} />
          קורא את התוכנית
        </div>
        <button
          type="button"
          onClick={skip}
          className="rounded-full border border-[#231F20]/15 bg-white/80 px-4 py-1.5 text-sm font-semibold text-[#231F20] backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E61559]"
        >
          דלגו ›
        </button>
      </div>

      {/* Narration + progress + counters */}
      <div className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-2xl rounded-2xl border border-white/70 bg-white/90 p-4 shadow-[0_10px_40px_rgba(35,31,32,.18)] backdrop-blur-md sm:bottom-6 sm:p-5">
        <div className="mb-3 flex gap-1" role="presentation">
          {RAIL_STAGES.map((s, i) => (
            <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-[#231F20]/10">
              <span
                className="block h-full rounded-full bg-[#E61559]"
                style={{ width: stage > i ? '100%' : stage === i ? '55%' : '0%', transition: 'width 600ms ease' }}
              />
            </span>
          ))}
        </div>
        <p aria-live="polite" className="min-h-[1.75rem] text-lg font-bold leading-snug sm:text-xl" key={stage} style={{ animation: 'b3d-line 380ms ease both' }}>
          {STAGES[stage].line}
        </p>
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Stat label="קירות" on={stage >= S.walls}>
            <Counter value={o.stats.walls} active={stage >= S.walls} instant={instant} durationMs={1000} />
          </Stat>
          <Stat label="פתחים" on={stage >= S.openings}>
            <Counter value={o.stats.openings} active={stage >= S.openings} instant={instant} durationMs={700} />
          </Stat>
          <Stat label="חדרים" on={stage >= S.rooms}>
            <Counter value={o.stats.rooms} active={stage >= S.rooms} instant={instant} durationMs={800} />
          </Stat>
          <Stat label={stage >= S.plan ? 'שלבים' : 'מ״ר בנוי'} on={stage >= S.rooms}>
            {stage >= S.plan ? (
              <Counter value={PLANNED_STEPS} active instant={instant} durationMs={500} />
            ) : (
              <Counter value={o.stats.builtAreaM2} active={stage >= S.rooms} instant={instant} durationMs={800} />
            )}
          </Stat>
        </dl>
      </div>

      <style>{`
        @keyframes b3d-land { from { opacity: 0; transform: translateY(40px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes b3d-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes b3d-scan { 0% { transform: translateY(-100px); opacity: 0; } 12% { opacity: .9; } 85% { opacity: .9; } 100% { transform: translateY(1701px); opacity: 0; } }
        .b3d-scan { animation: b3d-scan 1.5s cubic-bezier(.45,0,.3,1) .3s both; }
        @keyframes b3d-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.7); } }
        .b3d-pulse { transform-box: fill-box; transform-origin: center; animation: b3d-pulse .9s ease-in-out infinite; }
        .b3d-pop { transform-box: fill-box; transform-origin: center; }
        @keyframes b3d-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes b3d-line { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .b3d-scan, .b3d-pulse { animation: none; } }
      `}</style>
    </div>
  );
}

function Chip({
  at,
  transition,
  show,
  delay,
  tone,
  small,
  top,
  children,
}: {
  at: string;
  transition: string;
  show: boolean;
  delay: number;
  tone: 'magenta' | 'ink' | 'white' | 'teal';
  small?: boolean;
  top?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    magenta: 'bg-[#E61559] text-white',
    ink: 'bg-[#231F20] text-white',
    white: 'bg-white text-[#231F20] ring-1 ring-black/10',
    teal: 'bg-[#0F9D8A] text-white',
  } as const;
  return (
    <div className="absolute left-0 top-0" style={{ transform: at, transition }}>
      <span
        className={`inline-block whitespace-nowrap rounded-full shadow-md ${tones[tone]} ${small ? 'px-2 py-0.5 text-[11px] font-bold' : 'px-3 py-1 text-xs font-medium sm:text-[13px]'}`}
        style={{
          transform: `translate(-50%, ${top ? '-130%' : '-50%'}) scale(${show ? 1 : 0.4})`,
          opacity: show ? 1 : 0,
          transition: `transform 380ms cubic-bezier(0.34,1.56,0.64,1) ${show ? delay : 0}ms, opacity 250ms ease ${show ? delay : 0}ms`,
        }}
      >
        {children}
      </span>
    </div>
  );
}

function Metric({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xl font-extrabold text-[#E61559] sm:text-3xl">{children}</div>
      <div className="text-xs font-semibold text-[#231F20]/70">{label} · {unit}</div>
    </div>
  );
}

function Stat({ label, on, children }: { label: string; on: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#F7F5F1] px-2 py-1.5" style={{ opacity: on ? 1 : 0.4, transition: 'opacity 300ms' }}>
      <dd className="m-0 text-lg font-extrabold leading-tight sm:text-xl">{children}</dd>
      <dt className="text-[11px] font-medium text-[#231F20]/60">{label}</dt>
    </div>
  );
}
