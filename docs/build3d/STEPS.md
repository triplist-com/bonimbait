# Canonical step list (orchestrator-owned)

Step ids are the join key between geometry (`lib/build3d/steps/**`), content (`lib/build3d/content/**`) and the UI.
Use these ids exactly. Order = build order. "Visual" says what appears (+) / disappears (−) in the 3D scene.
Phase colors are the Engine's call. A step may be merged/split only via the orchestrator (note it in STATUS.md).

## 0 · התוכנית (plan)
- `p0-plan` — התוכנית על המגרש. + plan sheet draped on the natural terrain; intro camera from top-down to 3/4.

## 1 · הכנת המגרש (site preparation)
- `p1-survey` — סימון ע"י מודד. + surveyor with tripod, stakes with orange ribbons at building corners, string lines along building lines.
- `p1-clearing` — ניקוי המגרש. − scrub bushes and rocks that dotted the natural lot.
- `p1-site-setup` — התארגנות אתר. + site fence along the lot boundary, site container, chemical toilet, permit sign "היתר בנייה", temporary power pole + water tap.

## 2 · עבודות עפר (earthworks)
- `p2-excavation` — חפירה. + excavator (digging idle anim) + dump truck; terrain lowers inside the lower-floor area (+ working space, 1:1 slopes); spoil pile.
- `p2-compaction` — יישור והידוק. + roller; thin compacted gravel bed in the excavated pit; − excavator, dump truck.

## 3 · יסודות (foundations)
- `p3-pile-drilling` — קידוח כלונסאות. + drill rig; pile holes appear one by one (dark rings) under columns/wall lines.
- `p3-pile-cages` — הורדת כלובי זיון. + rebar cages lowered into the holes (instanced, sequence).
- `p3-pile-pour` — יציקת כלונסאות. + mixer truck; concrete fills each hole (pour); − drill rig.
- `p3-gradebeam-forms` — טפסנות לקורות יסוד. + plywood side forms along all grade beams (both levels).
- `p3-gradebeam-rebar` — זיון קורות יסוד. + longitudinal bars + stirrups (instanced).
- `p3-sleeves` — שרוולים וביוב תת-קרקעי. + sewer pipes (gray) to the street, sleeves through beams, manholes.
- `p3-gradebeam-pour` — יציקת קורות יסוד. + pump truck; concrete pour into the forms.
- `p3-gradebeam-strip` — פירוק טפסות. − grade-beam forms, − pump/mixer trucks.

## 4 · קומה תחתונה — שלד (lower floor structure)
- `p4-retaining-rebar` — זיון קירות תומכים. + two-layer rebar mesh walls along the retaining/concrete walls of the lower floor.
- `p4-retaining-forms` — טפסנות קירות תומכים. + formwork panels both sides with ties + walers.
- `p4-retaining-pour` — יציקת קירות תומכים. + concrete (pour).
- `p4-retaining-strip` — פירוק טפסות. − retaining wall forms.
- `p4-waterproofing` — איטום קירות תומכים. + black bitumen skin on the soil side, protection board, perforated drain pipe + gravel at the footing.
- `p4-backfill` — מילוי חוזר. terrain fills back behind the retaining walls (to the entrance-level grade).
- `p4-subbase` — מצע ויריעת פוליאתילן. + gravel layer + translucent poly sheet over the lower-floor area.
- `p4-slab-mesh` — רשת ברזל לרצפה. + mesh grid on spacers.
- `p4-slab-pour` — יציקת רצפת הקומה התחתונה. + slab concrete (pour), power trowel.
- `p4-columns-rebar` — זיון עמודים. + column cages.
- `p4-columns-forms` — טפסות עמודים. + plywood column boxes.
- `p4-columns-pour` — יציקת עמודים. + column concrete; − column forms (at end of step or next).

## 5 · תקרת הקומה התחתונה (lower-floor ceiling slab)
- `p5-props` — תמיכות (פרופים). + steel props grid + primary/secondary beams.
- `p5-deck` — משטח טפסנות. + plywood deck + edge forms + beam bottoms/sides.
- `p5-rebar-bottom` — זיון תחתון. + bottom bar grid both directions.
- `p5-conduits` — צנרת חשמל ושרוולים בתקרה. + orange conduits snaking between ceiling boxes, plumbing sleeves.
- `p5-rebar-top` — זיון עליון. + chairs/spacers + top bars + beam stirrups.
- `p5-pour` — יציקת התקרה. + pump truck boom over the slab; concrete pour sweeps across.
- `p5-curing` — אשפרה. slab darkens (wet) then lightens; sprinkler hoses.

## 6 · קומת כניסה — שלד (entrance floor structure)
- `p6-ground-slab-prep` — רצפה תלויה: ארגזי קלקר ורשת. + void formers on the non-excavated (south) part + mesh.
- `p6-ground-slab-pour` — יציקת רצפת קומת הכניסה (החלק הדרומי).
- `p6-columns` — עמודים בקומת הכניסה. + cages + forms (one step).
- `p6-columns-pour` — יציקת עמודים. + concrete; − forms.
- `p6-mamad-rebar` — זיון קירות הממ"ד. + dense double mesh, blast-door + window steel frames, ventilation sleeves.
- `p6-mamad-forms` — טפסנות ממ"ד. + forms both sides.
- `p6-mamad-pour` — יציקת הממ"ד. + concrete; − forms.
- `p6-roof-deck` — תמיכות ומשטח לתקרת הגג. + props, beams, plywood deck, edge forms (incl. terrace/overhangs).
- `p6-roof-rebar` — זיון תקרת הגג וצנרת. + bottom/top bars, conduits.
- `p6-roof-pour` — יציקת תקרת הגג. + pump truck; pour.
- `p6-strip-all` — פירוק טפסנות: השלד מוכן! − all remaining props/decks/forms. Camera does a slow orbit reveal.

## 7 · בנייה (masonry)
- `p7-blocks-lower` — קירות חוץ בקומה התחתונה. + block walls course by course (openings left open).
- `p7-blocks-entrance` — קירות חוץ בקומת הכניסה. + same.
- `p7-lintels` — חגורות ומשקופי בטון מעל פתחים. + lintels over openings.
- `p7-blocks-interior` — קירות פנים. + interior partitions, both floors.
- `p7-parapets` — מעקות גג ומרפסת. + parapet blocks on the roof/terrace edges.
- `p7-blind-frames` — משקופים עיוורים. + galvanized frames in window/door openings.

## 8 · גג (roof)
- `p8-roof-screed` — בטון שיפועים. + lightweight screed with a visible slight slope toward drains.
- `p8-roof-insulation` — בידוד תרמי. + insulation boards (instanced).
- `p8-roof-membrane` — איטום ביריעות ביטומניות. + black membrane, upturns on parapets.
- `p8-roof-coat` — ציפוי לבן מחזיר קרינה. membrane turns white.
- `p8-roof-equipment` — דוד שמש, קולטים ומעבים. + solar heater + collectors, AC condensers.

## 9 · מערכות (systems)
- `p9-plumbing` — אינסטלציה: מים חמים וקרים. + red/blue supply pipes in kitchen/bathroom walls, manifold.
- `p9-drainage` — ניקוז ושפכים. + gray drain pipes from fixtures to the sewer line.
- `p9-electrical` — חשמל ותקשורת. + conduits in walls, boxes, main panel.
- `p9-ac` — מיזוג אוויר. + ducts in corridor ceilings, grilles.

## 10 · טיח וחיפוי (plaster & cladding)
- `p10-scaffolding` — פיגומים. + scaffolding bays around the exterior.
- `p10-plaster-interior` — טיח פנים. + plaster skin on interior faces.
- `p10-stone-cladding` — חיפוי אבן. + stone cladding courses on the main facades.
- `p10-plaster-exterior` — טיח חוץ ושליכט. + render on the remaining facades.
- `p10-scaffolding-down` — פירוק פיגומים. − scaffolding.

## 11 · גמרים (finishes)
- `p11-flooring` — ריצוף. + porcelain tiles sweep across both floors (instanced), parquet in bedrooms optional.
- `p11-bath-tiles` — חיפוי קירות בחדרי הרחצה. + wall tiles in baths/WCs.
- `p11-gypsum` — תקרות גבס. + dropped ceilings where AC ducts run.
- `p11-windows` — חלונות ודלתות אלומיניום. + frames + glass (vitrines, sliders, windows).
- `p11-mamad-door` — דלת הדף וחלון ממ"ד. + steel blast door + window.
- `p11-entry-door` — דלת כניסה.
- `p11-interior-doors` — דלתות פנים.
- `p11-stairs` — חיפוי מדרגות ומעקה זכוכית.
- `p11-kitchen` — מטבח. + cabinets, island, counters.
- `p11-sanitary` — כלים סניטריים. + toilets, sinks, showers (glass).
- `p11-paint` — צבע. interior walls brighten to final color.
- `p11-lighting` — גופי תאורה. + ceiling lights (emissive later at dusk).

## 12 · פיתוח (landscaping)
- `p12-site-walls` — קירות פיתוח וגדר אבן. + site retaining walls, stone fence on the boundary; − construction fence, container, toilet, sign, pole.
- `p12-parking` — ריצוף חניה. + pavers (instanced) on the parking.
- `p12-paths` — שבילים ומדרגות חוץ.
- `p12-terrace` — מרפסות ודק.
- `p12-pergola` — פרגולה.
- `p12-garden` — גינה: דשא, עצים ואדניות. terrain → finished grade; + lawn, trees, planters.
- `p12-outdoor-furniture` — ריהוט חוץ.

## 13 · מסירת מפתח (handover)
- `p13-furniture` — ריהוט. + all interior fixtures from the plan.
- `p13-cars` — הרכבים בחניה. + 2 cars drive in.
- `p13-done` — הבית מוכן. dusk lighting, interior lights glow, final orbit, summary card.

## Cross-phase conventions (all step authors)
- Part ids globally unique: prefix with the step id (`p7-blocks-lower:w12:c3`).
- Tags every part should carry: `level:lower|entrance|roof|site` + a kind tag. Kind tags other phases rely on:
  - `formwork` (any temporary forms/decks; exit by lifting), `props` (shoring), `machine` (vehicles/equipment; remove when the step's work ends), `site-temp` (fence, container, toilet, sign, power pole → removed in p12-site-walls).
  - `rebar` (removed? never — it is hidden inside concrete; concrete parts must fully enclose their rebar).
  - `blocks`, `blocks-exterior`, `blocks-interior`, `parapet`, `lintel`, `blind-frame`.
  - `mep-in-wall` (pipes/conduits/boxes inside walls → removed by p10-plaster-interior), `duct` (AC ducts → stay; hidden by p11-gypsum ceilings), `mep-under-floor` (removed by p11-flooring).
  - `roof-membrane` (black; p8-roof-coat removes it and adds the white coat), `screed`.
  - `scaffolding` (removed by p10-scaffolding-down), `plaster-interior` (p11-paint removes it and adds `paint-interior` skins), `plaster-exterior`, `stone`.
  - `terrain-*` ids per engine README (p4-backfill swaps the excavated terrain, p12-garden swaps to finished grade).
- Skins (plaster/paint/tiles/stone) are thin boxes 1–2 cm proud of the surface they cover, built per wall piece from `wallPieces` so openings stay open. Avoid z-fighting: offset ≥ 8 mm.
- Machines arrive with `drop`/`slide`, do their idle animation during their step, and are removed in the step where the work ends (same step's `remove` is not allowed for own parts — remove them in the next step).
- Cost/quantities: compute from geometry × `PRICES` (content module); keep the per-step `materials` list short (≤ 5 lines), most important first.
