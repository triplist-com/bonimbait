// Procedural low-poly model library (three.js primitives only). See docs/build3d/SPEC.md §6.
import { Box3, Group, type Object3D } from 'three';
import type { Opts } from './kit';
import { bush, palm, rock, tree, treeOlive } from './nature';
import {
  armchair, bathtub, bedDouble, bedSingle, coffeeTable, desk, diningSet, kitchenCounter, kitchenIsland,
  lampPendant, loungeChair, outdoorTable, planter, shower, sink, sofa, toilet, tv, wardrobe, washer,
} from './furniture';
import { car, drillRig, dumpTruck, excavator, mixerTruck, pumpTruck, roller } from './equipment';
import {
  acUnit, blockPallet, permitSign, powerPole, prop, rebarBundle, scaffoldBay, siteContainer, siteToilet,
  solarHeater, surveyor, wheelbarrow, worker,
} from './site';

export type ModelName = 'car' | 'tree' | 'tree-olive' | 'palm' | 'bush' | 'rock' | 'sofa' | 'armchair' | 'coffee-table' | 'bed-double' | 'bed-single' | 'dining-set' | 'kitchen-island' | 'kitchen-counter' | 'toilet' | 'sink' | 'shower' | 'bathtub' | 'wardrobe' | 'tv' | 'desk' | 'outdoor-table' | 'lounge-chair' | 'washer' | 'excavator' | 'dump-truck' | 'roller' | 'mixer-truck' | 'pump-truck' | 'drill-rig' | 'site-container' | 'site-toilet' | 'worker' | 'surveyor' | 'permit-sign' | 'power-pole' | 'scaffold-bay' | 'solar-heater' | 'ac-unit' | 'prop' | 'wheelbarrow' | 'block-pallet' | 'rebar-bundle' | 'lamp-pendant' | 'planter';

type Builder = (o: Opts) => Group;
const BUILDERS: Record<ModelName, Builder> = {
  car, tree, 'tree-olive': treeOlive, palm, bush, rock, sofa, armchair, 'coffee-table': coffeeTable,
  'bed-double': bedDouble, 'bed-single': bedSingle, 'dining-set': diningSet, 'kitchen-island': kitchenIsland,
  'kitchen-counter': kitchenCounter, toilet, sink, shower, bathtub, wardrobe, tv, desk,
  'outdoor-table': outdoorTable, 'lounge-chair': loungeChair, washer, excavator, 'dump-truck': dumpTruck,
  roller, 'mixer-truck': mixerTruck, 'pump-truck': pumpTruck, 'drill-rig': drillRig,
  'site-container': siteContainer, 'site-toilet': siteToilet, worker, surveyor, 'permit-sign': permitSign,
  'power-pole': powerPole, 'scaffold-bay': scaffoldBay, 'solar-heater': solarHeater, 'ac-unit': acUnit,
  prop, wheelbarrow, 'block-pallet': blockPallet, 'rebar-bundle': rebarBundle, 'lamp-pendant': lampPendant, planter,
};

export const MODEL_NAMES = Object.keys(BUILDERS) as readonly ModelName[];

/** Animated models keep per-instance state (closures over parts), so they are never cloned from a cache. */
const ANIMATED = new Set<ModelName>(['excavator', 'drill-rig', 'pump-truck', 'mixer-truck', 'roller', 'worker', 'surveyor']);

interface Template { obj: Object3D; size: [number, number, number] }
const templates = new Map<string, Template>();

function build(name: ModelName, o: Opts): Template {
  const obj = BUILDERS[name](o);
  const b = new Box3().setFromObject(obj);
  return { obj, size: [Math.max(b.max.x - b.min.x, 1e-3), Math.max(b.max.y - b.min.y, 1e-3), Math.max(b.max.z - b.min.z, 1e-3)] };
}

/**
 * Create a model. Meters, origin bottom-center, front faces +X. With `opts.size` the model is scaled
 * non-uniformly to that [x, y, z] box (a 0 entry keeps the natural size on that axis).
 */
export function createModel(name: ModelName, opts: Opts = {}): Object3D {
  const builder = BUILDERS[name];
  if (!builder) throw new Error(`Unknown model: ${name}`);
  let tpl: Template;
  let inner: Object3D;
  if (ANIMATED.has(name)) {
    tpl = build(name, opts);
    inner = tpl.obj;
  } else {
    const key = `${name}|${opts.seed ?? 1}|${opts.color ?? ''}`;
    let hit = templates.get(key);
    if (!hit) {
      hit = build(name, opts);
      templates.set(key, hit);
    }
    tpl = hit;
    inner = hit.obj.clone(true);
  }
  const root = new Group();
  root.name = name;
  root.add(inner);
  if (opts.size) {
    const [sx, sy, sz] = opts.size;
    root.scale.set(sx > 0 ? sx / tpl.size[0] : 1, sy > 0 ? sy / tpl.size[1] : 1, sz > 0 ? sz / tpl.size[2] : 1);
  }
  if (inner.userData.animate) root.userData.animate = inner.userData.animate;
  if (inner.userData.parts) root.userData.parts = inner.userData.parts;
  return root;
}
