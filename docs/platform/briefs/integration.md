# Brief: `integration` (Wave C, first). Dev port 3124. Migration slot `20261014130500`–`20261014130999`. API cap $0.20

Six squads built in parallel against contracts. You make them one product. The demo path is in
PROGRAM.md §3.1: P1 → P6 → P2 → P4 → P3 → P7 → P5 → F. It must flow seamlessly on a phone with real
data paths, and every hand-off between squads must work.

Read first:
- `docs/platform/PROGRAM.md`: all of it, especially §3.1, §6 and §7.
- Every brief in `docs/platform/briefs/`.
- `docs/platform/{DESIGN_SYSTEM,FOUNDATION,AUTOPILOT,KNOWLEDGE_COVERAGE}.md`
- The merged code of every squad.

## Wiring checklist

Verify each hand-off end to end on the local stack, and fix what's missing.

1. **Advisor → revenue.**
   - Advisor lead moments use the upgraded `ConsultationCTA` booking sheet, so the project file goes with the booking, including `bb.advisor.recent`.
   - The pros moment uses revenue's `rankPros()` from `lib/directory/match.ts`, so tiers affect ordering within relevance.
   - Answers show a contextual partner offer (`getContextualOffers` + `<PartnerOfferSlot>`) when one fits the topic, stage and region. It never replaces the pros moment, and an answer shows at most one offer.
2. **Advisor → hub.**
   - "שמרו בבית שלי" on an answer saves it as a hub saved item of kind `answer`, linking to its snapshot at `/ask/a/<id>/`.
   - "שאלו על השלב הזה" in the hub opens `/ask/?q=…`. Check that the stage context helps retrieval.
3. **Planner (growth) → hub → revenue.**
   - The result writes `bb.planner.last`.
   - "שמרו בבית שלי" updates the hub project budget estimate.
   - Booking from the result carries the estimate in the project file.
   - The hub budget uses `estimateFromProfile()` on the recalibrated price book.
4. **Hub ↔ revenue.**
   - `ProjectFileSnapshot` and `ProjectFile` must be a single type.
   - For a signed-in member, the project file the consult queue shows comes from `getMemberProjectSnapshot()`.
   - The hub's "תיק הפרויקט שלי" shows exactly what Tzuri will see.
5. **Command ← everyone.**
   - Tiles read revenue's scores, bookings and partner tiers, hub aggregates, planner and advisor events, and `ai_usage`.
   - Check every tile shows correct real numbers after you exercise the journeys locally: ask → plan → onboard → book → partner impression.
6. **Homepage and nav.**
   - The hero ask box goes to `/ask/?q=`.
   - The "הבית שלי" teaser and header slot go to `/my-home/`.
   - The planner block goes to `/calculator/`.
   - Live counts come from the final index: 278 transcribed videos, 89.8 h, 806 articles.
   - The "שעות צפייה" label becomes "שעות וידאו".
7. **Feature flags for launch.**
   - Decide each squad flag's default in `lib/flags.ts`:
     - `hub`
     - `commandCenter`
     - `budgetPlanner`
     - any advisor or revenue flags
   - Every pillar must be **on by default** in this build, with an env override to switch it off. List the hosted migrations each one depends on.
8. **Pitch registry.** Every demo view that is ready must be `'ready'` in `lib/demo/views.ts`, and every `/platform/tour/` beat must resolve to a working screen.
9. **Consistency.** Use one term per concept across the UI: "הבית שלי", "תיק פרויקט", "חדר הבקרה", "דוח שותף", and the advisor name from config. Use one stage vocabulary everywhere: `lib/stages.ts`.

## Output
- Branch `feature/platform-integration`, with commits that each name the hand-off they fix.
- `docs/platform/INTEGRATION.md`:
  - each hand-off, how you verified it, and its status;
  - the launch flags and their migrations;
  - a hosted deploy checklist: migrations in order, env vars, cron, post-deploy smoke steps.
- Run every charter gate. Take screenshots of the full demo path, mobile first.

## Known gaps reported by the squads (fold into the checklist)

**From revenue**
- The pitch site links to `/admin/command/`, which returns 404. The command center is `/admin/`.
- `components/admin/DataTable.tsx`: screen-reader-only header text pushes the page sideways on phones. Add `relative` to the scroll container.
- The advisor doesn't call `rankPros()` or `getContextualOffers()` yet (checklist item 1).
- The booking sheet doesn't prefill a signed-in member's name and phone.
- Members without a hub project: put their `profiles` stage and region into the project file.
- `FLAG_REVENUE` must be on by default (checklist item 7).

**From advisor**
- Answer events don't carry the builder's region. Add `regionSlug` from `bb.hub.draft` or the member profile, so the partner portal's "builders asking about your trade in your areas" counts by region, not only by topic.
- Align the meaning of `top_similarity` between advisor and command. The advisor emits the best cosine among the sources sent to the answer. Make command's comment and logic match.
- Local advisor threads aren't imported into the DB on sign-in. This is a Should.

**From growth**
- The homepage teaser and the style guide use seeded planner numbers, not the live price book. Read the price book where it's cheap to do so.

**From knowledge**
- Legacy video pages show the "וידאו" badge twice.
