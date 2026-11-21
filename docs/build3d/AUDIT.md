# 3D demo audit (concrete method, 2026-11-21)

Scope: `/3d/` landing, analysis animation, `/3d/viewer/?step=N`, finale. Chromium + SwiftShader (frame rates not
meaningful), viewports 1440x900, 768x1024, 390x844. Scripts: `data/tools/pw/audit-*.mjs`. Shots: `data/build3d-shots/audit/`
(`sheet0-2.png` = all 86 steps, `m-peek.png`/`m-half.png`/`m-list.png` mobile, `fin-d-card.png` finale, `big/`, `tab/`).

**Verdict**: no P1 found. The core run (landing, sample, analysis, viewer, 86 steps, finale) works with zero console/page
errors at all three sizes. Controls all behave. The gap is not bugs but "manual feel": the viewer reads as a rich info
dashboard with a 3D scene beside it, not as an assembly manual where the new parts are the hero.

## What passed (verified)
- Landing: no horizontal overflow at 390/768/1440, hero + 3-step explainer, sample button, both notices (`.txt` and a
  non-matching PDF render the alert; fake PDF falls to "unsupported" message), tab order sane with visible focus rings, skip link.
- Analysis: ~8.6 s, counters count up (5,060 blocks / 10.4 t / 184 m3 shown), "דלגו" skip exists, hands off to a top-down plan
  and glides into 3D. Reduced-motion handled there.
- Viewer: arrows (RTL: Left=next, Right=prev), Home/End, next/prev buttons, scrubber click (50% -> step 38) and drag
  (-> step 60), step list, ghost/x-ray/auto-rotate toggles (aria-pressed correct), reset, fullscreen, Space play/pause,
  `?step=` (0/abc/-3 -> 1, 999 -> 86), `/3d/?step=12` deep link, URL kept in sync via replaceState.
- Mobile: bottom sheet peek/half/full by tap and drag, step list drawer, finale bar + card. Finale dialog has proper role/aria.

## Bugs

### P1
None.

### P2
1. **[Fixed: UX-Manual]** **Step card hides its own bottom on desktop with no scroll cue.** The white fade overlay (`AssemblyViewer.tsx`, the
   `bg-gradient-to-t from-white` div) covers the last ~36 px; on steps with tip + checkpoint + videos the video links
   and "לסרטונים בנושא" sit under it (see `big/31-p5-rebar-top.png`, video link faded). Users do not know to scroll
   (`aside` is `overflow-y-auto`). Fix: collapse tip/checkpoint/videos into one "עוד על השלב" accordion (default closed),
   or add a visible "גללו" chevron + only show the fade when `scrollTop + clientHeight < scrollHeight` (onScroll state).
2. **[Fixed: UX-Manual]** **Tablet/small-laptop framing crops the house.** At 768x1024 (`tab/38-p6-mamad-rebar.png`) the desktop layout is used
   (mobile breakpoint is 640): card is 320 px wide (42%), house is cut off at the left edge and the mamad rebar is off-center.
   At 900x560 (sheet images) the card covers about 36% of the scene. Fix: raise the mobile breakpoint to `max-width: 900px`
   (or use sheet layout for portrait < 1024), and have Stage fit the *visible* rect from `insets` (verify `insets.right`
   is actually subtracted from the fit bounds for wide steps).
3. **[Fixed: UX-Manual, except per-room paint colors (step authors)]** **Finishing steps do not read.** Steps 49-55 (all white roof), 57-58 (drainage, electrical, nearly invisible), 74-76
   (sanitary, paint, lighting; `big/75-p11-paint.png` shows no paint change at all) look identical to their neighbours
   on the contact sheets. Fix per step: highlight pulse on newly added/changed meshes (see improvement 2), peel the
   roof for interior phases by default (not only x-ray), and for paint tint the walls per room color.
4. **[Fixed: UX-Manual]** **Mobile finale house is cropped** (`fin-p.png`): the dusk hero shot is framed for landscape; left side of the house
   is cut off and the summary bar floats tight above the sheet. Fix: portrait framing multiplier for step 86 in the
   camera rig when `mobile`.
5. **"₪2.25M" in the finale bar** (`Summary.tsx` `SummaryBar`) is an English abbreviation in a Hebrew UI, and the bar says
   "16 חודשים" (`Math.round(days/22)`) while the card says "כ-16.5 חודשים" (`fmtMonths`). Fix: use "₪2.25 מיליון" and
   reuse `fmtMonths` in both.
6. **Method switch is not wired into the URL/viewer UI yet.** `readUrlMethod()` runs once in `Build3DApp` (mount) and
   `AssemblyViewer` is re-keyed by `method`, so any picker must also reset `initialStep` and `intro`, otherwise it restarts
   the plan intro or jumps to a step that does not exist in the other method (steps differ by count).

### P3
7. **[Fixed: UX-Manual]** Toolbar icon buttons are 36x36 on desktop (`ToolButton`, `sm:h-9 sm:w-9`) and 40x40 on mobile; guideline is 44. Also
   icon-only with no visible label (the ghost/layers and auto-rotate icons are ambiguous). Fix: 44 px on touch
   (`pointer: coarse`), add tooltips with text on hover/focus, and group "view" toggles in one menu.
8. **[Partly: UX-Manual did the pill truncation + ink scrubber label with a color dot]** Phase pill text is long ("קומה תחתונה: שלד", "קומה תחתונה: תקרת קומה תחתונה" wraps in the card header); the scrubber
   phase label under the bar is 11.5 px colored text on white (contrast for lighter phase colors is below 4.5:1,
   e.g. pastel greens/oranges). Fix: darken label color 30% or use ink text with a color dot.
9. **[Fixed: UX-Manual]** Global Space handler (`AssemblyViewer.tsx` keydown) calls `preventDefault()` even when a button/link is focused, so
   Space on "הבא" toggles autoplay instead of activating the button. Fix: skip when `target.closest('button,a,[role=slider]')`
   (slider keeps its own arrows via the global handler).
10. **[Fixed: UX-Manual]** `role="slider"` scrubber has `tabIndex=0` but no own key handling and no `aria-orientation`; screen readers announce
    it as adjustable but Up/Down do nothing. Add Up/Down/Home/End on the element.
11. **[Fixed: UX-Manual]** The viewer ignores `prefers-reduced-motion` (camera tweens, slide-up card, auto-rotate). Landing/Analysis already do.
12. At the last step the "הבא" button just goes disabled (35-40% opacity) with no replacement action; dead-end if the summary is
    closed. Swap it for "לסיכום" (reopen summary) or "מההתחלה".
13. **[Fixed: UX-Manual]** Mobile bottom sheet peek (198 px) shows only title + scrubber + nav: no description, no cost/duration. A user who never
    pulls the sheet up never sees any numbers. Add one line "3 ימים · ₪3,000" to the peek header.
14. Landing: on 768x1024 the H1 starts at y=551 (hero image above it fills the fold) and on 390 the CTA is just under the
    fold; nudge by reducing hero height on `sm`/phones, or putting the headline first on tablet portrait.
15. **[Fixed: UX-Manual]** Landing small tap targets: header links 99x20 and 106x32, footer link 91x18 (`Landing.tsx`). Pad to 44 px.
16. Hard-coded "מגרש 43" language in notices is fine for a demo but the button label "כן, הראו לי" for a non-PDF file
    sounds odd right after "צריך קובץ PDF"; use "לראות את מגרש 43".
17. Analysis: final plan frame holds ~2 s with no motion before the 3D appears; under SwiftShader the 3D "end" capture
    showed no UI yet (intro still running). Not reproducible as a bug on GPU, but confirm on a real device that UI returns
    promptly after `onIntroDone`.

## Gap analysis vs. IKEA / BILT / Lego Builder style viewers
| Best-in-class has | Here |
|---|---|
| Big step number, one action, minimal chrome | Number + title are good; but card has 8 blocks (desc, materials, duration, cost, crew, cumulative, tip, checkpoint, videos) competing |
| "Parts needed" panel with picture + quantity | Text chips "0.35 טון זיון עליון" with no thumbnail; qty is a dark badge, no icon |
| New parts highlighted, old parts neutral | New parts are not distinguished (step 31: orange rebar happens to pop because of its color; later steps do not) |
| Arrow/callout at the placement point | None. Only crane/trucks animations |
| Exploded or peeled views, part drop-in animation | Parts do animate in; no explode; x-ray only |
| Per-step camera that frames the new parts | Yes, mostly good; fails on tablet and some finishing steps |
| Checklist/progress per section, quick jump | Phase-colored scrubber + list: good |
| Printable manual / share | None |

## Top 10 improvements (impact / effort)

1. **[Done: UX-Manual]** **"New this step" highlight** (S). In `Stage.tsx`/engine, outline or emissive-pulse the meshes added or modified by the
   current step for ~2 s, then settle; dim finished parts to a neutral tone (a 20-30% desaturate toward warm gray) when
   `xray` is on. Accept: on every step the new geometry is visually the most saturated object; works for roofs/paint
   (tinted walls pulse); toggle in toolbar ("הדגשה"). Fixes P2-3.
2. **[Done: UX-Manual]** **Parts panel with icons and quantities** (M). Replace "חומרים וכמויות" chips in `StepCard.tsx` with a grid of
   tiles: 56 px icon/thumbnail (lucide or small SVG per material category: rebar, block, concrete, pipe, window, door...
   data via `content/materials.ts` map `nameHe -> icon`), big "x78" qty, unit under it. Accept: tiles visible without
   scrolling on desktop at 1440x900 for all steps; same panel appears in the mobile peek as a horizontal scroller.
3. **[Done: UX-Manual, one pin per step]** **Numbered 3D callouts and arrow on the new part** (M). Use drei `Html` anchored at each step's `focus` point
   (engine already computes camera targets) with a numbered pin + short label ("זיון עליון") and a bouncing arrow
   pointing at the element; fade out after 3 s or on orbit. Acceptance: 1 to 3 callouts per step, never overlap the card
   (use `insets`), hidden when `prefers-reduced-motion`.
4. **[Done: UX-Manual]** **Slim the step card to "manual" content** (S). Default view: number, title, 1-2 line description, parts panel, duration +
   cost. Everything else (crew, cumulative, tip, checkpoint, videos) under a "פרטים נוספים" accordion with tip/checkpoint
   badges visible as icons only. Removes the fade/hidden-links problem (P2-1) and cuts clutter. Files: `StepCard.tsx`.
5. **[Done: UX-Manual]** **Mobile peek upgrade** (S). Put the parts tiles scroller + "3 ימים · ₪3,000" in the 198 px peek, nav buttons stay;
   move the full text to the expanded sheet. Files: `AssemblyViewer.tsx` (header prop), `BottomSheet.tsx`.
6. **[Done: UX-Manual]** **Responsive breakpoint and framing fix** (S). Sheet layout up to 900 px and for portrait tablets; verify Stage fit uses the
   unobstructed rect (P2-2). Add Playwright check at 768x1024 and 1024x600 in `qa-all` to the QA doc.
7. **[Done: UX-Manual, runtime default for phases 9/11; no explode]** **Peel/explode for interior phases** (M). A per-step `view.peel: 'roof' | 'upper' | 'none'` default for phases 9 and 11
   so plumbing, electrical, paint, lighting are shown from above with the roof lifted (animated) instead of relying on
   x-ray alpha. Accept: steps 56-58 and 65-76 each show the new work clearly in a still frame.
8. **[Done: UX-Manual, except holding the camera]** **Smoother step transition** (S-M). Today the camera tweens and parts animate, but the card swaps instantly
   (`animate-slide-up`). Cross-fade card content, hold the camera until the previous build animation finishes (or skip it when
   the user advances quickly), and show a thin per-step progress line in the footer while the step animates. Accept:
   holding Right/Left key never shows a half-built flicker; no layout shift in the card.
9. **Finale as a call to action** (S). Summary card: add "בחרו שיטת בנייה אחרת" (links back to method picker), "שתפו"
   (copy deep link with `?step=86&method=`), and a "הורדת חוברת הרכבה (PDF)" button later. Fix the "M" abbreviation (P2-5).
   Files: `Summary.tsx`.
10. **[Done: UX-Manual]** **Per-step micro-polish**: "שלב הבא: ..." preview line under the Next button on desktop (title of step n+1), keyboard
    hint chip (← →) on first visit, Space handling (P3-9), 44 px touch targets (P3-7). Small effort, large "product" feel.

## Notes for the construction-method picker
- Step counts and ids differ per method: reset `initialStep` to 1 and `intro` per `method` change, do not carry `?step=`;
  keep it in the URL (`?method=&step=`) and validate the pair (clamp already exists, but the intro/step reset does not).
- The landing/analysis text and Summary totals must be method-aware: Analysis counters (5,060 blocks / 10.4 t / 184 m3)
  and the finale card ("בלוקים 5,060", "ברזל זיון", 86 שלבי עבודה) are concrete-specific; `METHOD_TOTALS` exists but
  verify every label (a timber house has no blocks/rebar tiles; hide or swap the tile).
- Put the picker on the landing before "נסו עם תוכנית לדוגמה" (default concrete) and a compact switcher in the viewer top bar
  (a segmented control would overflow the 390 px toolbar; use a sheet/menu). A switch mid-run should keep the user at the
  nearest equivalent phase (map by phase, not by step index) rather than restarting.
- Phase colors and names are method-specific (`engine/phases.ts`); the scrubber phase labels (11.5 px) and the card pill
  will get longer names, so test wrap and contrast.
- Highlights/callouts (improvements 1-3) must work off step data, not concrete assumptions: placeholder methods that look
  like concrete today will otherwise show the wrong parts panel against the wrong geometry.
- Compare mode (concrete vs ICF: days, cost, crew) in the picker would be the strongest differentiator; the card already
  has `cumCost`/`cumDays` per timeline, so a two-column totals table is cheap.
