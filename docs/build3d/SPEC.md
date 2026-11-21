# Plan → 3D Assembly ("בונים בתלת-ממד") — Team Spec

Owner: orchestrator (main Claude session). Branch: `feature/plan-to-3d`. Deadline: demo-ready within 24h.
Read this whole file before you start. Team status lives in `docs/build3d/STATUS.md`.

## 1. The product (what the demo must feel like)

An IKEA-instructions-style 3D assembly viewer (think sael.ai) — but for an entire private house in Israel.

1. **Landing** at `/3d/` (this is "the homepage" of the demo). Hero: "מתוכנית לבית — צעד אחר צעד".
   A big drop zone: "גררו לכאן את תוכנית ההגשה (PDF)" + a secondary button "נסו עם תוכנית לדוגמה".
2. **Upload → analysis animation** (must FEEL fast: ~7–9 s total, skippable). The uploaded sheet appears
   (we show `/build3d/plan-sheet.webp`, the real sheet), then staged, narrated "AI reading the plan":
   locate the two drawings → trace lot boundary + elevations → detect walls (concrete in blue, blocks in red,
   counter ticking up) → openings → rooms (Hebrew names pop in with m²) → read dimensions → "computing
   quantities: concrete m³, rebar t, blocks" → "planning N construction steps" → the plan tilts into
   perspective and hands off to the 3D viewer, where the same plan lies on the ground of the lot.
   Narration lines in Hebrew, one at a time, with a progress rail.
3. **3D assembly viewer**: the house is built step by step from bare sloped lot to the finished, furnished house.
   Every construction detail is a step: staking, excavation, piles (drill → cage → pour), grade beams
   (formwork wood → rebar steel → concrete pour → strip), retaining walls, slabs, columns, mamad, roof,
   blocks course by course, waterproofing, plumbing/electrical, plaster, stone cladding, windows, floors,
   kitchen, landscaping, pergola, furniture, lights on at dusk.

Only this one house is supported (plot 43, sheet `Home-Model.pdf`, AutoCAD, 1899×1701 pt, 489,533 bytes,
one page, two plans at 1:100: "קומת כניסה" left, "קומה תחתונה" right). Any other PDF → a friendly Hebrew
message ("בגרסת ההדגמה ניתן לנתח רק את תוכנית מגרש 43") with a button to continue with the sample plan.
No server work: everything runs client-side; the PDF never leaves the browser.

## 2. Architecture

- Next.js 14 App Router inside `apps/web`, route `/3d/` (trailing slash is enforced by middleware).
  Page is `noindex`. Site header/footer are hidden for `/3d` via `components/platform/SiteChromeGate.tsx`.
- 3D: `three@0.173.0`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0` (already installed — React 18).
  **Do not install other packages.** If you truly need one, write it under "Needs" in STATUS.md and stop.
- The 3D viewer is client-only and loaded with `next/dynamic` (`ssr: false`), prefetched while the analysis
  animation runs so the hand-off is instant.
- Single page state machine: `landing → analyzing → viewer`. Deep link: `/3d/?step=12` opens the viewer directly
  at step 12 (use `history.replaceState` to keep `?step=` in sync while navigating).
- House data is static JSON generated offline from the PDF (`lib/build3d/house/house.json`), typed by
  `lib/build3d/house/types.ts` (the contract — do not change it without the orchestrator).
- Steps are generated in the browser from the house model by pure functions (fast: < 150 ms total).

### Directory ownership (edit ONLY what you own)

| Path | Owner |
|---|---|
| `apps/web/lib/build3d/house/types.ts` | orchestrator (contract) |
| `apps/web/lib/build3d/house/house.json`, `overlay.json`, `scripts/build3d/**`, `docs/build3d/extraction.md` | **Extractor** |
| `apps/web/lib/build3d/house/index.ts`, `stub.ts`, `geometry.ts` | **Engine** |
| `apps/web/lib/build3d/engine/**`, `apps/web/components/build3d/viewer/**` | **Engine** |
| `apps/web/lib/build3d/steps/**` | Engine creates the API + first vertical slice; later **Step authors** own per-phase files |
| `apps/web/app/3d/**`, `apps/web/components/build3d/landing/**`, `apps/web/components/build3d/app/**`, `SiteChromeGate.tsx` | **Landing** |
| `apps/web/public/build3d/**` | shared — add files, never delete others' files |
| `docs/build3d/STATUS.md` | everyone appends to their own section |

Never run `git commit`, `git checkout`, `git stash`, `git reset` or `npm install`. The orchestrator commits.

## 3. Coordinate frame & units

See the header of `types.ts`. Meters. +X drawing-right, +Z drawing-down (toward the street/parking), +Y up,
Y=0 at ±0.00 = 271.50 abs (entrance floor). Lower floor finished level ≈ −3.27 (drawing). Origin: the extractor
picks it (recommended: a stable house corner) and documents it in `docs/build3d/extraction.md`.

## 4. Engine contract (Engine agent finalizes in `lib/build3d/engine/types.ts`)

A **Step** = metadata + the **parts** it adds + parts it removes:

- metadata: `id`, `phase`, `titleHe`, `descHe` (2–3 short sentences, practical, like a site engineer
  explaining), `durationDays`, `crewHe`, `materials: {nameHe, qty, unitHe}[]` (computed from geometry),
  `costILS` (rough estimate, labelled as such in UI), `tipHe` (one practical builder tip), `searchQuery`
  (Hebrew query → link to bonimbait `/search/?q=`), optional camera hint and view flags (e.g. x-ray / ghost
  levels above so interior work is visible).
- **parts**: declarative shapes (box, cylinder, extruded polygon, tube/polyline, instanced boxes/cylinders for
  rebar/blocks/tiles/piles, plus named custom models like car, tree, sofa, toilet, truck) with a material key,
  tags, and an entry animation: `drop` (falls in from above with a little bounce), `rise` (grows up from the
  ground), `pour` (concrete fills up inside its formwork), `grow` (scale from origin), `fade`, `slide`,
  `courses` (blocks/tiles appear row by row), `sequence` (instances appear one after another).
- **remove**: ids/tags of earlier parts that disappear in this step (formwork stripping, props, temporary
  site items, the natural terrain replaced by the excavated terrain, etc.).

Viewer behaviour: parts of steps < current are shown settled; the current step's parts animate in and are
**highlighted** (accent outline / tint for ~1.5 s, then settle); future parts hidden (toggle: faint ghost
preview). Going back: later parts vanish quickly. Jumping far: only the target step animates.
Camera eases to frame the current step's new parts (step can override), user can orbit/zoom any time.
Interior steps: geometry above/in front fades to translucent ghost automatically (x-ray).

## 5. Phases (target ≈ 60–80 steps total; Hebrew names)

0 התוכנית (plan on the lot) · 1 הכנת המגרש (survey/staking, fence, site office, toilet) · 2 עבודות עפר
(excavation of the lower floor into the slope, working space, compaction) · 3 יסודות (piles: drilling, cages,
pour; grade beams/caps: formwork, rebar, pour, strip; underground drainage & sewer sleeves) · 4 קומה תחתונה
— שלד (retaining walls: rebar, formwork, pour, bitumen + drain + backfill; slab on grade: gravel, poly sheet,
mesh, pour; columns: cages, forms, pour) · 5 תקרת קומה תחתונה (props + plywood deck, beams, bottom & top
rebar, conduits/sleeves, pour, curing) · 6 קומת כניסה — שלד (slab on grade with void formers, columns,
mamad walls: heavy rebar + blast door/window frames + pour, roof beams + slab: forms, rebar, pour, strip all
formwork → "the skeleton" moment) · 7 בנייה (exterior blocks course by course per floor, interior partitions,
parapets, lintels, blind frames "משקופים עיוורים") · 8 גג (slope screed, insulation, waterproofing membrane,
white reflective coat, solar water heater, AC outdoor units) · 9 מערכות (plumbing supply red/blue, drainage,
electrical conduits + boxes, AC ducts, floor heating none) · 10 טיח וחיפוי (interior plaster, exterior
stone cladding / "שליכט", scaffolding up then down) · 11 גמרים (flooring porcelain, bathroom wall tiles,
gypsum ceilings, aluminum windows + glass, doors, stairs cladding + glass railing, kitchen, sanitary ware,
paint, lighting) · 12 פיתוח (site retaining walls + stone fence, parking pavers, paths, deck, pergola, planters,
lawn, trees, outdoor furniture, cars) · 13 מסירת מפתח (furniture move-in, dusk lighting, final orbit,
summary: total months, concrete m³, rebar t, blocks, estimated cost, CTA back to bonimbait).

## 6. Visual direction ("architectural model meets IKEA manual")

- Light, airy, premium. Background soft warm-white → pale sky gradient; large soft ground; gentle shadows
  (one directional sun + hemisphere fill; contact shadows OK). No dark gamer look.
- Crisp thin dark outlines on structural parts (drei `Edges` or an outline pass, cheap) — the "manual" look.
- Material palette (keep consistent everywhere): natural soil warm tan #C9A979 / excavated cut darker
  #A9875A; gravel #B8B2A7; fresh concrete #8E9196 → cured #C4C6C8; rebar dark rust #6B4A3A; formwork plywood
  yellow-orange #E8B04A (Doka-like) with wood props #B98A55; concrete blocks #A7A9AC; plaster #F1EEE8; Jerusalem
  stone #E3D3B4; bitumen #2B2B2B; white roof coat #F5F5F0; glass #9CC7E6 @ 35% opacity; aluminum frames #3A3D42;
  porcelain floor #D9D4CC; parquet #B78A5E; grass #7DB35A; water pipes red #D64545 / blue #3F7BD9; drain
  #8A8F98; conduit orange #F08A24. Accent for "new in this step": brand magenta #E61559 (bonimbait).
- UI: Heebo (site font), RTL, glassy white panels, brand magenta accents, ink #231F20 text. Big step number,
  phase color chips. Mobile: panel becomes a bottom sheet; 3D stays usable with touch.

## 7. Performance budget

60 fps on a MacBook; fine on a mid phone. Use InstancedMesh for anything repeated (rebar, blocks, tiles, piles,
props, pavers). Shared geometries/materials. No textures over 1 MB total; procedural where possible. The JS for
`/3d` (excluding the viewer chunk) should stay small; the viewer chunk loads during the analysis animation.
Landing must be interactive in < 1.5 s on localhost.

## 8. Quality bar & verification

- TypeScript strict, no `any` leaks, ESLint clean (`cd apps/web && npx next lint --dir app/3d --dir components/build3d --dir lib/build3d`),
  `npx tsc --noEmit -p apps/web` clean for your files.
- Dev server: `http://localhost:3121/3d/` (orchestrator keeps it running; if it is down, start it with
  `bash -c 'set -a; source data/tools/platform.env.local; set +a; cd apps/web && exec npx next dev -p 3121'`
  in the background — check first with `curl -sI localhost:3121`).
- Look at your work: headless screenshots with Playwright (installed in `data/tools/pw`, see `shot.mjs`;
  for WebGL launch chromium with `args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader']`).
  Write your own small script under the scratchpad / `scripts/build3d/` if you need to click through steps.
  Put screenshots in `data/build3d-shots/` (gitignored dir) and actually look at them — iterate on visuals.
- All user-facing text in Hebrew, natural and correct (no machine-translation tone). Code comments in English.
- Report back concisely (≤ 25 lines): what you built, file list, how to verify, open issues. Also append the same
  to your section in `docs/build3d/STATUS.md`.
