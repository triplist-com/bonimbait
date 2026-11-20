/** Isometric line-drawing house that assembles itself (pure SVG + CSS, no WebGL, no JS). */

const U = 26;
const proj = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.866 * U, (x + z) * 0.5 * U - y * U];
const pt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

interface Part {
  x: number; z: number; y: number; w: number; d: number; h: number;
  top: string; left: string; right: string;
}

const PARTS: Part[] = [
  { x: 0, z: 0, y: 0, w: 8, d: 6, h: 0.3, top: '#E9E2D3', left: '#D8CFBC', right: '#CBC1AC' }, // lot / ground
  { x: 1, z: 1, y: 0.3, w: 6, d: 4, h: 0.45, top: '#D4D6D9', left: '#B9BCC0', right: '#A8ABB0' }, // foundations
  { x: 1, z: 1, y: 0.75, w: 6, d: 4, h: 2.15, top: '#F4F1EB', left: '#E8E3DA', right: '#DAD4C8' }, // lower walls
  { x: 0.8, z: 0.8, y: 2.9, w: 6.4, d: 4.4, h: 0.3, top: '#D4D6D9', left: '#B9BCC0', right: '#A8ABB0' }, // slab
  { x: 1.6, z: 1.3, y: 3.2, w: 4.4, d: 3, h: 1.9, top: '#FAF8F4', left: '#EFEAE1', right: '#E1DBCE' }, // upper walls
  { x: 1.3, z: 1, y: 5.1, w: 5, d: 3.6, h: 0.28, top: '#FFFFFF', left: '#F0C5D3', right: '#E61559' }, // roof
  { x: 6.3, z: 1.6, y: 0.75, w: 1.4, d: 2.2, h: 0.18, top: '#C9A979', left: '#B38F5E', right: '#9D7B4D' }, // deck
];

function Box({ p, i }: { p: Part; i: number }) {
  const { x, z, y, w, d, h } = p;
  const top = [proj(x, y + h, z), proj(x + w, y + h, z), proj(x + w, y + h, z + d), proj(x, y + h, z + d)];
  const left = [proj(x, y + h, z + d), proj(x + w, y + h, z + d), proj(x + w, y, z + d), proj(x, y, z + d)];
  const right = [proj(x + w, y + h, z), proj(x + w, y + h, z + d), proj(x + w, y, z + d), proj(x + w, y, z)];
  return (
    <g className="b3d-hv" style={{ animationDelay: `${i * 0.7}s` }}>
      <polygon points={right.map(pt).join(' ')} fill={p.right} />
      <polygon points={left.map(pt).join(' ')} fill={p.left} />
      <polygon points={top.map(pt).join(' ')} fill={p.top} />
      <g fill="none" stroke="#231F20" strokeWidth={1.3} strokeLinejoin="round" opacity={0.85}>
        <polygon points={top.map(pt).join(' ')} />
        <polyline points={[left[0], left[3], left[2], right[3]].map(pt).join(' ')} />
        <polyline points={[left[1], left[2]].map(pt).join(' ')} />
      </g>
    </g>
  );
}

const corners = PARTS.flatMap((p) => [proj(p.x, p.y, p.z), proj(p.x + p.w, p.y, p.z + p.d), proj(p.x, p.y + p.h, p.z), proj(p.x + p.w, p.y + p.h, p.z), proj(p.x, p.y, p.z + p.d), proj(p.x + p.w, p.y, p.z)]);
const minX = Math.min(...corners.map((c) => c[0])) - 20;
const maxX = Math.max(...corners.map((c) => c[0])) + 20;
const minY = Math.min(...corners.map((c) => c[1])) - 40;
const maxY = Math.max(...corners.map((c) => c[1])) + 20;

export default function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="h-full w-full" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="b3d-hv-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#231F20" floodOpacity="0.12" />
          </filter>
        </defs>
        <g filter="url(#b3d-hv-shadow)">
          {PARTS.map((p, i) => (
            <Box key={i} p={p} i={i} />
          ))}
        </g>
      </svg>
      <style>{`
        @keyframes b3d-hv { 0% { opacity: 0; transform: translateY(-46px); } 7% { opacity: 1; transform: translateY(3px); } 10% { transform: translateY(0); } 82% { opacity: 1; transform: none; } 94%, 100% { opacity: 0; transform: translateY(10px); } }
        .b3d-hv { animation: b3d-hv 10.5s cubic-bezier(.3,.7,.3,1) infinite backwards; }
        @media (prefers-reduced-motion: reduce) { .b3d-hv { animation: none; } }
      `}</style>
    </div>
  );
}
