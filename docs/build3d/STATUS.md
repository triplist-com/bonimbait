# Plan → 3D — Team Status

Each agent appends to its own section (newest entry on top within the section). Keep entries short.

## Orchestrator
- 2026-11-21 · Demo complete on `feature/plan-to-3d` (not pushed). Landing hero = 9 real renders
  (`public/build3d/landing/`, phone twins `-800.webp`), /3d OG card, golden-hour finale. Production
  build clean (/3d first load 112 kB; three.js stays in the lazy viewer chunk). E2E (landing →
  sample → analysis → viewer → steps → finale, 1440 and 390 px) passes with no console errors:
  `data/tools/pw/e2e.mjs`, `e2e-intro.mjs`, `landing-shot.mjs`. Open polish: QA #21, #23, #32.
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
- **Cinematographer pass (money shots + last weak spots).** Issues #20, #22, #24–#32 in `docs/build3d/QA.md`.
  - Finale (p13-done): golden/blue-hour rig in `viewer/Stage.tsx` (low warm sun raking from the camera's front-left,
    following the orbit; cool sky fill; exposure +6 %), full-screen deep-blue → amber sky backdrop, landscape darkens at
    dusk, floor shadow catcher hidden. New `engine/runtime/glow.ts`: additive halos at lit panes and garden lamps + light
    pools (lanterns, uplights, in front of door-height glazing); `Part.glow` opt-in for `light` parts; lit glass denser.
    Walls stay warm white, stone glows, windows/bollards/pergola LEDs clearly lit. Before/after: `data/build3d-shots/cine/before/`
    and `cine/after/`.
  - `viewer/Summary.tsx`: waits until the dusk orbit has played ~5 s, then a slim bar (הבית מוכן! · 16 חודשים · ₪2.25M ·
    הצגת סיכום) that expands into the full card; ✕/Esc/backdrop collapse it. Verified at 1440, 390, 360 px (`cine-summary.mjs`).
  - Steps: 45 blocks-lower from the garden side without x-ray; 63 exterior render 3/4 of the garden facade; 69 mamad door +
    window from the west, roof lifted; 70 entry door over the fence into the west porch; 9 mixer backs in clear of the
    toilet, power pole moved off the gate, clutter x-ray + mixer framed; interior plaster fresh grey-beige; magenta highlight
    stronger on dark parts; systems steps (56, 58, 59) look down into the rooms. Highlight walk before/after:
    `data/build3d-shots/cine/walk0-sheet*.png` → `walk1-sheet*.png`.
  - Landing hero renders (one fixed street-side 3/4 camera, UI hidden, dpr 2 → sharp): `public/build3d/landing/f01…f09.webp`
    (1600×1000, 46–115 KB), `frames.json` (steps 1, 5, 11, 43, 44, 46, 64, 85, 86), `public/build3d/og.jpg` (1200×630, 70 KB).
    Re-render: `node data/tools/pw/cine-hero.mjs` (don't edit sources meanwhile: the dev server reloads the page).
  - Dev hooks: `window.__b3d.stage.{freeze, orbitBy}`; tools `data/tools/pw/cine*.mjs` (README "Capture hooks").
- **Integrator pass (final quality)** — issue list + statuses in `docs/build3d/QA.md`; shots `data/build3d-shots/qa/before/` vs `qa/after/`
  (all 86 steps settled at 1440×900 + mid frames; `data/tools/pw/qa-all.mjs`, contact sheets `montage.mjs`).
  - Facades: new `steps/facade.ts` (raster of exterior walls/columns/slab edges → outdoor flood → runs per owner) covers
    every exterior face incl. slab edges, corners, columns, both parapet faces + copings and window reveals; stone full height
    on the street side + porch, plinth only where the entrance floor is on grade. Skins without outlines no longer use
    `polygonOffset` (block edges showed through the render). Brighter fill/hemisphere light on shaded facades.
  - Pump truck: `pose` on the model (slew + unfold to a hose point, no sway, concrete stream); `pumpSpot` parks on the road
    parallel to the kerb (never on the sidewalk/across the fence) and aims over the pour start; `pumpPart()` in every pour.
  - X-ray: occluder-only `ghostAbove`, 0.24 occluder opacity, faint x-ray outlines, embedded steel / roof build-up /
    scaffolding vanish instead of ghosting; site clutter fades as soon as it hides the work; better cameras for windows,
    stairs, kitchen, furniture, mamad, stone/render (scaffolding ghosted).
  - Terrain: backfill closes the working-space pit; light model plinth (base −7.15, 25 cm soil band), road + sidewalk; lawn
    holes under paving; softer rock tint. Dusk applied on deep links. Mixer removed with the piles.
  - Build time: 118–122 ms cold in the dev browser (was ~255–280); timeline also prewarmed in idle time from `Stage.tsx`.
  - STEPS.md has 86 ids (not 87); `tests/build3d/timeline.test.ts` checks order, pump reach, facade coverage, build time.
  - Engine API additions (README): `model.pose`, `drape.holes`, x-ray semantics, facade note.
  - Needs (UX): Summary pops ~span+1.8 s into p13-done and hides the dusk orbit — consider ~6 s (or a "skip to summary" chip).
- **UX polish pass (UX polisher).** Mobile (390x844, 360x740) and tablet (768x1024) verified with headless shots in `data/build3d-shots/ux/` (scripts `data/tools/pw/ux-landing.mjs`, `ux-viewer.mjs`, `ux-perf.mjs`). Landing: shorter hero + tighter drop zone so the sample button is above the fold at 360x740, touch-specific drop-zone copy. Viewer mobile: sheet peek fits header only (body hidden when collapsed), full-width thumb-sized prev/play/next row, 2-line titles, solid sheet background, safe-area insets, compact brand chip below 430 px, 40 px toolbar buttons. Desktop: card scroll fade, `ltr` step counter, current-phase label under the scrubber, hover tooltip with phase + step, focus rings, autoplay = animation + 2.4-3.6 s reading (scales with text) and pauses on orbit/wheel/click. Summary finale redone (brand header, confetti, count-up numbers, both CTAs). Phase names shown as "קומה תחתונה: שלד" (UI-only conversion of the engine's dash, `phaseLabel` in format.ts).
- Numbers: real totals from the built timeline (86 steps, 362 days, ~2.25M ILS, concrete 184 m3, rebar 10.4 t, blocks 5,060) hardcoded in `lib/build3d/content/totals.ts` and used by the analysis animation and the finale. `tests/build3d/totals.test.ts` recomputes from the timeline and fails if they drift > 6 %. The old landing heuristic and "87 steps" are gone (timeline has 86).
- Hebrew proofreading of `lib/build3d/content/**` + landing/viewer strings (kondit -> יתדות, וודאו -> ודאו, זו הרצפה, gender/agreement fixes, p12-garden is now lawn/gravel/beds/trees only; p12-site-walls owns the grading). vitest `tests/build3d` green, tsc and lint clean for build3d.
- Sanity on `/3d/`: FCP ~100-250 ms localhost, CLS ~0, no console errors/warnings, no horizontal scroll at any tested width.
- Open: the Summary's 125 m3 recap line in p6-strip-all (step data, not mine) is excluded from the concrete total to avoid double counting; materials use both `מ״א` and `מ׳` for meters across steps.

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

## Precast author

Method `precast` is built: 75 steps (12 new `p4p/p5p/p6p/p7p/p10p` steps + shared ones), timeline build ~100 ms.
- Code: `steps/methods/precast/{kit,structure,envelope,index}.ts` (panel plan with cast-in openings on each wall's own centerline and thickness, hollow-core plank layout, crane stand + hook poses, push-pull props), `models/crane.ts` (mobile crane, posed per step like the pump truck; registered in `models/index.ts`), `content/steps-precast.ts`, `METHOD_TOTALS.precast`.
- The crane stands on the street shifted along the kerb so it never overlaps the shared pump spots; it is re-posed (new model part, instant swap) in each lifting step toward the work area. Max reach to a panel centre ~29 m (text says 120 t crane).
- ממ״ד: precast module (walls + lid, ~32 t), worded as an approved-model option needing פיקוד העורף confirmation, not the default.
- Weak: panels are one per wall run (29 total, joints only where a run exceeds ~3.9 m), so grout/sealant are modest; hollow-core planks are fragmented by the region cut lines (91 + 94 boxes); the hook does not follow each individual panel; cost is +13% vs concrete (research says +3-5%) because the module, parapets and crane days are priced as in the numbers sheet.

## UX-Methods
- 2026-11-21 · **Method picker, switcher, method-aware analysis and finale.**
  - Flow: landing ("נסו עם תוכנית לדוגמה" or an accepted file) → `landing/MethodPicker.tsx` ("באיזו שיטה תרצו לבנות?",
    five cards, concrete preselected + focused, one tap starts; arrows/Home/End/Esc; `?pick=1` opens it) → `Analysis`
    with `method` (quantities = concrete + `extra`, else rebar/blocks; step count; "מתכנן את שלבי הבנייה …") → viewer.
    `?method=` is written on pick; Build3DApp / ViewerClient keep `method`, `initialStep`, `intro` in state.
  - Numbers everywhere (picker, switcher, bar, card, comparison): METHOD_TOTALS at render time — months = days/22 to the
    nearest half ("כ-15 חודשים"), cost delta vs concrete ("כ-4% יותר" / "אותו מחיר" within ±1%), money "2.25 מיליון ₪".
    METHODS_INFO only for names/tagline/badge/scores/phase names. Helpers: `landing/methodUi.tsx`.
  - Viewer: `viewer/MethodSwitcher.tsx` in the header beside the logo (wraps under it when the row is too narrow), menu
    with menuitemradio items. Switch → `viewer/methodSwitch.ts`: same step id → first step of the same phase → last step of
    the nearest earlier phase; URL `?method=&step=` via replaceState; remount with `intro='none'`.
    Finale "צפו בבנייה ב…" uses `divergenceStep` (start of the phase where the two step lists first differ).
  - Phase names per method: `engine/phases.ts` — `PHASES[i].nameHe` is a getter for the active method
    (`setPhaseMethod(method)` in AssemblyViewer's render), plus `phaseNameHe(id, method)`. StepCard/Scrubber/StepList
    pick it up unchanged. StepList header: ink text (was phase color, low contrast), long names wrap beside the count.
  - `Summary.tsx`: method totals + signature tiles, comparison of all five (months, cost + delta, scores, this-house
    steps/concrete/signature qty, "צפו בבנייה ב…"), "שתפו" (copies `/3d/?method=&step=`, toast), "חזרה לבחירת שיטה"
    (picker overlay inside the viewer), keys inside the dialog no longer step the viewer. At the last step "הבא" →
    "סיכום והשוואה" (opens the card). Bar: "כ-15 חודשים · 2.3 מיליון ₪" (same months as the card; no "M"); in the
    sheet layout it sits above the sheet (`sheetPeek={mobile ? PEEK : undefined}` from AssemblyViewer).
  - **For UX-Manual (your files, not edited):** StepCard phase pill — add `whitespace-nowrap max-w-full truncate` (+ `title`)
    so long method names ("קומה תחתונה: הרכבת פאנלים") don't break the header; Scrubber phase label — ink text with a
    color dot (11.5 px colored text fails contrast for light phases) and clamp so long names don't overflow the bar.
  - Thumbnails: cards load `/build3d/methods/<id>-800.webp` and fall back to a token-tinted pattern + icon (404s in the
    console until the renders exist). Tests: `tests/build3d/method-switch.test.ts`. Shots: `data/build3d-shots/ux-methods/`
    (`data/tools/pw/ux-methods.mjs --size=WxH --only=picker,analysis,switch,finale`).

## ICF author

Method `icf` is built: 82 steps (9 new: `p4i-icf-{courses,rebar,bracing,pour}`, `p6i-icf-{courses,rebar,bracing,pour}`, `p7i-icf-parapets`; 13 shared steps re-worded in `content/steps-icf.ts`). Totals: 326 work days, 2,301,100 ILS (+0.8 % vs concrete), 216 m³ concrete, 10.8 t rebar, 2,211 blocks (partitions only); extras 654 ICF forms, 39 m³ EPS, 234 m² ICF wall.
- Code: `steps/methods/icf/icf-kit.ts` (geometry), `steps/methods/icf/structure.ts` (phases 4-7), `steps/methods/icf/index.ts` (CONCRETE_PHASES with phases 4-7 swapped), `content/steps-icf.ts`, `METHOD_TOTALS.icf`. No new material/model: EPS = `insulation` recolored (`EPS_COLOR`), webs = `drain` recolored.
- Geometry: per storey the ICF footprint is the exact union of the exterior/retaining wall rects + the columns standing in those wall lines (full-width-opening beams L-N2/E-SN stay slab beams), so every EPS face is on a house wall face and the shared skins land as in concrete. EPS = 5 cm inward band on every boundary face, 1.2 x 0.4 m blocks in running bond, corner ownership alternating per course (interlocking corners), openings cut out, timber bucks + a diagonal brace in each (tag `formwork`, fade out at `p6-strip-all`, then the shared blind frames). Core = footprint minus the bands: webs every 20 cm per course (tag `spacers` so x-ray hides them), rebar on the core centerlines (V @40 cm, retaining @20 cm Ø14, starters into the slab above; H per course; lintel bars over openings), concrete in 1.1 m lifts sweeping from the hose. Rebar and pour steps ghost the EPS + webs (`ghostTags`) so the steel and the rising concrete read. Alignment braces on the inner faces only (upright, blue kicker to a foot plate, bracket + strut, two walk boards, guard posts + rails, workers on the boards during the pour); the lower set comes off at `p4-waterproofing`, the entrance set at `p6-roof-deck` (both also tagged `formwork`).
- Shared phase 4-6 steps come from the concrete builders run ONCE on an "ICF view" of the house (`icfModel(ctx).ictx`): every ICF wall is added as a wall-shaped column (token height) so decks/props treat it as a support, and the lower slab outline is trimmed to the ICF inner faces. Walls are untouched, so waterproofing, backfill and the cast-in-place ממ״ד are exactly concrete's. `p4-columns-*` / `p6-columns*` dropped; the one free-standing column (C-E12) gets its cage in `p6i-icf-rebar`, a plywood box in `p6i-icf-bracing`, and is cast in `p6i-icf-pour`. `p5-props` also clears the slab-pour machines/tiles (no column step in between).
- Deviations from METHODS.md: braces leave earlier than `p6-strip-all` (realistic, keeps p4 slab / p5-p6 shoring uncluttered). Durations: research table used except the lower floor (model has ~115 m² of ICF there, research assumed 225 m²): courses 4, rebar 2, bracing 2, pour 1 days. Re-worded shared steps shorten where ICF is faster (electrical 9→7, plumbing 6→5, interior plaster/boards 18→14, strip 4→3) and the EPS render is 11→12. Total 326 days ≈ 14.8 months; `METHODS_INFO.icf.months` says 13 (researcher to reconcile). Cost is geometry × research rates (+0.8 %), research's headline is +3 %.
- Weak: timeline build ~155-170 ms in the dev browser (concrete ~120; node cold +13 ms after the single-run ICF view); the model's walls stay 20 cm (5+10+5), the text describes a real 15 cm-core block; webs are plain plates; the ICF pour hose aims at the wall nearest the gate only (lifts still sweep around the house).
- Verify: `/3d/viewer/?method=icf&step=15..46`; shots `data/build3d-shots/icf/` (`all/` = full walk, `sheet-all.png`).

## UX-Manual
- 2026-11-21 · **Viewer reads as an assembly manual** (AUDIT top-10 #1-8, #10; P2 #1-4; P3 #7, #9-11, #13, #15).
  - "New this step" (`engine/runtime/director.ts`, `materials.ts`): the step's parts keep a resting magenta tint +
    full-magenta outlines after their animation (two soft breaths, then steady; saturated parts get less tint so they
    keep their color), finished parts are muted toward warm paper gray (shared color-lerp variants, terrain via one
    shader variant at 55 %), no postprocessing. Toolbar "הדגשת החלקים החדשים" (off = the old brief magenta only).
    `director.setFocus(on)`, `director.reducedMotion`. Capture tools that want the old look: `setFocus(false)`.
  - Interior peel: phases 9 and 11 (x-ray on, work inside the house) lift + fade what is above the cut instead of
    ghosting it (cut = `view.ghostAbove`, else just above the new work). Fast key repeat / scrubbing (< 0.3 s per step):
    new parts fade in fully built (no half-built flicker). `director.calloutAnchor()` = a point on the new parts.
  - Stage: numbered callout pin (step number + title) on the new parts, hidden while the camera moves, outside the
    unobstructed rect, at dusk and with emphasis off; portrait never zooms past the fit (finale fits 390 px); reduced
    motion = camera cuts, no step orbit, no pulse / peel lift.
  - Card: `PartsPanel.tsx` tiles (icon per material kind by keyword over `nameHe`, 41 kinds + generic, token tones;
    `tests/build3d/parts-panel.test.ts` keeps generic < 10 % per method), number/title/description/parts/duration+cost,
    the rest in "פרטים נוספים" (stays open across steps), "שלב הבא · …" row with a ← hint; no fade overlay.
    Phone peek (272 px + safe area): title, parts scroller, "3 ימי עבודה · 22,000 ₪", scrubber, nav; expanded sheet =
    description + all details. Sheet layout up to 900 px and portrait tablets (< 1200), sheet max 640 px wide.
  - Polish: per-step progress line (CSS), card fade, Space ignores focused buttons/links/summary, scrubber keys
    (arrows, PageUp/Down = phase, Home/End) + aria-orientation, 44 px toolbar on touch with text tooltips, view toggles
    grouped in a "תצוגה" menu on phones (`ViewMenu.tsx`), phase pill truncates, scrubber phase label ink + dot,
    landing header/footer links 44 px.
  - Not done: hold the camera until the previous animation ends; per-room paint colors (step authors); explode view.
  - Shots `data/build3d-shots/ux-manual/` (`after-d/` finishing steps 1440, `m*/` phone, `t*/` tablet); tools
    `data/tools/pw/uxm-keys.mjs` (keyboard/a11y checks), `uxm-measure.mjs`, `uxm-montage.mjs` (`--ar=844/390`).

## Frame author

Methods `steel` (LSF) and `timber` are built from one framing kit: 86 steps each (12 own steps + 10 shared steps re-worded per method). Totals: steel 332 work days, 2,399,000 ILS, 142 m³ concrete, 8.33 t rebar, 0 blocks, extras 5.0 t light steel, 402 m² cement board, 660 m² gypsum, 272 m² rock wool; timber 331 days, 2,401,000 ILS, same concrete/rebar, extras 19.5 m³ timber, 347 m² OSB, 660 m² gypsum, 242 m² mineral wool.
- Code: `steps/methods/frame/spec.ts` (STEEL / TIMBER specs: sizes, colors, rates, Hebrew BOM names), `frame/walls.ts` (sections, framing per wall, panels + raise groups, instanced C-studs / U-tracks, braces, hold-downs, boards), `frame/roof.ts` (ממ״ד ceiling slab, joists + rims + girder + blocking + hangers, deck + edge closures, ceiling boards), `frame/phases.ts` (phases 6, 7, 8, 10 composed with `pick`), `methods/{steel,timber}/index.ts` = `framePhases(spec)`. Content: `content/steps-{steel,timber}.ts`. New materials (palette + MaterialKey): `lumber`, `osb`, `cementBoard`, `gypsum`, `houseWrap`, `mineralWool`. No new models.
- Steps (s/t): p6 shared slab + ממ״ד → `p6x-mamad-roof` (new, not in METHODS.md: the ממ״ד needs its own 25 cm concrete ceiling once the roof is light) → `p6s-tracks` / `p6t-sole-plates` → `p6x-walls` → `p6x-roof-joists` → `p6x-roof-deck` → `p6-strip-all` (shared, own bill) · p7 `p7x-lower-infill`, `p7x-partitions`, `p7x-parapets`, `p7-blind-frames` · p8 `p8x-taper` (tapered EPS from the screed cells) + shared insulation/membrane/coat/equipment · p10 scaffolding → `p10x-sheathing` → `p10x-insulation` → `p10x-drywall` → shared stone/render/down.
- Geometry: everything inside each house wall's thickness: exterior face → cement board 12 mm | wrap 2 mm | (timber OSB 11 mm) | studs | 10 mm (the interior skin's embedded part). Gypsum boards use the exact p10-plaster-interior skin geometry (split into 1.2 m sheets) and tag `plaster-interior`; concrete walls (ממ״ד, podium) get the same plaster skin as concrete. So p11-paint and the facade skins land exactly as in concrete; `p13-done` matches (shots `frame/s4/86` vs `frame/c4/86`). Entrance columns become stud-pack posts (pseudo walls) so the facade's column skins sit on framing; their interior faces get gypsum tagged `drywall-post` (stays after paint). Roof: 22.8 cm joists on the 3.05 top plates + 22 mm deck → deck top = concrete roof top 3.30, so phase 8 is unchanged; gypsum ceiling boards under the joists (tag `ceiling-boards`, stay).
- Framing: studs @ 60 cm (parapets 40), king + jack studs and a header at every opening (beam over the E-SN vitrine: HEA / glulam), cripples above headers and below rough sills, plates cut at doors, timber double top plate + noggins, steel U-tracks + bridging channels + X-straps on solid exterior panels, hold-downs at wall ends and big openings, anchor bolts ~1 m. Panels ≤ 3.0 m (steel) / 2.44 m (timber) never break inside an opening; panels grouped by angle around the house and dropped group by group (6 groups entrance, 3 lower, 5 partitions, 3 parapets), braces (`formwork`, removed by `p6-strip-all`) fade in after each group.
- Composition fixes: `p6-mamad-rebar` (picked) also removes `p6-gs-machine`, `pour-tiles`, `p6-gs-edge-forms` (concrete clears them in its column steps). Insulation/drywall steps ghost `cement-board`, `house-wrap`, `osb` (+ `wall-insulation` for drywall) so the batts / boards read from outside.
- Deviations: costs are research rates × this model's quantities → both +5 % vs concrete (research headline: steel −2 %, timber +3 %; the concrete model has no wall insulation or ceiling finish, the frame methods do). Days 332/331 ≈ 15 months vs METHODS_INFO 11 (shared phases 3–5 and 11–13 dominate; researcher/UX to reconcile).
- Weak: p9 pipes are the shared surface-mounted geometry (2 cm proud of the face), so they sit just in front of the studs rather than inside the cavity; the drywall step reads best mid-animation (new ceiling boards cannot be ghosted); timber joists highlight very red; X-straps only on opening-free panels (few); no crane/forklift model; braces are rods (steel blue push-pull props, timber round poles).
- Verify: `/3d/viewer/?method=steel&step=39..64`, `?method=timber`; shots `data/build3d-shots/frame/`: `sheet-steel.png` / `sheet-timber.png` (steps 33–64 walk, `walk-*/`), `phone/m.png` (390×844), `s4/86` vs `c4/86` (finale vs concrete).
