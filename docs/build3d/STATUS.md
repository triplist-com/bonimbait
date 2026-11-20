# Plan → 3D — Team Status

Each agent appends to its own section (newest entry on top within the section). Keep entries short.

## Orchestrator
- Branch `feature/plan-to-3d` created from origin/main. three/fiber/drei installed. Sheet image at
  `apps/web/public/build3d/plan-sheet.webp` (3600×3225, = PDF page 1899×1701 pt). Contract in
  `apps/web/lib/build3d/house/types.ts`.

## Extractor

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
