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

## Needs (blocked on orchestrator)

### Landing (update)
- `/3d/` built: `app/3d/page.tsx`, `components/build3d/app/{Build3DApp,ViewerSlot}.tsx`, `components/build3d/landing/{Landing,HeroVisual,DropZone,Analysis,Counter,fileCheck,overlayData}.ts(x)`.
- Landing interactive ~100-250 ms on localhost. File check client-side (size 489533 or >=3 of: Title (Model), AutoCAD, MediaBox 1899x1701). Analysis ~8.6 s (10 stages, skip button, reduced-motion ~55 %), ends with CSS 3D tilt + crossfade; viewer chunk prefetched at start.
- TODO when files land: replace `landing/overlayData.ts` mock with `@/lib/build3d/house/overlay.json`; make `app/ViewerSlot.tsx` re-export `../viewer/AssemblyViewer`. Screenshots in `data/build3d-shots/` (script `landing.mjs`).
