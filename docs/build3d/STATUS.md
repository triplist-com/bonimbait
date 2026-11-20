# Plan → 3D — Team Status

Each agent appends to its own section (newest entry on top within the section). Keep entries short.

## Orchestrator
- Branch `feature/plan-to-3d` created from origin/main. three/fiber/drei installed. Sheet image at
  `apps/web/public/build3d/plan-sheet.webp` (3600×3225, = PDF page 1899×1701 pt). Contract in
  `apps/web/lib/build3d/house/types.ts`.

- overlay.json: removed two stray 50×742 pt blue rects (x≈821 / 1605, a non-wall blue fill) from the concrete wall paths by hand — re-running scripts/build3d would bring them back; filter fills wider than ~1 m if regenerated.

## Extractor
- DONE `house.json` (full model, type-checks against `types.ts` as a strict TS literal, ~64 KB) + `overlay.json` final.
  Counts: walls 124 = 57 storey (14 concrete, 43 block) + 12 roof parapets + 4 site retaining + 49 boundary-fence
  pieces; openings 32 (13 doors with `swingSide`); rooms 20; columns 18 (all drawn blue stubs, none inferred);
  fixtures 59; outdoor 17; slabs 5; stair 1 (19 risers × 0.171); terrain grids 30×38 @ 1 m; 43 spot elevations.
  Frame: origin = entrance NW outer corner, page (422.92, 562.76) / lower (1207.72, 562.76); scale 1:100
  (fit 0.0352832 vs nominal 0.0352778 m/pt, max resid 0.27 cm over 22 dims). Lower floor −3.25, roof top +3.30.
  Lot 511.6 m², built footprints 238.5 m². Fixture convention (size/rotation/front) in `docs/build3d/extraction.md`.
  Also `public/build3d/plan-entrance.webp`, `plan-lower.webp` (per-viewport, bbox in extraction.md).
  Checks: `scripts/build3d/render_check.py` → `data/build3d-shots/extract/` (inverse-transform overlays, model plot,
  terrain). Uncertain: heights/sills are assumptions (no sections), 9 room names descriptive (unlabelled on plan),
  natural terrain interpolated from boundary survey only.
- MILESTONE 1 (overlay) DONE: `apps/web/lib/build3d/house/overlay.json` (type `PlanOverlay`, sheet page points,
  viewBox `0 0 1899 1701`). Viewports: entrance bbox [181.36,209.12,939.88,1321.52], lower [966.16,209.12,1724.8,1321.52].
  Contents: wall fills as 4 SVG paths (entrance/lower × concrete/block, exact hatch rectangles), 32 openings
  (x,y = center, w = width pt, angle 0|90), 20 rooms (Hebrew name, label point, m², polygon `d`), 12 dims, lot boundary
  (both viewports), 11 elevation labels, stats. A first `house.json` is also written (being refined).
  Regenerate: `data/build3d-venv/bin/python -I scripts/build3d/extract.py`.

## Engine
- **[22:40] Engine/viewer polish + features for authors.** Added `view.lighting: 'dusk'` (+ glowing palette keys
  `light`, `glassLit`), `view.ghostTags`, `camera.orbit`, finale Summary overlay (months, concrete m³, rebar t,
  blocks, cost; "צפו שוב מההתחלה" / "לאתר בונים בית"), responsive card width, RTL keyboard (← next, → prev, space).
  Perf on M1 Pro (real GPU, 266 parts, 2048×1536): ~0.5 ms/frame (419 draws, 361k tris), 1.6 ms with ghost
  preview; all parts build progressively in idle slices (~200 ms total). Headless swiftshader is far slower — the
  dev-only `window.__b3d.director.timeScale` speeds animations for screenshots. Shots: `data/build3d-shots/engine/`.
  Known: one author's compile error 500s the whole viewer (static imports); keep `npx tsc` green before saving.
- **[21:55] API ready, viewer up, real house.json integrated.** `/3d/viewer/?step=N` (and `&intro=plan`) renders
  phases 0–3 (14 steps) on the extracted house. Step API + authoring guide: `apps/web/lib/build3d/engine/README.md`.
  Files: `lib/build3d/engine/{types,phases,palette,anim,timeline}.ts`, `engine/runtime/{director,part,geometry,materials}.ts`,
  `lib/build3d/house/{index,stub,geometry}.ts`, `lib/build3d/steps/{index,context,kit,p00-plan,p01-site,p02-earthworks,p03-foundations}.ts`,
  `components/build3d/viewer/{AssemblyViewer,Stage,StepCard,StepList,Scrubber,BottomSheet,Summary,format}.tsx`, `app/3d/viewer/`.
  Landing: `AssemblyViewer` default export, props `{ initialStep?: 1-based, intro?: 'plan'|'none', className? }`; it
  fills its parent and reads/writes `?step=` itself. The intro starts top-down on `/build3d/plan-entrance.webp`
  (prefetch it during the analysis) fitted to the viewport height, drawing-up = screen-up, then glides to 3/4.
  Note for Content: the municipal sewer runs at the BACK of plot 43 (manholes I.L. 264.44 on the sheet), so the
  p3-sleeves geometry routes the sewer to the back lot line, not to the street.

## Landing

## Step authors
- Step author A (structure): phases 4-6 done (30 steps: p4 x12, p5 x7, p6 x11). Files `steps/p04-lower-structure.ts`, `p05-lower-ceiling.ts`, `p06-entrance-structure.ts`, shared `steps/structure-kit.ts` (exact rectilinear `Region` for walls/slabs/decks with outward face edges + corner-aware bands, wall formwork = plywood panels + studs + steel walers + ties/wing nuts + push-pull braces, two-layer wall mesh with starters where a slab covers them, column cages (dense end zones) + boxed forms with clamps, slab grids, props + H20 primaries/secondaries, 1.22x2.44 deck sheets cut at the faces, pour tiles sweeping out from the pump hose, pump-truck stand search, and `structureFrame(ctx)`: slabs, wall groups, regions, levels, backfill grid). Registered after phaseFoundations.
  - Contract for others: p4-backfill swaps `terrain-excavated` -> `terrain-backfill` (tags `ground`,`terrain`; grid `structureFrame(ctx).backfill`). Concrete walls are cast from the grade-beam top (-3.53); fully open concrete walls (L-N2, E-SN) are beams cast with the slab above. Slabs = instanced pour tiles (no edges) + a `lines` outline. Tags: `formwork`, `props`, `machine`, `rebar`, `concrete`, `slab`, `level:*`, `sleeves`, `ceiling-box`, `conduit`, `mep-ceiling`, `mamad-frame`, `mamad-sleeves`. p6-strip-all removes every `formwork`/`props` part (decks sink, edge forms lift) - the bare skeleton with a slow orbit.
  - Pour steps swap the forms for translucent copies (`formGhosts`) so the concrete is seen rising: the engine x-ray ignores occluders in the last 3 % of the camera->sample segment, so forms hugging a wall never ghost.
  - Pour tiles (sweep) are tagged `pour-tiles` and dropped by the next step; a seamless extruded slab fades in at the end of the sweep (instanced tiles show hairline seams). Keep embedded steel >= 6 cm below exposed concrete faces: the palette's polygonOffset sinks far, oblique faces by ~3 cm and closer bars speckle through.
  - Numbers: ~10.5k instances over 30 steps; p4-p6 build ~45-55 ms cold / ~15 ms warm (node), skeleton estimate ~330k ILS.
  - Verify: `/3d/viewer/?step=15..44`; screenshots `data/build3d-shots/steps-a/` (script `data/tools/pw/steps-a.mjs` advances `window.__b3d.director` so swiftshader frames don't matter).
  - Needs (Models, not blocking): the pump-truck boom pose is fixed (hose 10.4 m ahead, 6.1 m up) and sways +/-4 deg. From the street the hose reaches z ~= 11.4 only, so the lower-floor pours (walls, lower slab, lower ceiling) start 2-3 m from the hose. A reach/slew option and a no-sway flag would put the hose over the pour.
- Step author C (finishes, landscape, handover): phases 11-13 done (23 steps: p11 x12, p12 x7, p13 x3). Files `steps/p11-finishes.ts`, `p12-landscape.ts`, `p13-handover.ts`, shared `finish-kit.ts` (opening geometry, face runs, room tiling, fixture transforms). Registered after phasePlaster in `steps/index.ts`. Derived from the house model: tiles/parquet per room polygon (instanced, `sequence` sweep), bath wall tiles to 2.4 m per wall face with openings cut out, gypsum drops in halls/wet rooms, aluminum frames + `glassLit` panes for every window/vitrine/slider (+ guard rail in front of the garden-facing vitrine), steel blast door/window, slatted entry door, ajar interior doors with casings, full U-stair (sawtooth core, parquet treads, glass rail), kitchen (box-built runs where a window sits over the counter), sanitary models, paint skins (0.012-0.023 proud, cover B's 15 mm plaster; `p11-paint` removes `plaster-interior`), lighting with `light` material (spots, strips, pendants, sconces). p12: coursed stone fence + gate piers (street fence left open over the parking), pavers/slabs/steps per outdoor polygon, terrace deck, pergola, lawn/gravel/beds/trees, outdoor furniture. p13: furniture + rugs/pictures/plants, two cars sliding in, `view.lighting: 'dusk'` finale with orbit.
  - Deviation: the final grading (`terrain-finished`, morph from `structureFrame(ctx).backfill`) happens in **p12-site-walls** (retaining walls hold the grade) instead of p12-garden, so pavers/paths always sit on their final ground. p12-garden adds lawn/gravel/beds/trees only.
  - Needs: none (dusk uses `view.lighting: 'dusk'`, lamps use materials `light` / `glassLit`, both already in the engine).
  - Verify: `/3d/viewer/?step=N` (ids: p11-flooring ... p13-done); screenshots in `data/build3d-shots/steps-c/`.
- Step author B (envelope & systems): phases 7-10 done (20 steps: p7 x6, p8 x5, p9 x4, p10 x5). Files `steps/p07-masonry.ts`, `p08-roof.ts`, `p09-systems.ts`, `p10-plaster.ts`, shared `envelope-kit.ts` (block laying + lintel cut-outs, wall skins, stone courses, nearest-wall/Manhattan routing, roof cell grid with 3% fall to 4 drains). Registered in `steps/index.ts` after phaseFoundations/structure. Facades: stone full-height on the south/street side and entry porch, 90 cm stone plinth + white render elsewhere on the entrance floor, render on lower floor and parapets. Tags per STEPS.md (`mep-in-wall`, `mep-under-floor`, `duct`, `roof-membrane`, `scaffolding`, `plaster-interior`, ...). Known simplifications: pipes cross walls in floor/ceiling runs; terrace parapets (concrete in the model) are laid as blocks; at last check the roof slab (p6) was not yet registered so roof layers float.

## QA

## Content
- `apps/web/lib/build3d/content/`: `index.ts` (PHASES, STEP_CONTENT, SUMMARY, re-exports PRICES), `prices.ts`, `steps-a.ts` (phases 0-6), `steps-b.ts` (7-13), `types.ts`, `content.test.ts`. All 87 STEPS.md ids covered; ~362 working days (~16.7 months); video hrefs are `/video/<youtube_id>/`, all verified against videos.json.
- Note: `vitest.config.mts` only includes `tests/**`, so `content.test.ts` is not picked up by `vitest run`. Run it with a config whose `test.include` has `lib/build3d/content/**/*.test.ts` (or move/copy the file under `tests/`). Passes 6/6.

## Models
- `apps/web/lib/build3d/models/**` done: all 46 `ModelName`s, API exactly as specced (`createModel`, `MODEL_NAMES`). Files: `kit.ts` (material cache, `Acc` merge-by-material builder), `nature.ts`, `furniture.ts`, `equipment.ts`, `site.ts`, `index.ts`.
- Meters, origin bottom-center, front +X (sofa/counter/wardrobe/tv/island length along Z; beds length along X, head at -X). `size` scales non-uniformly, a 0 entry keeps natural size. Static models are cached per `name|seed|color` and cloned (shared geometry/material); animated ones are built fresh.
- Animated (`root.userData.animate(t)`): excavator, drill-rig, pump-truck, mixer-truck, roller, worker, surveyor. `userData.parts`: excavator {swing,boom,stick,bucket}, mixer {drum}, roller {drum}, drill-rig {auger}, pump-truck {boom, tip} (tip = Object3D at the hose end, in boom space; use `tip.getWorldPosition`), surveyor {head}. Never `clone()` an animated model (closures); call `createModel` again.
- Each model is one mesh per distinct color (typically 3-10 meshes). Gallery: `/3d/models-gallery/` (`?only=a,b&cols=3&cell=6&spin=0`). Screenshots: `data/build3d-shots/models/` (`all.png`).

## Needs (blocked on orchestrator)

### Landing (update)
- `/3d/` built: `app/3d/page.tsx`, `components/build3d/app/{Build3DApp,ViewerSlot}.tsx`, `components/build3d/landing/{Landing,HeroVisual,DropZone,Analysis,Counter,fileCheck,overlayData}.ts(x)`.
- Landing interactive ~100-250 ms on localhost. File check client-side (size 489533 or >=3 of: Title (Model), AutoCAD, MediaBox 1899x1701). Analysis ~8.6 s (10 stages, skip button, reduced-motion ~55 %), ends with CSS 3D tilt + crossfade; viewer chunk prefetched at start.
- TODO when files land: replace `landing/overlayData.ts` mock with `@/lib/build3d/house/overlay.json`; make `app/ViewerSlot.tsx` re-export `../viewer/AssemblyViewer`. Screenshots in `data/build3d-shots/` (script `landing.mjs`).
