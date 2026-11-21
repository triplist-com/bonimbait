# Construction methods (orchestrator-owned)

The demo builds the **same house** (plot 43) with five construction methods. The finished house looks
the same in all of them (same stone + render facades, same interior); what changes is the structure and
the envelope, and with them the steps, crews, durations and costs. The user picks a method on the
landing (or switches in the viewer); `?method=<id>` selects it everywhere.

| id | Hebrew name | One line |
|---|---|---|
| `concrete` | בטון ובלוקים (שלד קונבנציונלי) | Reinforced-concrete frame + block infill. The original 86 steps (STEPS.md). |
| `icf` | ICF: תבניות בידוד יצוקות | Load-bearing concrete walls cast inside EPS blocks that stay as insulation. |
| `steel` | שלד פלדה קלה (LSF) | Galvanized light-gauge steel stud walls + joists above a concrete lower floor. |
| `timber` | מסגרת עץ | Timber stud walls + I-joists + OSB above a concrete lower floor. |
| `precast` | בנייה טרומית | Precast concrete wall panels + hollow-core slabs, set by a mobile crane. |

## Fixed decisions (all methods)

1. **Shared, unchanged**: phases 0–3 (plan, site, earthworks, piles + grade beams), 9 (systems),
   11 (finishes), 12 (landscape), 13 (handover). Same step ids, same geometry. A method may re-word a
   shared step (see "Text" below) when the work differs (e.g. pipes in stud cavities).
2. **The ממ״ד is cast-in-place reinforced concrete in every method** (Home Front Command requirement),
   except `precast`, which uses an approved precast ממ״ד module. Say so in the text: it is a real,
   useful fact for Israeli builders.
3. **The lower floor is a concrete "podium" for `steel` and `timber`**: retaining walls, slab, columns
   and the lower-ceiling slab stay concrete (shared p4/p5 steps). This is how light construction is done
   on Israeli hillside lots; the light frame starts at the entrance floor. Only the lower floor's
   non-retaining exterior infill (the garden facade, `p7-blocks-lower` in concrete) is framed.
4. **Flat roof with parapets in every method** (Israeli norm). Phase 8's membrane / white coat /
   equipment steps are shared; under them `concrete`/`icf`/`precast` have the concrete slab + screed,
   `steel`/`timber` have joists + deck + tapered insulation (re-word `p8-roof-screed` accordingly or
   replace it with your own step).
5. **Exterior finish is identical**: reuse `p10-stone-cladding` and `p10-plaster-exterior` (facade.ts),
   re-worded for the substrate. Interior finish must end tagged `plaster-interior` (p11-paint removes it)
   and must remove `mep-in-wall` (as `p10-plaster-interior` does).

## Step lists

Format: `id` — Hebrew title. What appears (+) / disappears (−). Ids are new unless marked *shared*
(*shared* = take it from the concrete phase builder with `pick()` from `steps/methods/compose.ts`).
Phase numbers stay 0–13 (the timeline color bands); method-specific phase names are in
`content/methods.ts` (`phaseNamesHe`). Keep each method between ~70 and ~90 steps.

### `concrete`
Unchanged: docs/build3d/STEPS.md.

### `icf`
- p0–p3: *shared*.
- **4 · קומה תחתונה: קירות ICF**
  - `p4i-icf-courses` — הנחת בלוקי ICF. + EPS blocks (light grey, visible 1.2 × 0.4 m joints) stacked course by course on all lower-floor exterior + retaining walls, openings left with timber bucks.
  - `p4i-icf-rebar` — ברזל בתוך התבניות. + horizontal bars in the web clips + vertical bars dropped into the cores (show them above the top course before the last courses close).
  - `p4i-icf-bracing` — מערכת יישור ותמיכה. + steel alignment braces every ~1.8 m with kickers and a walk board (tag `formwork`, removed by `p6-strip-all`).
  - `p4i-icf-pour` — יציקת הקירות. + pump truck; concrete rises inside the cores in lifts (show the core tops filling); forms stay.
  - `p4-waterproofing`, `p4-backfill`, `p4-subbase`, `p4-slab-mesh`, `p4-slab-pour` — *shared* (re-word waterproofing: EPS-compatible membrane).
  - Interior free-standing columns (not inside an ICF wall), if any: keep via `p4-columns-*` *shared* only if they carry the slab; otherwise drop.
- **5** — *shared* (`p5-*`; the slab bears on the ICF walls).
- **6 · קומת כניסה: קירות ICF**
  - `p6-ground-slab-prep`, `p6-ground-slab-pour` — *shared*.
  - `p6i-icf-courses`, `p6i-icf-rebar`, `p6i-icf-bracing` — as in phase 4, entrance-floor exterior walls (not the ממ״ד).
  - `p6-mamad-rebar`, `p6-mamad-forms`, `p6-mamad-pour` — *shared*.
  - `p6i-icf-pour` — יציקת קירות קומת הכניסה.
  - `p6-roof-deck`, `p6-roof-rebar`, `p6-roof-pour`, `p6-strip-all` — *shared* (strip-all also takes the braces; re-word: "השלד מוכן" for ICF).
- **7 · מחיצות ומעקות**: `p7i-icf-parapets` (ICF parapet courses on the roof/terrace edges, poured), `p7-blocks-interior` *shared*, `p7-blind-frames` *shared*. No exterior blocks, no lintels (the cores are the lintels).
- **8** — *shared*.
- **9** — *shared* (re-word: chases cut in the EPS with a hot knife).
- **10** — *shared* (re-word `p10-plaster-interior`: mesh + plaster or gypsum boards screwed to the ICF ties; stone: mechanically anchored to the concrete core; exterior render: mesh-reinforced on EPS).
- 11–13 — *shared*.

### `steel` and `timber` (one framing author, one shared `frame-kit`)
Ids use `s` (steel) or `t` (timber) after the phase number, e.g. `p6s-walls` / `p6t-walls`.
- p0–p5: *shared* (concrete podium: retaining walls, lower slab, columns, lower-ceiling slab).
- **6 · קומת כניסה: שלד פלדה קלה / מסגרת עץ**
  - `p6-ground-slab-prep`, `p6-ground-slab-pour` — *shared*.
  - `p6-mamad-rebar`, `p6-mamad-forms`, `p6-mamad-pour` — *shared*.
  - `p6s-tracks` / `p6t-sole-plates` — + bottom tracks / treated sole plates anchored to the slab, hold-downs.
  - `p6s-walls` / `p6t-walls` — + wall panels (studs @ 60 cm, top track/plate, headers + cripples over every opening, king/jack studs), raised panel by panel; temporary diagonal braces (`formwork`). Timber panels arrive with OSB on the outside face; steel panels bare.
  - `p6s-roof-joists` / `p6t-roof-joists` — + roof joists (C-joists / I-joists @ 40–60 cm) with blocking, slight slope, overhangs where the concrete roof had them.
  - `p6s-roof-deck` / `p6t-roof-deck` — + roof deck boards (cement board / OSB) with edge closures.
  - `p6-strip-all` — *shared*, last (removes the p5 props; re-word: "השלד מוכן" for the frame).
- **7 · מילוי ומחיצות**
  - `p7s-lower-infill` / `p7t-lower-infill` — framed infill walls on the lower floor's non-retaining exterior walls (between the concrete columns).
  - `p7s-partitions` / `p7t-partitions` — interior partitions, both floors (studs; no blocks).
  - `p7s-parapets` / `p7t-parapets` — framed parapets on the roof/terrace edges.
  - `p7-blind-frames` — *shared* (re-word: sub-frames fixed to the framed openings).
- **8** — *shared* `p8-*` with `p8-roof-screed` re-worded as tapered insulation (or replaced by `p8s-`/`p8t-taper`), membrane/coat/equipment unchanged.
- **9** — *shared* (re-word: pipes and conduits run through the punched/drilled studs; the walls are open so you see them).
- **10 · מעטפת: לוחות, בידוד וגבס**
  - `p10-scaffolding` — *shared*.
  - `p10s-sheathing` / `p10t-sheathing` — + exterior boards (cement board / OSB already there for timber: add the house wrap) + moisture barrier.
  - `p10s-insulation` / `p10t-insulation` — + mineral wool batts between the studs (seen from inside).
  - `p10s-drywall` / `p10t-drywall` — + interior gypsum boards, tagged `plaster-interior`; removes `mep-in-wall`.
  - `p10-stone-cladding`, `p10-plaster-exterior`, `p10-scaffolding-down` — *shared* (re-word: stone on rails/anchors, render on cement board).
- 11–13 — *shared*.

### `precast`
- p0–p3: *shared*.
- **4 · קומה תחתונה: הרכבת פאנלים**
  - `p4-retaining-*` (rebar, forms, pour, strip), `p4-waterproofing`, `p4-backfill` — *shared* (soil-side walls stay cast in place).
  - `p4p-crane` — הגעת מנוף. + mobile crane on the street side, outriggers down (stays through phase 6, removed in `p6p-frame-done`).
  - `p4p-panels` — הרכבת פאנלים. + precast wall panels (with window openings cast in) flown in by the crane one by one onto the grade beams, push-pull props (`formwork`).
  - `p4p-grout` — דיוס וחיבורים. + grout joints / connection pockets.
  - `p4-subbase`, `p4-slab-mesh`, `p4-slab-pour` — *shared*.
- **5 · תקרה: לוחות חלולים**
  - `p5p-hollowcore` — + hollow-core planks laid by the crane across the lower floor (visible cores at the ends).
  - `p5p-topping` — + topping mesh + thin concrete topping pour (pump truck).
- **6 · קומת כניסה: הרכבת פאנלים**
  - `p6-ground-slab-prep`, `p6-ground-slab-pour` — *shared*.
  - `p6p-panels` — entrance-floor wall panels.
  - `p6p-mamad` — ממ״ד טרומי. + the precast ממ״ד module lowered in one piece.
  - `p6p-hollowcore`, `p6p-topping` — roof planks + topping.
  - `p6p-frame-done` — השלד מוכן. − crane, − panel props; orbit reveal (like `p6-strip-all`).
- **7**: `p7p-parapets` (precast parapet units), `p7-blocks-interior` *shared*, `p7-blind-frames` *shared*.
- **8** — *shared*.
- **9** — *shared*.
- **10**: `p10-scaffolding` *shared*, `p10p-joints` (+ sealant along every panel joint), then `p10-plaster-interior`, `p10-stone-cladding`, `p10-plaster-exterior`, `p10-scaffolding-down` *shared* (re-worded).
- 11–13 — *shared*.

## Where things go (ownership)

| Owner | Files |
|---|---|
| Orchestrator | `lib/build3d/methods.ts`, `steps/index.ts`, `steps/methods/{concrete,compose}.ts`, `steps/types.ts`, `engine/timeline.ts`, `content/index.ts`, this file |
| ICF author | `steps/methods/icf/**`, `content/steps-icf.ts`, `METHOD_TOTALS.icf` in `content/totals.ts`, new models/materials it needs |
| Frame author | `steps/methods/{steel,timber,frame-kit}/**` (or `steps/methods/frame-kit.ts`), `content/steps-{steel,timber}.ts`, `METHOD_TOTALS.{steel,timber}` |
| Precast author | `steps/methods/precast/**`, `content/steps-precast.ts`, `METHOD_TOTALS.precast`, the crane model |
| Researcher | `content/methods.ts` (METHODS_INFO), `docs/build3d/methods-research.md` |
| UX | `components/build3d/**`, `app/3d/**`, `engine/phases.ts` (method phase names) |

Shared files (`engine/palette.ts` materials, `models/index.ts` registry, `content/totals.ts`,
`content/prices.ts`): additive edits only, re-read right before editing, never reformat. Do not change
any concrete step's geometry or ids: other methods `pick()` them and the concrete tests pin them.

## Text

`content/steps-<method>.ts` holds the method's own steps **and** re-wordings of shared steps (same id).
`withText(def, method)` prefers the method entry. Same style as steps-a/b: Hebrew, concrete numbers,
a practical tip, a checkpoint where an inspection really happens. Costs/durations: realistic Israeli
2026 figures, before VAT, consistent with `docs/build3d/methods-research.md`.

## Done means

- `npx vitest run tests/build3d` passes (methods.test.ts: no builder errors, no dangling removals,
  unique ids, phases monotonic, text for every step; totals.test.ts: your METHOD_TOTALS entry matches).
- `/3d/viewer/?method=<id>&step=N` reads at a glance for every step (screenshot walk: `data/tools/pw`).
- The finished house (`p13-done`) is identical to concrete's.
