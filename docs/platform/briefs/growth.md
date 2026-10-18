# Brief: `growth` (P6). Dev port 3115. Migration slot `20261014124000`–`20261014124959`. API cap $0.20

You own **תקציב ראשוני ב-3 דקות** (the budget planner, a Must) and **video key-moment rich results** (a Should).
The planner is the owner's best lead magnet. Its job is to sell his ₪6,900 "בונים תקציב" plan by showing a
builder a credible ±15% range, then offering "דיוק של 3%–5%".

Read first:
- `docs/platform/PROGRAM.md` in full: the §3.1 P6 row and the copy rules, and the §6 project-file contract.
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md`

## Today
- **`/calculator/` is broken in production.** `app/calculator/WizardClient.tsx` calls `/api/wizard/{questions,prefill,calculate}`. Those routes proxy to the dead FastAPI backend and return **502**.
- `lib/calculator.ts` is described as mirroring the backend logic. It also powers 20 SSG scenario pages at `/calculator/[slug]`.
- The numbers are **stale**: the base is ₪7,000/m².
- The owner's 2026 figures, from his article https://bonimbayit.co.il/cost-build-private-house-2026/ and podcast Ep. 109/107:
  - planning plus build costs about **₪12–14K/m² ex-VAT**;
  - the shell is about **₪800K for 200 m²**.
- Verify these against the article and our indexed content, and cite them.

## Build
1. **Fix and rebuild `/calculator/`, fully in-process.** Delete the `/api/wizard/*` proxies, or re-implement them in-process. Nothing may call `BACKEND_URL`.
   - **At most 5 questions:** m², floors, region, finish level, and extras (basement, pool, etc.).
   - **Prefill** from `bb.hub.draft` when it exists.
   - **Mobile-first and beautiful.** It should take 3 minutes.
2. **Recalibrate with an admin price book.**
   - A `planner_price_book` table (your migration) holding:
     - ₪/m² by finish level;
     - regional factors;
     - the split across the 7 stages from `lib/stages.ts`;
     - extras;
     - VAT handling;
     - a "valid as of" date.
   - An admin page to edit it. Add its entry to `lib/admin/nav.ts`.
   - Seed it with the owner's 2026 numbers.
   - The output is a **±15% range**.
   - Keep the exported calculation API stable for the 20 scenario pages and for the `hub` squad, which calls it. If you must change it, keep a compatible adapter.
3. **Result screen.** It shows:
   - the total range and ₪/m²;
   - a breakdown by the 7 stages;
   - a rough timeline;
   - a "נכון ל-2026" date and the sources (his article and podcast);
   - **three "פה הכי קל לחרוג" warnings, each with a real video moment.** Pick real youtube ids and timestamps by querying the static index offline, and pin them in a config.

   Then the CTAs:
   - **Primary:** "רוצים דיוק של 3%–5%? קבעו פגישת ייעוץ תקציב — ללא עלות", using the existing `ConsultationCTA`. The `revenue` squad is upgrading it so the project file travels with the booking.
   - A link to the בונים תקציב plan at `/membership-tiers/`.
   - "שמרו בבית שלי": write `bb.planner.last` per PROGRAM.md §6, and link to `/my-home/`.
   - "שתפו בוואטסאפ".
4. **Printable branded report at `/calculator/report/`.**
   - A4 print CSS with the owner's logo, the ranges by stage, assumptions, the warnings with links, sources and a date.
   - Something the owner would be proud to send.
   - **Optional:** "שלחו לי את הדוח" captures email or phone into a `budget_report` lead that carries the estimate. Use the existing leads pipeline.
5. **Keep the 20 `/calculator/[slug]` scenario pages.** Recalibrate them and restyle them on the design system, with internal links to the planner.
6. **Analytics:** `planner_started`, `planner_completed`, `budget_estimate_completed`, plus CTA clicks.
7. **Video key moments (Should).** Add VideoObject + `Clip` structured data to the static `/video/<youtube-id>/` pages and the legacy `/video/<slug>/` pages, using chapters or segment start times.
   - The `autopilot` squad already did this for runtime pages; reuse `lib/jsonld.ts`.
   - Validate the output with a schema check in tests.
   - **Don't** add FAQ rich results or programmatic SEO pages. Those are out of scope by decision.

## Quality bar
- The estimate must feel professional and honest: ranges, not false precision; dated; sourced.
- All charter gates must pass.
- Unit tests cover:
  - the price-book math;
  - rounding and ranges;
  - the stage split;
  - prefill mapping;
  - JSON-LD validity.
- Screenshots, desktop and mobile:
  - each planner step;
  - the result;
  - the printed report (use Playwright's `page.pdf` or the print media emulation);
  - a scenario page;
  - the admin price book.
