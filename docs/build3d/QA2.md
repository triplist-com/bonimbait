# Plan → 3D — Integration QA (five methods)

Branch `feature/3d-methods`, 2026-11-21. Dev server on :3121, headless Chromium (swiftshader).
Shots: `data/build3d-shots/qa2/`. Tools: `data/tools/pw/qa-all.mjs` (step walk), `montage.mjs`,
new `data/tools/pw/flow2.mjs` (full demo flow per method: `node flow2.mjs <method> [--size=390x844]`).

## Verdicts

| Method | Steps | Verdict |
|---|---|---|
| `concrete` | 86 | Ships. Every step reads; no regressions against the earlier QA pass. |
| `icf` | 82 | Ships. ICF courses, rebar, bracing and pour read well; `p4-waterproofing` frames like concrete (no close-up problem). |
| `steel` | 86 | Ships after the x-ray fix (#2). Frame steps read; drywall step stays weak (#8). |
| `timber` | 86 | Ships after #2 and #3. Highlighted OSB and studs look red-orange (#9). |
| `precast` | 75 | Ships after the camera fix (#1). Crane, panels, hollow-core and topping now sit left of the card. |

Full flow (landing → sample → picker → method → analysis → viewer → 3 steps → method switch from a
method-specific step → deep link to the last step → summary bar → card → share toast → back to the
picker → Esc → "צפו בבנייה ב-…"): **all checks pass for all five methods at 1440×900 and 390×844, with
zero console errors, page errors or failed requests.** The `*-800.webp` method thumbnails all load (5/5).
Logs: `qa2/flow-<method>-<1440|390>.log`, screenshots `qa2/flow/`.

## Issues

| # | Method · steps | Issue | Sev | Status | Shots |
|---|---|---|---|---|---|
| 1 | precast · 21–23, 27–28, 31–34 | The desktop cameras were tighter than the fit (zoom 0.62–0.8). Panels and hollow-core planks were cut by the left edge and ran under the step card; the crane boom went behind the card. Portrait viewports clamp zoom to ≥ 1, so the phone framing never depended on these values. | P2 | FIXED: zooms 0.92–1.2 in `precast/structure.ts`. Phone framing is unchanged. | before `qa2/before/2*-p4p-*.png`, `27-p5p-hollowcore.png`, … → after `qa2/precast/` (same names); `qa2/sheet-before-after.png` |
| 2 | steel, timber · phase 11+ (flooring, tiles, kitchen, stairs, paint…) | X-ray ghosted every layer of a framed wall (stone, cement board, wrap, OSB, wool, studs, gypsum) at 0.24 each, so the wall rendered nearly opaque. The kitchen in `p11-kitchen` was hidden behind yellow wool and studs. | P2 | FIXED: `engine/runtime/director.ts`. From phase 11, the frame core tags (`frame`, `osb`, `house-wrap`, `cement-board`, `wall-insulation`) vanish when x-ray fades them, the way embedded steel does in concrete, so the skins ghost as in concrete. These tags exist only in steel and timber. | before `qa2/before/73-p11-kitchen.png` (steel; timber looked the same), after `qa2/steel/73-p11-kitchen.png`, `qa2/timber/73-p11-kitchen.png` |
| 3 | timber · 42 `p6t-roof-joists` | With magenta outlines on about 70 thin I-joists, the roof frame read solid red instead of wood. | P3 | FIXED: no outlines on the flanges and webs (same as the steel C-joists) in `frame/phases.ts`. | `qa2/timber/42-p6t-roof-joists.png` (author's before: `frame/walk-timber/42-p6t-roof-joists.png`) |
| 4 | all · picker, comparison | Precast carries the "הכי מהירה" badge and has the fewest months (13.5), yet its speed score was 4 while steel and timber were 5. The comparison contradicted itself. | P3 | FIXED: precast `speed: 5` in `content/methods.ts`. | `qa2/flow/*-6-card.png` |
| 5 | precast · `p7p-parapets` tip | Sentence-initial "וודאו" should be "ודאו". | P3 | FIXED in `content/steps-precast.ts`. | — |
| 6 | steel ↔ timber · switcher | Switching from a method step such as `p6s-walls` dropped the user at the start of phase 6 (before the ממ״ד), not on the parallel `p6t-walls`. | P3 | FIXED: `viewer/methodSwitch.ts` maps a method step to its sibling (`p6s-walls` ↔ `p6t-walls`, `p7s-parapets` ↔ `p7t-parapets`/`p7p-parapets`, `p10s-drywall` ↔ `p10t-drywall`…) before falling back to the first step of the phase. New test in `method-switch.test.ts`. | — |
| 7 | tests · `timeline.test.ts` | "builds fast enough" was flaky under parallel load (one cold build had to finish in < 600 ms). | P3 | FIXED: best of three builds (the cold build plus two fresh rebuilds), and the fastest must finish in < 300 ms. Warm rebuilds take ~50–70 ms in node, so a real regression still fails. Passed in the full suite while two swiftshader browsers ran. | — |
| 8 | steel, timber · 61 `p10x-drywall` | The boards are on the inner faces and the camera is outside, so the step reads only faintly at rest. The frame author already listed this. | P3 | OPEN | `qa2/steel/61-p10s-drywall.png` |
| 9 | timber · 41, 45, 47 (walls, lower infill, parapets) | The new-part highlight on OSB plus magenta outlines on dense studs reads red-orange rather than wood. It is consistent with the "new = magenta" language and resolves to wood on the next step. | P3 | OPEN | `qa2/timber/47-p7t-parapets.png` |
| 10 | steel, timber · 54–57 (p9) | The shared p9 pipes sit 2 cm in front of the studs, not in the cavity, and are thin and hard to pick out against open framing. The cavity offset is imperceptible at demo distance. A fix would need a framed-wall offset in about six placement sites of the shared `p09-systems.ts`, so it is not cheap. | P3 | OPEN | `qa2/timber/54-p9-plumbing.png` |
| 11 | precast · 32 `p6p-mamad` | The view from the back puts the crane superstructure large at the top of the frame. The module still reads clearly. | P3 | OPEN | `qa2/precast/32-p6p-mamad.png` |
| 12 | dev only | For a few seconds after "צפו בבנייה ב-…" from the summary, `window.__b3d.director` can still be the previous viewer's director. The UI and URL are correct. This only affects capture scripts: `flow2.mjs` reads the card instead. | — | note | — |

Checked and fine: per-method phase names in the step card pill, scrubber label and step list (ICF
"קומה תחתונה: קירות ICF", precast "תקרה: לוחות חלולים", steel "קומת כניסה: שלד פלדה קלה" /
"מעטפת: לוחות, בידוד וגבס", timber "קומת כניסה: מסגרת עץ"). Framed-method text does not mention blocks or
plaster where the work is gypsum: "טיח" appears only for the exterior render on cement board and the
concrete podium and ממ״ד walls. Bills have no zero or NaN quantities. Numbers are consistent: months from
METHOD_TOTALS days/22 match METHODS_INFO (16.5 / 15 / 15 / 15 / 13.5), and the precast cost delta is +6.2 %.

**Counts:** P1 0 · P2 2 (both fixed) · P3 9 (5 fixed, 4 open), plus one dev-only note (#12). The
build-time test (#7) is counted as a fixed P3.

## Contact sheets (every step of every method, 1440×900)

- concrete: `qa2/sheet-concrete-01-40.png`, `qa2/sheet-concrete-41-86.png` (frames `qa2/concrete/`)
- icf: steps 1–13 are shared with concrete (same ids and geometry: see the concrete sheet);
  `qa2/sheet-icf-14-45.png`, `qa2/sheet-icf-46-82.png` (frames `qa2/icf/`)
- steel: steps 1–33 are shared with concrete (concrete podium, see the concrete sheet);
  `qa2/sheet-steel-34-86.png` (frames `qa2/steel/`)
- timber: steps 1–33 shared, as for steel; `qa2/sheet-timber-34-86.png` (frames `qa2/timber/`)
- precast: `qa2/sheet-precast-01-40.png`, `qa2/sheet-precast-41-75.png` (frames `qa2/precast/`, with the fixed
  frames from #1)
- before/after: `qa2/sheet-before-after.png` (#1 and #2)

## Phone pass (390×844)

56 deep-linked steps: each method's own structure steps plus the finale. All of them read; the sheet
layout, peek card, scrubber, header switcher and summary bar fit at 390 px. The precast camera change (#1)
does not affect phones (portrait never zooms in past the fit), and `p4p-crane` shows the whole crane.

- concrete + icf: `qa2/sheet-phone-concrete-icf.png` (concrete 15, 17, 19, 24, 32, 36, 40, 44, 45, 48, 86 ·
  icf 15–19, 33, 35, 39, 44, 82)
- steel + timber: `qa2/sheet-phone-steel-timber.png` (steel 39–47, 49, 61, 86 · timber 40–43, 45, 47, 59–61, 73, 86)
- precast: `qa2/sheet-phone-precast.png` (21–23, 27, 28, 31–36, 75)
- frames: `qa2/phone/<method>/`; phone flow screenshots: `qa2/flow/<method>-390-*.png`

Note on capture timing: in software rendering, a screenshot taken about 5 s after a method switch can catch
the step's entry animation half-played (`qa2/flow/icf-390-4-switched.png`). The same switch is complete at
50 s (`qa2/flow/switch-390-50s.png`). This is capture flakiness, not a bug.

## Tests

`npx tsc --noEmit -p .` clean · `npx eslint lib/build3d components/build3d app/3d tests/build3d` clean ·
`npx vitest run`: 137 files passed / 7 skipped, 1152 tests passed / 41 skipped (the full suite, also run green
while two swiftshader captures loaded the machine).
