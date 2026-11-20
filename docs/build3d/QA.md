# Plan → 3D — Integrator QA pass

Walkthrough: every step settled at 1440×900 + mid-animation frames for pours/courses.
Script: `data/tools/pw/qa-all.mjs <outdir> [from] [to] [--mid=5,9] [--only=3,7] [--direct]` (one page,
keyboard navigation, director clock fast-forwarded, camera snapped, all parts prebuilt first; `--direct`
deep-links each `--only` step instead). Contact sheets: `data/tools/pw/montage.mjs <out> <cols> <w> --crop <pngs…>`.
Shots: `data/build3d-shots/qa/before/` (initial walk) and `data/build3d-shots/qa/after/` (after fixes).

Severity: **P1** = visible in a normal demo run, looks broken · **P2** = noticeable, looks unfinished · **P3** = polish.

| # | Step(s) | Problem | Sev | Status |
|---|---|---|---|---|
| 1 | 62–86 | Facades: slab-edge bands (entrance + roof slab), wall corners, columns, terrace parapets and parapet tops stayed grey block/concrete; window reveals grey. | P1 | FIXED — new `steps/facade.ts`: per storey the exterior walls, columns and exposed slab edges are rasterized (5 cm), outdoor is flood-filled, every outdoor-facing cell edge becomes a facade run (split by owner, extended at convex corners, openings cut). Entrance-floor runs reach down over the slab edge and up over the roof slab edge; parapets get render on both faces + copings; plastered reveals in every opening. Stone: full height on street-facing faces + entry porch, 90 cm plinth only where the entrance floor stands on grade (no stone band mid-facade above the exposed lower floor). |
| 2 | 62, 63 | Stone cladding / render steps invisible behind the scaffolding, camera nearly top-down. | P1 | FIXED — scaffolding ghosts (`ghostTags`) during both facade steps, cameras at polar 64–66. |
| 3 | all | Edges of the blocks *behind* a skin showed through it at grazing angles ("grey block texture" on rendered parapets / lower floor). | P1 | FIXED — parts without outlines no longer use `polygonOffset` (materials keyed by it). |
| 4 | 13, 17, 23, 32, 35, 40, 43 | Pump hose 2–4 m short of the pour, boom swaying, no concrete leaving the hose. | P1 | FIXED — `pump-truck` model takes `pose` (hose end in truck space + stream length): the boom slews and unfolds (Gauss-Newton on a 2-DOF fold pattern, longer 20.8 m boom), no idle sway, a concrete stream drops from the hose. `pumpSpot` parks the truck on the road parallel to the kerb (never on the sidewalk or across the site fence) and aims the hose 1.1 m over the region point nearest the truck; pours sweep out from there. `pumpPart()` used by every pour incl. the grade beams. |
| 5 | 86 (deep link) | `?step=86` opened with the dusk sky but day light. | P1 | FIXED — Stage applies the current dusk level on mount. |
| 6 | 45–61, 67–76, 84 | X-ray dissolved the house: `ghostAbove` faded everything above Y; ghosted slabs showed their rebar/conduits as a noisy orange grid. | P1 | FIXED — `ghostAbove` now fades only parts above Y that actually occlude the work (same 8 % rule as the auto x-ray); occluders fade to 0.24 (ghost preview stays 0.13); embedded rebar, slab conduits/boxes, sleeves, void formers, spacers and scaffolding vanish instead of ghosting. p13-furniture shows the entrance floor with the roof lifted (both floors at once dissolved the house). |
| 7 | 68 | Windows step auto-enabled x-ray → roof slab ghosted on a facade step. | P2 | FIXED — `view.xray: false`. |
| 8 | 20–76 | Backfill left the whole working-space pit open (odd crater on the garden/side yards) until p12. | P2 | FIXED — backfill fills the working space to min(natural, finished) everywhere (garden side ends flush with the lower floor). |
| 9 | all | Terrain base at −8.95 m → 3–10 m tall walls of dirt. | P2 | FIXED — base 1.2 m under the lowest ground (−7.15), skirt = 25 cm soil band fading into a light, near-background model plinth; a sidewalk (kerb-high slabs) along the lot and the road kept off the lot add street context. |
| 10 | 77+ | Grey "rock" tint on graded slopes (west side yard, east boundary). | P2 | FIXED (tint only on > 2.2 slope, max 50 %). The 1 m extractor grid still gives soft lumps on the west yard. |
| 11 | 78–86 | Lawn peeked out between the parking steps' treads. | P2 | FIXED — `drape.holes`; lawns skip cells under paths/parking/steps. |
| 12 | 38–39 | Mamad steps framed behind the chemical toilet + power pole. | P2 | FIXED — x-ray on for mamad rebar/forms; site clutter and machines fade as soon as they hide any of the work. |
| 13 | count | STEPS.md has **86** ids (1+3+2+8+12+7+11+6+5+4+5+12+7+3), not 87; the timeline has all 86 in order. | — | VERIFIED — `tests/build3d/timeline.test.ts`. |
| 14 | build | Timeline build ≈ 255–280 ms cold in the dev browser. | P2 | FIXED — 118–122 ms (dev browser, cold): allocation-free polygon math, scanline union raster, bbox early-out in `excavate`, cheap `partSpan`, shared stand raster + sorted/pruned pump search, facade passes over owner cells only. Stage also warms the memoized timeline in idle time while the landing's analysis plays. |
| 15 | 44, 64, 86 | `camera.orbit`. | P2 | VERIFIED in the browser (azimuth sampled over 10 s: +0.11 rad/s), deep-linked 86 has sun 0.85 / fill 0 (dusk). |
| 16 | 10–12 | Pile mixer truck lingered through forms/rebar/sleeves. | P3 | FIXED — removed in p3-gradebeam-forms. |
| 17 | 6 | Compaction framed tight. | P3 | FIXED (zoom 1.25). |
| 18 | 56–76 | Interior steps: the faded roof build-up (screed, insulation, membrane, coat) stacked into a white haze with a board grid; slab steel showed through. | P1 | FIXED — roof layers and embedded steel vanish when faded; x-ray outlines at 5 % opacity. |
| 19 | 72, 73 | Stairs / kitchen framed from inside or through the facade. | P1 | FIXED — stair-well camera from above; kitchen seen over its walls (polar 40) with the roof lifted. |
| 20 | 9 | Pile mixer stands against the site toilet / power pole at the gate (site layout). | P3 | OPEN |
| 21 | 77+ | West side yard: soft lumps from the 1 m extractor grid between the yard levels. | P3 | OPEN |
| 22 | 61 | Interior plaster is white-on-white (low contrast while the skins rise). | P3 | OPEN |
| 23 | all | No neighbor massing: the terrain grid only reaches ~5 m past the lot, too narrow for the neighbors' houses. | P3 | WONTFIX (would need a wider terrain grid). |
| 24 | 86 | The finale summary card covers the dusk orbit after ~span + 1.8 s (UX's Summary timing). | P3 | OPEN → Needs (UX) |

