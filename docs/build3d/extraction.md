# Plan extraction — plot 43 (`Home-Model.pdf`)

Owner: Extractor. Outputs: `apps/web/lib/build3d/house/house.json` (`HouseModel`),
`apps/web/lib/build3d/house/overlay.json` (`PlanOverlay`), `apps/web/public/build3d/plan-entrance.webp`,
`apps/web/public/build3d/plan-lower.webp`. Both JSON files type-check against `types.ts` as TS literals
(strict, excess-property and tuple checks).

## Re-run

```bash
# one-time: venv with pymupdf numpy shapely scipy pillow at data/build3d-venv
cp /path/to/Home-Model.pdf data/build3d-src/Home-Model.pdf
data/build3d-venv/bin/python -I scripts/build3d/extract.py          # house.json + overlay.json
data/build3d-venv/bin/python -I scripts/build3d/render_check.py     # checks + PNGs in data/build3d-shots/extract/
data/build3d-venv/bin/python -I scripts/build3d/make_plan_crops.py  # per-viewport webp crops
data/build3d-venv/bin/python -I scripts/build3d/walls.py            # dump of every wall hatch run (reference)
```

| file | role |
|---|---|
| `scripts/build3d/pdfplan.py` | PDF readers: wall hatch rectangles, lot-boundary strips, stroke segments, spot markers |
| `scripts/build3d/walls.py` | hatch rectangles → collinear runs (the numbers the tables below were read from) |
| `scripts/build3d/plan_data.py` | curated walls / openings / columns / rooms / stair / dims, in page points |
| `scripts/build3d/site_data.py` | footprints, spot + survey elevations, outdoor areas, fixtures, terrain rules, assumptions |
| `scripts/build3d/extract.py` | page → model transform, heights, slabs, roof parapets, boundary fences, JSON writers |
| `scripts/build3d/render_check.py` | inverse-transform renders + sanity checks + structural types check |

## Source

AutoCAD 2023 plot, 1 page 1899 × 1701 pt, no text layer (all text is vector strokes), no images.
Two 1:100 viewports (thick 1.68 pt frames):

| viewport | title | frame (page pt) |
|---|---|---|
| `entrance` (left) | תכנית פיתוח קומת כניסה | 181.36, 209.12 – 939.88, 1321.52 |
| `lower` (right) | תכנית פיתוח קומה תחתונה | 966.16, 209.12 – 1724.80, 1321.52 |

The right drawing is the same site shifted by **+784.80 pt in x, 0 in y** — verified on the lot boundary
strips, the building lines, the frames and the stair risers (both flights match to ±0.12 pt).

Colours: red solid hatch = blocks, blue solid hatch = reinforced concrete (ממ"ד walls 30/20 cm, retaining
walls, column stubs — verified: all of them are where concrete is expected). Red dashed 1.08 pt = building
lines (קו בניין). Blue filled triangle strips (1.7 pt wide) = lot boundary. Orange (0.87,0.54,0.43) = stair
risers. Small two-quadrant black fills = spot-elevation markers. Cross-hatched area on the lower plan =
not excavated.

## Model frame and calibration

* **Origin**: outer north-west corner of the entrance floor (corner column C-E1), page point
  **(422.92, 562.76)** in the entrance viewport = **(1207.72, 562.76)** in the lower viewport.
  `x = (px − originPt.x) · metersPerPt`, `z = (py − originPt.y) · metersPerPt` (same for both viewports).
  House spans x 0 → 11.20, z 0 → 17.00; lot x −4.0 → 15.7, z −5.4 → 22.8.
* **Scale**: least squares over 22 written room dimensions (430/300 ממ"ד, 460/340, 330/200, 500/800, 490/440,
  320/360, 410/300, 290/400, …) measured face-to-face on the hatch: **0.0352832 m/pt**, nominal 1:100 is
  0.0352778 (difference 0.015 %, max residual 0.27 cm, rms 0.18 cm). The nominal value is used.
* `Y = 0` at ±0.00 = **271.50** abs. North arrow: 51.9° clockwise from drawing-up →
  `site.northAngle = 0.906` rad, i.e. north vector = (sin a, −cos a) in (x, z).

## Levels and heights (assumptions — not on the plans unless stated)

| item | value | source |
|---|---|---|
| entrance finished floor | 0.00 (271.50) | drawing ("±0.00=271.50 פני ריצוף", מבוקש) |
| lower finished floor | **−3.25** (268.25) | drawing legend "−3.25 268.25 מבוקש / −3.00 268.00 נתון"; a stray "−3.00 / 268.00" label at the stair foot is the old datum |
| floor finishes | 0.08 over every structural slab | assumed |
| lower slab | on grade, 0.20, top −3.33 | assumed |
| entrance slab | 0.25, top −0.08, underside −0.33; suspended over the lower floor, on grade (void formers) over the hatched non-excavated part | assumed |
| roof slab | top +3.30, 0.25 (underside +3.05) | assumed (task) |
| clear heights | lower 2.92, entrance 3.05 | derived |
| storey walls | lower: base −3.33, h 3.00 · entrance: base −0.08, h 3.13 | derived |
| roof parapets | 0.20 block, h 1.00 on +3.30, along the whole roof edge (P-R*) | assumed (no roof plan) |
| terrace | finished −0.02 (drawing), slab top −0.12; railing on a +0.20 curb (drawing) modelled as 0.20 concrete parapet to +1.05 | partly drawing |
| site retaining walls | top +0.20 (spot labels next to them); base −3.40 (east) / −1.70…−1.85 (west) | partly drawing |
| boundary fences F-B* | 0.25 block, 2 m pieces, from 0.10 below the lowest adjacent grade to 0.50 above the highest | assumed ("חומה קיימת", "ק.אבן+מעקה", "חומה מוצעת") |
| stair | 19 risers × 0.171 = 3.25, flights 1.00 wide, treads 0.30, landing at the west end | drawing (risers counted) |

Openings (sill / head above the level floor): window 0.95 / 2.20 · shower windows 1.40 / 2.10 ·
kitchen window over the counter 1.05 / 2.20 · stair window (lower wall) 1.60 / 2.40 · vitrine and sliding door
0 / 2.40 · door 0 / 2.10 · entry door 0 / 2.20 · mamad door 0 / 2.00 · mamad window 1.00 / 2.00 (100 cm).
Widths come from the hatch gaps.

## Walls (`walls`, 124)

57 storey walls (14 concrete, 43 block) + 12 roof parapets + 4 site retaining walls + 49 boundary-fence pieces.

* Each wall is one hatch run (merged collinear pieces) spanning its gaps; **a/b are the drawn centreline
  extended to the faces of the run**, so the box a→b × thickness reproduces the hatch exactly (no overlap at
  L-corners: one wall owns the corner square). Exact hatch rectangles are in `polygonPt` (page pt of the
  wall's own viewport; roof parapets use entrance-viewport pts).
* Concrete stubs inside block walls are **columns** (`columns`, 18 — all drawn, none inferred), and the block
  walls stop at their faces. Where an opening spans the whole distance between two concrete stubs (living
  room vitrine E-SN, family-room sliding door L-N2) the wall is a full-length opening in a concrete wall
  (= the beam/lintel above it).
* Thickness snapped to 5 cm from the hatch width: 5.64–5.76 pt → 0.20, 2.76–2.88 → 0.10, 8.52 → 0.30.
* Roles: `exterior`, `interior`, `mamad` (E-MN/MW/MS/ME1/ME2), `retaining` (L-R1…R6, the stepped south box
  of the lower floor), `parapet` (terrace railing E-TRN/E-TRE, roof P-R*), `site-retaining` (S-E1 east of the
  house to lot 44, S-W1…W3 around the west garden stair), `fence` (F-B*).
* Two walls are outlined but not hatched on the sheet and were added as blocks: E-KNE (dining/kitchen jog)
  and the west part of E-W2 (master shower) — plus the shaft east side E-SHE and the lower shaft cover L-I8.
* Note: the lower floor is **narrower** than the entrance floor — its west wall is 0.40 m and its north wall
  0.20–0.40 m inside the entrance-floor faces; only the east wall and the stair core stack. This is how it is
  drawn (the upper slab cantilevers); render_check prints the stacking ratios.

`swingSide` (+1/−1 along the wall normal n = (−uz, ux), u = unit a→b; H walls run +X so n = +Z, V walls run
+Z so n = −X) was detected from the door-handle symbols at the open leaf, fallback the dashed swing arc. All 13
swings were checked by eye against the crops.

## Openings (`openings`, 32)

Entrance (19): master full-height glazing 1.80 with "מעקה תקני" (vitrine), 3 master-suite west windows 0.60–1.20,
master shower window, stair window 0.90, entry door 1.20 (in the recessed porch), guest shower window,
mamad window 1.00 + mamad door 0.80, living vitrine 4.10 to the terrace, dining sliding door 1.90 to the east
path, kitchen window 0.80 + door 0.80 to the east path, kitchen window 2.10 over the sink, 4 interior doors
(one is an open passage `opening` = walk-in closet). Lower (13): 2 bedroom windows 1.40, family sliding door 2.00 to
the garden, SE bedroom window 1.40, shower window 0.60, laundry door 0.90 to the west yard, stair window,
6 interior doors.

## Rooms (`rooms`, 20)

Polygons are the inner wall faces; `area` from the polygon; `dimsLabel` = the numbers written in the room.
Named exactly as on the plan (11): ח.שינה הורים 15.7 · ח.ארונות הורים 6.6 · מקלחת הורים 5.6 · מרפסת 16.8 ·
סלון 26.5 · פ.אוכל 15.4 · מטבח 20.9 · כניסה 2.7 (recessed open porch, the door is on its east side) ·
מקלחת 4.8 · ממ"ד 12.9 · ח.שינה (lower NW) 11.5.
**Not labelled on the plan — descriptive names chosen by me** (9): מעבר (master-suite passage, entrance),
מבואה (entrance hall), lower: מקלחת ×2, כביסה (washer + dryer + sink), פינת משפחה (sofa area at the garden
door), ח.שינה ×2 (both have a bed + desk), מבואה.
Living/dining/kitchen are one open space; they are split along the stair-shaft line (y = 806.6 pt) and the
kitchen line (883.16 pt). Not rooms: the two "מטק"-labelled shafts (illegible abbreviation, an X-box with a red
⊗ symbol — treated as installation shafts), the stair, the washer niche.
Sums: entrance rooms 142.2 m² (incl. terrace 16.8) + walls 18.0 vs slab 146.9 + terrace; lower rooms 67.3 +
walls 10.9 vs slab 84.2 (the 6 m² difference is the stair).

## Stairs, slabs

* `ST-1`: footprint x 431.44–536.32, y 778.28–834.92 pt (both plans), U-shaped: north flight from the lower
  hall westward (risers 1–9), landing at the west wall, south flight eastward (risers 11–19) arriving in the
  entrance hall. The south flight sits over the non-excavated ground (lower plan draws it dashed beyond the
  retaining wall L-R3).
* Slabs: SL-LOWER (ground, lower footprint), SL-ENTR-SUSP (suspended: entrance footprint north of the
  retaining-wall line, with the stair cut out), SL-ENTR-GRADE (ground: the rest, incl. the entry porch),
  SL-TERRACE (top −0.12), SL-ROOF (= entrance footprint incl. porch, top +3.30). Footprints are the outer wall
  faces (`site_data.ENTRANCE_FOOTPRINT`, `LOWER_FOOTPRINT`).

## Site

* `boundary`: centreline of the blue lot band (49 pts, curved north and south edges). Lot area **511.6 m²**.
  Built footprints: entrance 146.9 + lower 91.6 = 238.5 m² (`stats.builtAreaM2`).
* `buildingLines`: one closed polyline rebuilt from the red dashes (sorted around the centroid); setbacks as
  written: 4.00 sides, 5.00 front/rear. The light pergola crosses the east line by 3.15 m (sheet note).
* `spotElevations` (43): 28 written relative levels (±0.00 datum, with abs where written) + 15 absolute survey
  points on the boundary (268.24 north wall tops / NE, 269.77 NW, 269.88 & 272.58 west, 271.12 east, 272.18
  south, "272.24 קיים בשטח").
* `terrainNatural` (1 m grid, 30 × 38, lot + 4 m): polyharmonic (linear-kernel) RBF through the survey
  points, a few guide points in the back garden (≈268.3–268.6, the garden keeps its level) and approximate
  far-field points from the neighbours' contour labels (265–271). Result: back half ≈ −2.5…−3.6, an old
  terrace step around z 6–10 m, street half ≈ +0.5…+1.0.
* `terrainFinished` (same grid), rule-based from the development plan: lower footprint and everything under
  the suspended slab −3.33; rest of the house −0.10; back garden / patio / lawn −3.27; planter "אדנית" −2.83;
  west side yard −3.40 → −1.54; garden stair −3.27 → −1.74 (landing) → −0.02; paths −0.02; parking steps
  −0.02 → +0.63; parking +0.63 → +0.53 at the street; east raised planters +1.20; south strip ramps to +0.68 at
  the boundary wall; outside the lot = natural.
* `street`: the south boundary pushed 3 m outward and extended 8 m each side (the road itself is outside the
  drawn area). `neighbors`: מגרש 42 (west), מגרש 44 (east).

## Outdoor (`outdoor`, 17) and fixtures (`fixtures`, 59)

Outdoor: north paved patio "שביל מרוצף" −3.27, north planting strip, east lawn, planter "אדנית" −2.83, west side
yard, garden stair (2 flights + landing, `y` = top of flight), west path −0.02, west yard, parking steps,
parking "חניה" +0.55 (two stalls, slope "שיפוע מי גשם" to the street), east path, south path, two raised
planters +1.20, light pergola "פרגולה קלה" (L-shaped over the east and south paths, `y` = top +2.60).
A dashed beam grid over the terrace looks like a second pergola but is unlabelled — not included.

Fixture frame: `size = [width, depth]` in the fixture's local axes; local −Z is its back (headboard, wall
side), +Z its front; `rotation` about +Y maps local +Z to (sin r, cos r): front toward +Z r = 0, −Z r = π,
+X r = π/2, −X r = −π/2. Centres/sizes measured from the drawn symbols: master double bed, 3 single beds,
3 desks, 5 wardrobes, 2 sofas, armchairs, coffee tables, 2 TVs, dining table (with 8 chairs, as one), kitchen
island (with stools), 3 kitchen counter runs + BBQ counter, 4 toilets, 4 basins + laundry sink, 4 showers,
washer/dryer, 2 cars (drawn small: 1.65 × 3.65, nose toward the house), outdoor dining set, lounge chairs,
garden furniture, 1 palm + 4 shrubs as trees. `F-E-WASHER` sits in the hall-side washer niche (outside any
room polygon, intended).

## overlay.json

Sheet page points (viewBox `0 0 1899 1701`). `walls`: 4 SVG paths (viewport × material) made of the exact
hatch rectangles. `openings`: x, y = centre, w = width (pt), angle 0 (horizontal wall) / 90. `rooms`: polygon `d`
+ label point (the written label where present). `dims`: 12 written dimensions with their dimension-line
ends. `site.boundary` for both viewports, 11 elevation labels. `stats`: walls 57 (14 concrete, 43 block),
openings 32, rooms 20, levels 2, built 238.5 m², lot 511.6 m².

## Plan crops

`plan-entrance.webp` = sheet bbox [181.36, 209.12, 939.88, 1321.52], `plan-lower.webp` = [966.16, 209.12,
1724.80, 1321.52]; both 1401 px wide, px = (pt − x0) · 1400 / 758.52 (same factor in y).

## Validation

`render_check.py` draws house.json back onto the sheet raster through the inverse transform (walls by
material, columns, openings by kind + swing, rooms, slabs, stair, fixtures with front marker, outdoor, spots,
building lines) for both viewports with zoomed crops, plus a model-space plot of both levels and the terrain
grids → `data/build3d-shots/extract/`. Checks: every opening lies inside its wall and below its head height;
no room/room overlap; room/wall overlap 0.04 m²; stair 19 × 0.171; fixtures inside rooms; types.ts keys/enums.
Everything overlays the drawing within a hatch line.

## Known gaps / uncertain

* Heights, slab thicknesses, sills, parapets, pergola height are assumptions (no sections on the sheet).
* 9 room names are descriptive (unlabelled on the plan); the shaft label "מטק" is illegible.
* Natural terrain inside the lot has no measured points — it is interpolated from the boundary survey.
* The "+1.20" east planters vs. the "−0.20" inspection-chamber cover next to them is ambiguous on the sheet.
* Inspection chambers / sewer lines (ת.ב, I.L.) are not modelled. Fence heights are generic.
* The lower floor's stair window and the entrance one are the same opening position on both plans; modelled
  as one window per storey.
