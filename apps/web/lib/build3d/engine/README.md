# Step engine — authoring guide

A build is an ordered list of **steps** (ids from `docs/build3d/STEPS.md`). Each step adds declarative
**parts** and may **remove** earlier ones. The viewer derives everything else: visibility per step,
entry/exit animation, magenta highlight of the current step, ghost preview, x-ray, camera framing.

## Add a phase

1. Create `lib/build3d/steps/pNN-name.ts`:

```ts
import type { StepDef } from '../engine/types';
import type { BuildContext } from './context';
import { PRICES, line, roundCost } from './kit';
import { wallFrame } from '../house/geometry';

export function phaseLowerFrame(ctx: BuildContext): StepDef[] {
  const walls = ctx.house.walls.filter((w) => w.level === 'lower' && w.role === 'retaining');
  const m3 = walls.reduce((s, w) => s + wallFrame(w).length * w.thickness * w.height, 0);
  return [{
    id: 'p4-retaining-pour',            // canonical id → text comes from lib/build3d/content
    phase: 4,
    materials: [line('בטון ב-30', m3, 'מ״ק', 1)],
    costILS: roundCost(m3 * PRICES.concreteM3 + PRICES.pumpDay),
    parts: [{
      id: 'p4-retaining-concrete',       // globally unique: prefix with the step
      shape: { kind: 'boxes', items: walls.map((w) => {
        const f = wallFrame(w);
        return { at: [f.mid[0], w.baseY + w.height / 2, f.mid[1]], size: [f.length, w.height, w.thickness], rotY: f.rotY };
      }) },
      material: 'concrete',              // fresh-concrete color during its own step, cured after
      tags: ['concrete', 'level:lower'],
      anim: { type: 'pour', stagger: 0.15, order: 'near', origin: ctx.lot.gate },
    }],
    remove: { tags: ['p4-retaining-forms'] },
    camera: { fit: 'parts', polar: 50 },
  }];
}
```

2. Register it in `steps/index.ts`: import it and append to `PHASE_BUILDERS` (build order).

Text (`titleHe`, `descHe`, `crewHe`, `durationDays`, `tipHe`, `searchQuery`, `videos`, `checkpointHe`)
is merged from `lib/build3d/content` by id (content wins). You may pass fallbacks in the StepDef.
Geometry computes `materials` (bill of quantities) and `costILS` (use `PRICES` from `./kit`).

## Context (`steps/context.ts`, computed once)

`ctx.house` (raw model) · `ctx.lower / entrance / roof` (levels) · `ctx.footprint.{lower, entrance, house, grade}`
(`grade` = on-grade, non-excavated part of the entrance floor) · `ctx.y.{pitFloor, gravelTop, platform,
lowerBeamTop, entranceBeamTop, beamDepth}` · `ctx.beams[]` / `ctx.piles[]` (foundations) ·
`ctx.terrain.{natural, excavated, finished, baseY}` (0.25 m grids) · `ctx.lot.{boundary, gate, street, back}` ·
`ctx.heightAt(x, z, grid?)` · `ctx.freeSpot(size, near, taken)` · `siteLayout(ctx)` (p01-site: container,
toilet, truck spot…).

Geometry helpers (`house/geometry.ts`): `wallFrame`, `wallPoint`, `wallPieces(wall, openings, floorY)` +
`pieceBox` (wall boxes around openings), `offsetPolygon`, `unionOutline`, `polygonArea`, `pointInPolygon`,
`samplePolygon`, `pointsAlong`, `mergeCollinear` + `resolveJunctions` (clean butt joints), `snapEnds`,
`excavate` / `fill` / `mapGrid` (terrain variants), `volumeBetween`, `rng(seed)`.
Kit (`steps/kit.ts`): `line()`, `PRICES`, `EXTRA_RATES`, `rebarKg(d, L)`, `roundCost`, `helix`, `v3`, `model()`.

## Parts

```ts
{ id, shape, material, color?, position?, rotationY?, tags?, anim?, exit?,
  edges?, castShadow?, ghost?, xray?, highlight?, idle?, opacity? }
```

Shapes (`engine/types.ts`), world meters:

| kind | use |
|---|---|
| `box {size, at?, rotY?}` · `cylinder {radius, radiusTop?, height, at (bottom)}` · `rod {a, b, radius}` | single pieces |
| `extrude {outline, holes?, y0, y1}` | slabs, pads, screeds |
| `tube {points, radius, bend?}` | pipes, conduits (rounded corners) |
| `merge {shapes}` | several primitives → one mesh |
| **`boxes {items:[{at,size,rotY?}]}`** · **`rods {radius, items:[{a,b,r?}]}`** · **`instances {of, items:[{at,rotY?,scale?}]}`** | **anything repeated** (blocks, tiles, rebar, props, pavers) — one draw call |
| `terrain {grid, from?, ref?, baseY}` | ground variants; `from` morphs (anim `morph`) |
| `drape {outline, grid, lift?, cell?, holes?}` | lawn / gravel / asphalt following the terrain (`holes`: skip cells under paving) |
| `lines {points}` | 1-px string lines |
| `model {name, size?, seed?, pose?}` | `lib/build3d/models` (car, tree, sofa, pump-truck…); front = +X. `pose` is model-specific: pump-truck `[x, y, z, stream]` = hose end in truck space + concrete stream length — use `pumpSpot()` + `pumpPart()` from `steps/structure-kit.ts` |

Materials (`engine/palette.ts`): soil, soilCut, gravel, concrete (fresh→cured automatically), rebar, plywood,
timber, block, plaster, stone, bitumen, roofWhite, glass, aluminum, porcelain, parquet, grass, pipeRed, pipeBlue,
drain, conduit, steel, galvanized, insulation, paint, wood, water, poly, light, glassLit, …

## Animation

`anim: 'rise' | { type, delay?, duration?, stagger?, order?, origin?, from?, ease? }`

- `drop` falls in with a bounce (`from: [0,h,0]`) · `rise` grows up from its bottom · `pour` slow rise (concrete)
- `grow` scales from bottom-center · `fade` · `slide` (`from` offset) · `morph` (terrain)
- `courses` instanced rows bottom-up (blocks) · `sequence` instanced one after another
- Instanced parts with `stagger` animate per instance; `order`: `'index' | 'near' (origin) | 'x' | '-x' | 'z' | '-z' | 'y' | 'courses'`.
  Keep a step's total animation ≲ 5 s (`stagger ≈ 3 / count` for big sets).

`exit` (when a later step removes it): `'fade'` (default) · `'lift'` (default for tag `formwork`) · `'sink'` ·
`'shrink'` · `'slide'` `{to}` · `'none'` (instant; terrain swaps).

## Removing

`remove: { ids?: string[], tags?: string[] }` removes parts of EARLIER steps. Conventions:
`formwork` (+ a step-specific tag like `gb-forms`), `machine`, `site-temp` (fence, container, toilet, sign,
pole, spoil heap → p12-site-walls), `scaffold`, `props`. Terrain: the current ground is part
`terrain-excavated`; a backfill step removes it (`exit` is none for ground) and adds a new
`terrain {grid: newGrid, from: ctx.terrain.excavated}` with id `terrain-<step>`.

## Camera & view

`camera: { fit?: 'parts'|'house'|'site', bounds?, target?, azimuth?, polar?, distance?, zoom?, orbit? }`
— azimuth is degrees relative to the street-front view (0 = from the street, 90 = side, 180 = back);
polar is degrees from straight down (≈ 50 is a nice 3/4). Default frames the step's new parts.

`view: { xray?, ghostAbove?, groundXray?, ghostTags?, lighting? }`
- `xray` (default auto: on when the step's parts are inside the house) — parts between the camera and the
  new parts (≥ 8 % of the sample rays; site clutter/machines: any ray) fade to 0.24. `ghostAbove: y` — parts
  above y fade too, but only where they hide the work (far walls stay, the house keeps its shape).
  Embedded steel and clutter (`rebar` material/tag, slab conduits/boxes, sleeves, void formers, spacers,
  scaffolding) vanish instead of ghosting.
- `groundXray` — terrain translucent (piles, sewer).
- `ghostTags: ['p4-wall-forms']` — parts with these tags turn translucent during the step (see the rebar
  inside its forms).
- `lighting: 'dusk'` — warm low sun, deeper sky; materials `light` and `glassLit` glow (finale).

## Finale totals

The summary overlay (after the last step) sums the bills of materials by convention: lines whose `unitHe` is
`'מ״ק'` and `nameHe` starts with `'בטון'` (concrete), unit `'טון'` with ברזל/זיון/חישוק/רשת in the name (rebar),
unit `'יח׳'` with `'בלוק'` in the name (blocks). Months come from the sum of `durationDays` (22 working days/month).

## Facade

`steps/facade.ts` builds every exterior skin (render, stone, parapet copings, reveals) from the walls,
columns and exposed slab edges — see its header. p10 uses it; other phases should not add exterior skins.

## Rendering notes

Parts with outlines push their faces back (`polygonOffset`) so the outline wins; parts without outlines
(skins) do not, so the edges of what they cover never show through. Keep skins ≥ 5 mm proud of the face
they cover (exterior render 28 mm, stone 36 mm, interior paint ≤ 23 mm).

## Performance

Steps are built once (≈ 120 ms cold in the dev browser; budget 150 ms); `Stage.tsx` also warms the
memoized timeline in idle time while the landing's analysis plays. Use instanced shapes for repeats, keep per-step part counts modest,
don't create geometry in loops of hundreds of `box` parts — use `boxes`.
