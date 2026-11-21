'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import type { Group, Object3D, OrthographicCamera } from 'three';
import { MODEL_NAMES, createModel, type ModelName } from '@/lib/build3d/models';

/** Models too large for the default cell get a smaller display scale. */
const BIG: Partial<Record<ModelName, number>> = {
  excavator: 0.55, 'dump-truck': 0.5, roller: 0.7, 'mixer-truck': 0.5, 'pump-truck': 0.25, 'drill-rig': 0.35,
  'site-container': 0.6, 'power-pole': 0.45, 'scaffold-bay': 0.8, palm: 0.7, tree: 0.7, 'tree-olive': 0.9,
  'rebar-bundle': 0.55, car: 0.8,
};

function Cell({ name, index, cols, spin, CELL }: { name: ModelName; index: number; cols: number; spin: boolean; CELL: number }): JSX.Element {
  const obj = useMemo<Object3D>(() => createModel(name, { seed: index + 3 }), [name, index]);
  const turn = useRef<Group>(null);
  const x = (index % cols) * CELL - ((cols - 1) * CELL) / 2;
  const z = Math.floor(index / cols) * CELL;
  const s = BIG[name] ?? 1;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const fn = obj.userData.animate as ((t: number) => void) | undefined;
    if (fn) fn(t);
    if (turn.current && spin) turn.current.rotation.y = t * 0.3 + index * 0.7;
  });
  return (
    <group position={[x, 0, z]}>
      <group ref={turn} scale={s}>
        <primitive object={obj} />
      </group>
      <Html position={[0, 0, CELL * 0.42]} center zIndexRange={[0, 0]}>
        <div style={{ font: '600 13px Heebo, sans-serif', color: '#231F20', background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{name}</div>
      </Html>
    </group>
  );
}

/** Frames the whole grid with an orthographic 3/4 camera. */
function Rig({ w, rows, cz, CELL }: { w: number; rows: number; cz: number; CELL: number }): null {
  const size = useThree((st) => st.size);
  useFrame(({ camera }) => {
    const d = 120;
    camera.position.set(d * 0.28, d * 0.6, cz + d * 0.8);
    camera.lookAt(0, 1.5, cz);
    const cam = camera as OrthographicCamera;
    const depth = rows * CELL * 0.62 + 7;
    cam.zoom = Math.min(size.width / (w + 4), size.height / depth);
    cam.updateProjectionMatrix();
  });
  return null;
}

export default function ModelsGallery(): JSX.Element {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const only = params?.get('only')?.split(',') ?? null;
  const CELL = Number(params?.get('cell') ?? 7.5);
  const spin = params?.get('spin') !== '0';
  const names = MODEL_NAMES.filter((n) => !only || only.includes(n));
  const cols = Math.min(names.length, Number(params?.get('cols') ?? 8));
  const rows = Math.ceil(names.length / cols);
  const w = cols * CELL;
  const cz = ((rows - 1) * CELL) / 2;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(#EAF2F8, #FAF7F2)' }} data-gallery-ready>
      <Canvas
        shadows
        flat
        dpr={1}
        orthographic
        camera={{ position: [60, 74, cz + 74], near: 1, far: 600, zoom: 30 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <Rig w={w} rows={rows} cz={cz} CELL={CELL} />
        <hemisphereLight args={['#ffffff', '#e6dfd2', 1.0]} />
        <directionalLight position={[30, 60, 20]} intensity={1.9} castShadow shadow-mapSize={[4096, 4096]} shadow-camera-left={-w / 2 - 10} shadow-camera-right={w / 2 + 10} shadow-camera-top={cz + 20} shadow-camera-bottom={-20} shadow-camera-far={200} shadow-bias={-0.0004} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, cz]} receiveShadow>
          <planeGeometry args={[w + 400, rows * CELL + 400]} />
          <meshStandardMaterial color="#ECE7DC" roughness={1} />
        </mesh>
        {names.map((n, i) => (
          <Cell key={n} name={n} index={i} cols={cols} spin={spin} CELL={CELL} />
        ))}
      </Canvas>
    </div>
  );
}
