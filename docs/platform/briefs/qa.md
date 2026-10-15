# Brief: `qa` (Wave C). Dev port 3121. Migration slot `20261014130000`–`20261014130499`. API cap $0.30

You are the quality gate before the owner sees this platform. Find what's broken, insecure, slow, inaccessible or
embarrassing. Fix what you safely can, and report the rest precisely.

Read first:
- `docs/platform/PROGRAM.md`, including §7, the definition of done.
- Every `docs/platform/*.md`.
- Every brief in `docs/platform/briefs/`.

## Scope
1. **E2E tests.** Write them with Playwright as a project devDependency, with a config under `apps/web/e2e/` and an `npm run e2e` script. Run them against a local production build (`next build && next start -p 3121`) with the local Supabase. Cover the critical journeys, desktop and mobile:
   - Home → ask the headline question → sources show → the answer streams → a video moment plays → a follow-up chip → "שתפו בוואטסאפ".
   - Planner: 5 steps → result → the booking sheet shows the project file → (mock) booked → the lead appears in the admin consult queue with a score and ref.
   - Onboarding in under 60 seconds → hub dashboard → save a video → shortlist a pro → upload a document.
   - Pro portal for a seeded pro: stats, then a tier upsell through mock checkout.
   - Admin: Command Center tiles render; insights; autopilot queue; leads inbox with project files.
   - Every `/platform/demo/*` view, plus `/platform/` and `/platform/tour/`, renders with no console errors.
   - Regression: article, legacy video page, YouTube-id video page, business page with gated phone reveal, cart/checkout (mock), signup/login.
2. **URL parity.** Run `scripts/migrate/url_parity.py` against a local production build. It must stay 1214/1214. Investigate any regression and fix it.
3. **Lighthouse (mobile)** on home, `/ask/`, article, video, business, `/calculator/`, `/my-home/` and `/platform/`. Targets: SEO, a11y and best-practices ≥ 90, performance ≥ 85. Record the numbers in the report.
4. **Accessibility.** Run axe-core via Playwright on the same pages. Check keyboard-only flows through ask, planner, onboarding and the booking sheet. Check focus traps in dialogs, contrast, labels and `prefers-reduced-motion`.
5. **Security review.** Also invoke the `security-review` skill on the branch diff vs `main`.
   - RLS on **every** new table, run on the local stack as anon, member A, member B, pro, partner, manager and staff. Produce a table of results.
   - Auth on every new route: admin, cron (`CRON_SECRET`), the `/platform` gate, partner/pro portals.
   - Rate limits and the AI budget guard on every AI route.
   - XSS: markdown rendering, JSON-LD, user-generated text (reviews, notes, project names).
   - Open redirects (`next=` params), and CSRF on server actions.
   - **Secrets in client bundles.** Grep `.next/static` for `sk-`, `sb_secret`, `service_role` and the API key prefixes.
   - Personal data in analytics props.
6. **Copy and RTL.**
   - No English leaking into the UI.
   - Consistent names: the advisor name from config, "הבית שלי", "תיק פרויקט", "חדר הבקרה".
   - Numbers stay LTR; cost figures are dated.
   - No broken Hebrew line breaks on mobile.
7. **Cost.** Total the ledger in `docs/platform/API_SPEND.md` (program cap $5). Verify the AI routes record usage, and that the daily cap degrades gracefully.

## Process
- Work on `feature/platform-qa`. Fix P0/P1 issues directly when the fix is local and safe. For anything that touches a squad's core logic, write a precise finding instead: file, line, repro, and suggested fix.
- Produce `docs/platform/QA_REPORT.md`:
  - findings, ranked P0–P3, each with its status (fixed or open);
  - the Lighthouse table;
  - the RLS matrix;
  - parity results;
  - E2E results.
- Run every charter gate. E2E stays opt-in (it needs a running stack), but document how to run it.
