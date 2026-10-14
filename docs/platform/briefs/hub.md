# Brief: `hub` (P2, Must). Dev port 3112. Migration slot `20261014121000`–`20261014121959`. API cap $0.20

You own **הבית שלי · תיק פרויקט**, the builder's free personal workspace from plot to keys. It's why builders sign
up and come back for 1–3 years. It's also where the owner gets first-party data: stage, region, m², budget and
timeline.

Read first:
- `docs/platform/PROGRAM.md`, all of it (§3.1 P2 and P7, §6 project-file contract).
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md`
- `lib/stages.ts`: the owner's 7 stages, which the design squad created. You may extend it with per-stage content.

## Today
- Supabase Auth exists: email/password and Google. See `docs/ARCHITECTURE_PARITY.md` §4.
- `profiles` holds `construction_stage`, `region_id` and the opt-ins.
- `/account/` only lists orders.
- The 14 regions are in `regions`, and `lib/calculator.ts` produces cost breakdowns. The `growth` squad is recalibrating it to the owner's 2026 numbers in parallel. **Call its exported functions; don't modify it.**

## Build

1. **Onboarding at `/my-home/start/`.** This is the "מיפוי מצב → מפת דרך אישית → ליווי" flow, in **≤ 5 fields**:
   - region;
   - stage (the 7);
   - house m²;
   - budget range;
   - target move-in month.

   It works anonymously (`bb.hub.draft` in localStorage, exactly per PROGRAM.md §6) and persists on signup or login.

   It ends in a **reveal moment**: "המפה האישית שלכם מוכנה". It must take under 60 seconds on a phone.
2. **Dashboard at `/my-home/`:**
   - **Header:** a summary of the project, the current stage on a 7-stage progress track, and the days until the target date.
   - **"מה עושים השבוע":** 3 concrete actions for the current stage.
   - **Personal roadmap:** the 7 stages. For each stage:
     - what happens;
     - typical duration and its share of the budget;
     - a checklist of 6–10 items. Write good, practical Hebrew from the owner's content; skim the stage categories' articles.
     - the top videos and articles for that stage. Pick them at build time or from the DB by stage category, plus the static index by stage keywords.
     - "שאלו על השלב הזה" → `/ask/?q=…`
   - **Budget:** the initial estimate from `lib/calculator.ts`, or from the planner's `bb.planner.last` when present. Then actuals and quotes by category, with the variance against the estimate.
   - **Saved:** videos, articles, pros and answers.
   - **My pros:** a shortlist (`bb.shortlist` for anonymous visitors, DB for members), plus contact history from my leads.
   - **Documents:** a private Storage bucket `hub-docs` with owner-only RLS, for plans, permits and quotes (PDF/images, with size limits).
   - **Tasks:** a simple todo list with due dates.
   - **"תיק הפרויקט שלי":** shows the builder exactly what the consult team will see, with a completeness meter. The CTA is "קבעו פגישת ייעוץ — התיק יגיע איתכם" and uses the existing `ConsultationCTA`; the `revenue` squad is upgrading it to carry the file.
3. **SaveButton and ShortlistButton:** small client components, wired with minimal edits into:
   - the video pages (both kinds);
   - the article page;
   - the business page and business cards.

   They emit `hub_item_saved` / `shortlist_add`. Anonymous visitors get local state plus a gentle "התחברו כדי לשמור לתמיד".
4. **Data, in your migrations.**
   - Tables:
     - `hub_projects`: one per member for now, but allow many.
     - `hub_project_members`: role `owner | manager`. The `manager` role is for P7 Bonim.Os next wave, where a project manager sees assigned clients.
     - `hub_checklist_state`
     - `hub_budget_items`: support **versions**, for P7's budget-vs-actual history.
     - `hub_saved_items`: polymorphic `kind` + `ref`.
     - `hub_documents`
     - `hub_tasks`
   - RLS: project members only.
   - The owner's staff get **aggregates only**, through security-definer RPCs: stage, region and budget distributions, and onboarding counts. They get no access to documents.
   - Also sync `profiles.construction_stage` and `region_id` from onboarding.
5. **Server-side project file for members.** Export `getMemberProjectSnapshot(memberId)` in `lib/hub/server.ts`, returning the `ProjectFile` fields from PROGRAM.md §6. The `revenue` squad's `collectProjectFile()` will call it.
6. **`/account/`:** members land on `/my-home/`, with orders kept as a tab or link. Polish signup and login on the design system. The "הבית שלי" header slot should point to `/my-home/` (`lib/nav.ts`).
7. **Demo view `/platform/demo/hub/`.** A fictional family, "משפחת לוי": 220 m² in Sharon, at the היתר stage, budget ₪2.6M, with saved items, a shortlist, a budget with actuals and a few tasks. Build it from foundation fixtures, and register it as `'ready'`.
8. **Analytics:** `signup_started`, `signup_completed`, `hub_onboarding_completed`, `hub_item_saved`, `shortlist_add`. Add any missing names to the catalog.

## Quality bar
- Mobile-first, warm and genuinely useful: a builder should want to open it every week.
- Every empty state teaches the builder something.
- Run every charter gate. Write unit tests for:
  - the onboarding → project mapping;
  - snapshot building;
  - RLS: as anon, member A, member B, a manager and staff, against the local stack.
- Screenshots, desktop and mobile: onboarding (each step), the reveal, the dashboard, a stage detail, budget, documents and the demo view.
