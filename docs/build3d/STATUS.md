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

## Landing

## Step authors

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
