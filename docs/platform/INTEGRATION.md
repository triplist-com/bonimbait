# Integration: one product

The `integration` squad's report (Wave C, 2026-10-15/16, branch `feature/platform-integration`). Seven
squads built against shared contracts: advisor, hub, revenue, growth, command, pitch and, merged last,
bonimos. This document covers four things:

- every hand-off between them, how it was checked on the local stack, and its status;
- the launch flags and the migrations each one needs;
- the hosted deploy checklist;
- what is still open.

**Bottom line.**
- All 9 checklist items from `briefs/integration.md` and every gap the squads reported are fixed or
  verified. The one exception is a "Should": importing local advisor threads on sign-in (§5).
- The demo path runs end to end on a phone against real data paths, from the first question to a
  scored lead in the consult queue with a partner attribution, and it shows up in חדר הבקרה.
- Every pillar is on by default, and each has an env off switch.
- Two new migrations are needed on hosted, both in the integration slot (§4.1).

---

## 1. Hand-offs

Status: ✅ done and verified end to end · ☑️ verified, no change needed.

### 1.1 Advisor → revenue

| Hand-off | What changed | How it was verified | Status |
|---|---|---|---|
| Lead moments book through revenue's `ConsultationCTA` booking sheet, so the project file goes with the booking, `bb.advisor.recent` included | No change needed: `LeadMoments` already renders `ConsultationCTA` (card), which opens `BookingSheet`, and `collectProjectFile()` reads `bb.advisor.recent` | Visitor journey: ask, then book from the hub. Lead `BB-26-000091` stores the question in `payload.project_file.questions`, with score 78 and the reason "שאלה אחת על שלד" | ☑️ |
| The pros moment uses `rankPros()` | `app/api/_lib/pros.ts` ranks the specialty's pros, up to 60 candidates, with `rankPros()` through `lib/advisor/pros-rank.ts`. Relevance comes first: the specialty, then the visitor's region (when any pro serves it, only those pros count). Ordering within relevance: exact region +30 / nationwide +15, rating and reviews, the owner's featured pick, and +12 per partner-tier rank. Tiered pros wear `PartnerTierBadge` | Unit tests in `tests/advisor/pros-rank.test.ts`: a tier lifts a pro among equals, region beats nationwide, and reputation beats a featured pro with no reviews. Member journey: the pros card says "פעילים באזור השרון", with the region taken from the member's project | ✅ |
| A contextual partner offer on answers (`getContextualOffers` + the offer card), at most one, never replacing the pros | Pipeline: after the answer, `answerOffer()` gets the topic (the pros specialty plus the question), the builder's stage and region, and `placement: 'answer'`, then calls `getContextualOffers(…, { limit: 1 })`. The `done` event carries `offer`. `LeadMoments` renders it as `PartnerOfferCard`, which is `PartnerOfferSlot`'s card: client-safe and measured by `<ViewableImpression>`. Refusals, out-of-scope and degraded answers get none | Pipeline tests. Visitor journey with a fictional local campaign: the offer showed under the pros, then `partner_impression` (viewable, 1,002 ms) and `partner_click` fired. The lead booked afterwards is attributed `partner:<id>` (4-hour last touch) | ✅ |
| Answer events carry the builder's region (advisor gap) | New `lib/advisor/builder-context.ts`: region and stage come from `bb.hub.draft` (the request) or, for members, their project file (the hub project, else the profile). That context also feeds the pros and the offer. `answer_completed` gains `region`, `stage`, `has_offer` and `offer_partner` (all in the catalog) | Member journey: `answer_completed` has `region: sharon, stage: frame` although the browser had no draft | ✅ |
| The partner portal counts askers by region, not only by topic | Migration `20261014130500_integration_regional_askers`. `revenue_business_metrics()` keeps its body and adds `regional_questions` and `regional_askers`: answers about the trade asked from a region the business serves. The portal shows "מהם, באזורים שלכם", and the partner report adds "N מהם בונים באזורים שאתם עובדים בהם" | Applied locally twice (idempotent); the key is present. Report test. Revenue RLS suite 7/7 | ✅ |

### 1.2 Advisor → hub

| Hand-off | What changed | How it was verified | Status |
|---|---|---|---|
| "שמרו בבית שלי" on an answer saves a hub item of kind `answer` that opens `/ask/a/<id>/` | Finished answers get a save button next to the share bar. The first save publishes the signed snapshot (as sharing does), then saves `{ kind: 'answer', ref: <share id> }`. `savedHref()` opens `/ask/a/<id>/`; old question-text refs still re-ask. `SaveButton` gained an optional `prepare` and its own labels. Behind `FLAG_HUB` | Visitor journey: saved `dsAeAk53B843EQFq` on this device, and `/ask/a/dsAeAk53B843EQFq/` returns 200. Unit test in `tests/hub/saved-format.test.ts` | ✅ |
| "שאלו על השלב הזה" opens `/ask/?q=…`, and stage context helps retrieval | All 21 stage questions were run through retrieval (dry run, $0). They are self-contained, so no retrieval change was needed: 20 found on-topic sources (top cosine 0.44–0.72). The 21st ("מתי משחררים לקבלן את העיכבון?") found only generic content, so it was replaced with "איך שומרים על רצף ביטוחי כשנכנסים לבית?" (0.62). The builder's stage still reaches the advisor through the builder context, for the offer and the events | Dry runs of `POST /api/answer/stream` (`dry_run: true`), one per question | ✅ |

### 1.3 Planner (growth) → hub → revenue

| Hand-off | What changed | How it was verified | Status |
|---|---|---|---|
| The result writes `bb.planner.last` | No change needed | Visitor journey: `{ totalMin: 2,210,000, totalMax: 2,990,000 }` | ☑️ |
| "שמרו בבית שלי" updates the hub budget | The link lands on `/my-home/?saved=planner#budget`. A member's hub takes it as a yes and makes a new budget version at once; the old one is kept and a toast confirms. A visitor's hub already reads `bb.planner.last`. In a managed project whose manager approved the budget, Bonim.Os hides the prompt, which matches its DB guard. The demo result links to the hub demo view | Member journey: the hub shows "לפי מתכנן התקציב שלכם · גרסה 2". The DB holds exactly v1 (calculator) and v2 (planner); there are no duplicates, even on reload | ✅ |
| Booking from the result carries the estimate | No change needed: `collectProjectFile()` reads `bb.planner.last`, and `mergeProjectFiles` keeps the newest estimate | `BB-26-000091` and `BB-26-000092` both carry `plannerEstimate` | ☑️ |
| The hub budget uses `estimateFromProfile()` on the recalibrated price book | `lib/hub/estimate.ts` calls growth's `estimateFromProfile()` (exact m², the 13 member regions) instead of the legacy bucketed calculator. The server passes `loadPriceBook()`, loaded lazily. The onboarding reveal and the visitor's dashboard get the book from their pages | `tests/hub/estimate.test.ts`: equals the engine, follows a given book. Member v1: 2.43–3.29M ₪ for 220 m² in the Sharon | ✅ |

### 1.4 Hub ↔ revenue

| Hand-off | What changed | How it was verified | Status |
|---|---|---|---|
| `ProjectFileSnapshot` and `ProjectFile` are one type | Already derived: `ProjectFileSnapshot = Omit<ProjectFile, 'questions' \| 'source'>` | Type check | ☑️ |
| A member's consult-queue file comes from `getMemberProjectSnapshot()` | `buildProjectFile()` already merged it. Members without a hub project now also carry their profile's stage and region (revenue gap) | `BB-26-000092` (member) has stage, region, size, budget and move-in from the hub project. Tests in `tests/revenue/member-file.test.ts` | ✅ |
| "תיק הפרויקט שלי" shows exactly what Tzuri will see | The panel builds the file a booking sends (`consultFile()`: the booking sheet's merge) and shows the consult queue's facts. That means the planner estimate, not the site estimate Tzuri never sees, and the questions themselves. Missing items link to the planner, the directory or the advisor | Contract test: the panel's file equals the stored lead's file. Screenshots `shots/visitor/11-hub-file` and `12-booking-sheet` show the same facts | ✅ |
| The booking sheet prefills a member's name and phone (revenue gap) | `loadMyBookingDefaults()` returns the file plus the member's own name, phone and email. The sheet fills empty fields only | Member journey: name, phone and email prefilled (`shots/member/04-member-booking-prefilled`) | ✅ |

### 1.5 Command ← everyone

| Hand-off | What changed | How it was verified | Status |
|---|---|---|---|
| Tiles read revenue's scores, bookings and partner tiers, hub aggregates, planner and advisor events, and `ai_usage` | Six tiles already covered scores, bookings, tiers, advisor events and `ai_usage`. New: **"המסע של הבונים"**, a strip above the tiles. It shows questions (`answer_requested`), first budgets (`planner_completed`), personal roadmaps (`hub_onboarding_completed`), consult requests and bookings, each against the previous period. It also shows the hub's member projects from `hub_staff_aggregates()`: new projects with an account, and the leading stages | Unit test in `tests/command/core.test.ts`. After the journeys on the local stack (7 days), the numbers match the DB: 2 budgets, 2 roadmaps, 2 requests, 0 booked (call-backs), and "3 projects with an account, frame 67% · permit 33%". Hot leads show 78 and 75, average 77. Partner health shows the fictional partner with 1 viewable impression, 1 click and 1 attributed lead. AI shows $0.82, equal to `select sum(cost_usd) from ai_usage where day = current_date` | ✅ |
| `top_similarity` means the same in advisor and command (advisor gap) | It already measured the same thing: the best raw cosine among an answer's documents, with title-only rows excluded on both sides. The comments now say so. What didn't match was refusals: an out-of-scope refusal also emits `n_sources: 0`, so command counted "שקשוקה" as a content gap. Migration `20261014130600_integration_question_stats` leaves out-of-scope answers out of the averages and the zero-source count, and drops questions whose every answer was out of scope. Low-confidence refusals are still gaps | Applied locally twice; the shakshuka question no longer shows a zero-source answer | ✅ |

### 1.6 Homepage and nav

| Item | Status |
|---|---|
| The hero ask box goes to `/ask/?q=` (visitor journey: `/ask/?q=כמה עולה שלד…`) | ☑️ |
| The "הבית שלי" teaser and header go to `/my-home/` (`ACCOUNT_NAV.home`; the teaser href follows `FLAG_HUB`) | ☑️ |
| The planner block goes to `/calculator/` | ☑️ |
| Live counts from the final index: 278 videos with transcripts, 89.8 h (shown as 90), 806 articles. Checked against `videos.json` and the DB | ✅ |
| "שעות צפייה" → "שעות וידאו" (hero, knowledge line, style guide) | ✅ |
| The homepage teaser and the style guide used the seeded planner numbers (growth gap); both now run on `loadPriceBook()` | ✅ |

### 1.7 Flags: see §3.

### 1.8 Pitch registry and tour

- Every view in `lib/demo/views.ts` is `'ready'` and has its page: advisor, hub, consult-queue, partner,
  pro, command, growth, foundation and bonimos. The registry title uses `advisorName()`.
- Every tour beat resolves to a working screen, with no "בקרוב" left. The tour links the 8 demo views
  plus `/admin/`, `/admin/partners/` and `/admin/autopilot/`.
- `/admin/command/` returned a 404 (revenue gap). It is now `/admin/`.
- P3 opens partner health, and P5 follows `FLAG_AUTOPILOT`.
- A test in `tests/pitch/tour.test.ts` resolves every tour target, pillar link and ready demo view to an
  `app/**/page.tsx`.

### 1.9 Consistency

- **Stages.**
  - The profile-stage pickers (signup, profile, business contact, product lead form), the autopilot
    stage chip and the demo data said "רכישת מגרש", "מכרז קבלנים" and "כניסה לבית". They now take their
    labels from `lib/stages.ts`. Values are unchanged.
  - Staff screens, the CSV export and the lead email showed the raw enum (`moving_in`); they now use
    `constructionStageLabel()`.
  - The video hub's stage chips use the stage names.
- **Names.** "דוח שותף" (portal links), "חדר הבקרה" (pre-P4 title, style guide), "הבית שלי והחשבון"
  (account tabs). The advisor name comes from config everywhere. The booking sheet calls the human
  "מומחה בונים בית", so "היועץ" never means both.
- **Left as is (by decision).** Category archive H1s keep the owner's WordPress category names, for URL
  and SEO parity.

### 1.10 Gaps the squads reported

| From | Gap | Status |
|---|---|---|
| revenue | The pitch links to `/admin/command/` (404) | ✅ `/admin/` |
| revenue | `DataTable` sr-only text widens phones | ✅ `relative` on the scroll box |
| revenue | The advisor doesn't call `rankPros()` / `getContextualOffers()` | ✅ §1.1 |
| revenue | The booking sheet doesn't prefill a member's name and phone | ✅ §1.4 |
| revenue | Members without a hub project: profile stage and region in the file | ✅ §1.4 |
| revenue | `FLAG_REVENUE` must be on by default | ✅ §3 |
| advisor | Answer events lack the region | ✅ §1.1 |
| advisor | `top_similarity` meaning, advisor vs command | ✅ §1.5 |
| advisor | Local threads not imported on sign-in (Should) | ⏳ open, §5 |
| growth | The homepage teaser and style guide use seeded numbers | ✅ §1.6 |
| knowledge | Legacy video pages show "וידאו" twice | ✅ The kind badge is shown once (the category list repeated it on 48 video pages and 25 podcast pages) |

Found and fixed during the journey checks:
- A lead attributed to a partner showed the partner's raw ids in the consult queue. It now shows the
  name.
- "1 פריטים" is now "פריט אחד".
- "מיליון" / "₪" broke across lines in the booking sheet.
- `?saved=planner` came back into the address after the action's refresh.

### 1.11 Bonim.Os (P7), merged last (e08fd2e)

- `FLAG_BONIMOS` is now **on by default**, with migrations `20261014126000_bonimos_core` and
  `…126100_bonimos_storage`.
- **The `/manage/*` shell.** `SiteChromeGate` hides the public chrome on it, as on `/admin` and
  `/platform`.
  - Fixed: it had no way to sign out, because the public header with its account menu is hidden. It now
    has "התנתקות", like the admin shell.
  - Checked: 200 at 390 and 1440 with no sideways scroll, and `/admin/bonimos/` the same.
- The tour's Bonim.Os beat opens `/platform/demo/bonimos/`.
- **RLS on the local stack:**
  - hub 5/5, run after Bonim.Os's activity triggers and budget-approval guard;
  - Bonim.Os 6/6;
  - revenue 7/7.

---

## 2. How it was verified (local stack, 2026-10-15/16)

| Check | Result |
|---|---|
| **Visitor journey**, 390 px (`integration-visitor.mjs`) | Home → hero ask → `/ask/`: sources first, the answer, 3 pros, the partner offer (viewable impression, then a click), "שמרו בבית שלי" (snapshot 200). Then the planner (5 steps → result → "שמרו בבית שלי"), onboarding (reveal), the hub (budget from the planner, "תיק הפרויקט שלי" with the question and the estimate), and a booking from the hub (call-back). Result: `BB-26-000091`, score 78, the full file, attribution `partner:<id>`. No console errors |
| **Member journey**, 390 px (`integration-member.mjs`) | Onboarding saved to the account (no draft in the browser) → an answer with the region and stage from the project ("פעילים באזור השרון") → the planner's save makes budget v2 → a prefilled booking: `BB-26-000092`, score 75, `member_id` set, file from the hub snapshot |
| **Staff** (`integration-staff.mjs`) | The consult queue lists both leads by score with their files. חדר הבקרה numbers match the DB (§1.5). Partner health, `/manage/` and `/admin/bonimos/` return 200 at 390 and 1440 with no overflow |
| **Demo path** (`integration-demo-path.mjs`) | 32 screens, phone then laptop: `/platform/`, the tour, all 8 demo views in tour order, the demos index, home, `/calculator/`, `/my-home/`, `/admin/autopilot/` and `/admin/`. All 200, no sideways scroll, no console errors (only analytics beacons aborted when the script closes a page) |
| **RLS suites** | hub 5/5, Bonim.Os 6/6, revenue 7/7 (`HUB_RLS_TEST=1 BONIMOS_RLS_TEST=1 REVENUE_RLS_TEST=1`) |
| **Retrieval** for the 21 hub stage questions | §1.2 |
| **Production build** (`next start -p 3124`) | Every public route on the demo path returns 200. `/admin/` and `/manage/` redirect anonymous visitors to login. The cron returns 401 without its secret. The consult queue reads "לחיצה על שותף: שלד השרון (עסק לדוגמה) · 0 דק׳ לפני הפנייה" |
| **Gates** | lint ✓ (no warnings) · tsc ✓ · vitest ✓ (1,004 passed; 21 opt-in local-stack tests skipped) · build ✓ (115 static pages) |

The demo path's screenshots, phone first, are in the main checkout's gitignored `data/integration/shots/`,
not in the repo. The journey runs themselves happened on 2026-10-15; their screenshots were in a session
scratchpad that has since been removed. Their results are recorded above.

The local fixtures were fictional: a partner "שלד השרון (עסק לדוגמה)" with a campaign and a tier. They
were removed after the checks. The journeys' test data stays on the local stack only:
- two test accounts, `integration-staff@` and `integration-member@bonimbait.test`;
- leads `BB-26-000091` and `BB-26-000092`.

---

## 3. Launch flags

Every pillar is **on by default** in this build. `FLAG_<NAME>=false` switches one off without a code
change. Each flag lists its migrations in `lib/flags.ts` (`migrations`), and a test checks that every
listed file exists.

| Flag (env) | Default | Off means | Migrations it needs |
|---|---|---|---|
| `analytics` (`FLAG_ANALYTICS`) | on | `/api/track` and `trackServer()` store nothing | `20261014102000_foundation_platform_events` |
| `aiAnswers` (`FLAG_AI_ANSWERS`) | on | Kill switch: answers degrade to sources only, and there is no pros classifier | `20261014102100_foundation_guards` |
| `advisor` (`FLAG_ADVISOR`) | **on** | `/ask/` hands the question to `/search/`; shared answers stay up | foundation (102000–102200), `20261014120000_advisor_threads` |
| `hub` (`FLAG_HUB`) | **on** | `/my-home/` redirects to `/account/`, and the save and shortlist buttons hide | foundation, `20261014121000_hub_core`, `121100_hub_storage`, `121200_hub_aggregates` |
| `revenue` (`FLAG_REVENUE`) | **on** | No offers, badges, tier ordering, quote requests, portal stats, consult queue, routing or partner screens. Scoring and the booking sheet stay | foundation, `20261014122000`–`122300` (leads, partners, routing, metrics), **`20261014130500_integration_regional_askers`** |
| `commandCenter` (`FLAG_COMMAND_CENTER`) | **on** | `/admin/` shows the previous dashboard | foundation, `121200_hub_aggregates`, `122000_revenue_leads`, `20261014123000_command_center`, **`20261014130600_integration_question_stats`** |
| `budgetPlanner` (`FLAG_BUDGET_PLANNER`) | **on** | The report's "שלחו לי את הדוח" capture hides; the planner stays | `20261014124000_growth_planner_price_book`, `124100_growth_budget_report_lead` |
| `autopilot` (`FLAG_AUTOPILOT`) | **on** | The YouTube-watch cron skips and the admin entry hides; published videos stay in search and answers | `20261014103000_autopilot_knowledge_store` |
| `bonimos` (`FLAG_BONIMOS`) | **on** | `/manage/` and `/admin/bonimos/` return 404, and the `/my-home/` band hides | foundation, `121000_hub_core`, `121100_hub_storage`, `20261014126000_bonimos_core`, `126100_bonimos_storage` |
| `programmaticSeo` | off | A Won't (PROGRAM.md §3.1). Nothing reads it | — |

Demo views (`/platform/demo/*`) render from fixtures and never need a flag.

---

## 4. Hosted deploy checklist

Hosted Supabase (`nfbasjadvakbsusupcoy`) already has every program migration through
`20261014126100_bonimos_storage`. The orchestrator applies everything below; nobody else touches hosted.

### 4.1 Migrations: two new ones, in this order

| Order | File | What it does | Data change |
|---|---|---|---|
| 1 | `supabase/migrations/20261014130500_integration_regional_askers.sql` | `create or replace revenue_business_metrics()`: the same signature, body and authorization, plus `regional_questions` and `regional_askers`. Grants are restated | None |
| 2 | `supabase/migrations/20261014130600_integration_question_stats.sql` | `create or replace command_question_stats()`: the same signature and columns; out-of-scope answers are not content gaps. Grants are restated | None |

Both are idempotent. They were applied twice locally with no error.

Check after applying (as the service role):

```sql
select public.revenue_business_metrics(
  (select id from businesses where status = 'published' limit 1), now() - interval '30 days', now(), array['שלד']
) ? 'regional_askers';                                   -- true
select count(*) from command_question_stats(now() - interval '30 days', now(), now() - interval '7 days');
```

### 4.2 Environment (Vercel project `bonimbait`, Production)

**Required** (most are already set for parity; check them):

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Every pillar |
| `ANTHROPIC_API_KEY` | Advisor answers, the pros classifier, insights labels, autopilot summaries |
| `OPENAI_API_KEY` | Query embeddings (advisor, search, insights) and autopilot chunk embeddings |
| `NEXT_PUBLIC_SITE_URL` | Absolute links: share URLs, OG images, emails |
| `NEXT_PUBLIC_CALENDLY_URL` | The booking sheet's Calendly step. Without it the sheet is a call-back form |
| `CRON_SECRET` | The YouTube-watch cron. Without it, every cron call gets a 401 |
| `LEAD_IP_SALT` | Hashes IPs for leads, analytics and rate limits. Falls back to the service-role key; set a dedicated value |

**Strongly recommended:** dedicated secrets. Each falls back to the service-role key.

| Variable | Why |
|---|---|
| `ADVISOR_SHARE_SECRET` | Signs shared answers (`/ask/a/<id>/`) |
| `REVENUE_TOKEN_SECRET` | Signs the booking token that marks a Calendly booking |

**Before the pitch link goes out:** set `PITCH_ACCESS_CODE`. With it set, `/platform/*` asks for
`?code=` once. The share link is `https://bonimbait.com/platform/?code=<code>`.

**Optional, with defaults:**

| Variable | Default and note |
|---|---|
| `NEXT_PUBLIC_ADVISOR_NAME` | "שאלו את בונים בית". "שאלו את תומר" waits for the owner's approval |
| `AI_DAILY_BUDGET_USD` | 3 |
| `RATE_LIMIT_AI_ANSWER` | `20/600`. Raise it for a demo behind one office IP |
| `NEXT_PUBLIC_PITCH_CONTACT_WHATSAPP`, `…_EMAIL`, `…_NAME` | The pitch contact CTA; hidden when unset |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | The WhatsApp chat buttons |
| `AUTOPILOT_AUTO_PROCESS` | `false`. Set `true` so new videos are summarised by the cron (never published) |
| `AUTOPILOT_AUTO_PROCESS_LIMIT` | 1 |
| `AUTOPILOT_MAX_USD_PER_VIDEO` | 0.10 |
| `AUTOPILOT_MONTHLY_BUDGET_USD` | 2 |
| `PODCAST_RSS_URL` | Unset |
| `SITE_NOINDEX` | `true` on bonimbait.com until cutover |

**Payments.** The pro portal's tier upsell runs through the site's `PaymentProvider`. A mock checkout on
a Vercel production deployment needs `PAYMENT_PROVIDER=mock` **and**
`PAYMENT_ALLOW_MOCK_IN_PRODUCTION=true`. The provider is global, so that also puts the benefits shop on
mock. Decide this per environment; it's fine on the noindex preview, not after cutover.

### 4.3 Flags

Nothing needs setting: every pillar defaults on. To hold one back, set `FLAG_<NAME>=false`
(`.env.example` lists them all). Make sure no `FLAG_*=false` is left in Vercel from the dark-launch
period.

### 4.4 Cron

`vercel.json` runs `GET /api/cron/youtube-watch` daily at 06:00 UTC (09:00 Israel), which is the Hobby
plan limit. On Pro, `0 */6 * * *` works. It needs `CRON_SECRET` and is skipped while
`FLAG_AUTOPILOT=false`.

### 4.5 Post-deploy smoke (phone first, about $0.04 of AI)

1. `/` shows "278 סרטונים · 90 שעות וידאו · 806 מאמרים". The hero ask goes to `/ask/?q=`.
2. `/ask/?q=כמה עולה שלד לבית של 200 מ״ר ב-2026?`:
   - source cards in about 1 s, then the answer streams;
   - "▶ צפו מ-" plays inline;
   - follow-up chips and the pros card appear;
   - "שמרו בבית שלי" then shows "נשמר בבית שלי";
   - "שתפו בוואטסאפ" works, and the `/ask/a/<id>/` snapshot opens.
3. `/calculator/`: 5 answers, then the result. "שמרו בבית שלי" opens `/my-home/`.
4. `/my-home/start/`: 5 answers, then "המפה האישית שלכם מוכנה". `/my-home/` shows the planner budget,
   and "תיק הפרויקט שלי" shows the question.
5. Book from "תיק הפרויקט שלי": the sheet shows the file. Choose "העדפתי שתחזרו אליי" (a test lead; mark
   it spam afterwards) and note the `BB-…` ref.
6. As staff:
   - `/admin/consult-queue/` shows that ref with its score, file and questions;
   - `/admin/` shows "המסע של הבונים" counting the steps above, and the AI tile shows today's spend;
   - `/admin/partners/`, `/admin/autopilot/` ("בדיקת הערוץ עכשיו") and `/admin/bonimos/` load.
7. `/platform/?code=…`: the tour opens every beat, the 8 demo views each render, and none says "בקרוב".
8. `curl -H "Authorization: Bearer $CRON_SECRET" https://bonimbait.com/api/cron/youtube-watch` returns a
   JSON report. Without the header it returns 401.

**Rollback.** Any pillar can go off with `FLAG_<NAME>=false` and a redeploy. The two migrations only
replace read functions. To revert, re-run the original definitions from `20261014122300_revenue_metrics`
and `20261014123000_command_center`.

---

## 5. Open

- **Local advisor threads aren't imported into the account on sign-in** (advisor "Should"). Members
  keep the threads they asked while signed in. Threads from before sign-in stay in the browser. The
  design: an import endpoint that stores only turns whose share signature verifies, so nobody can put
  words in the advisor's mouth.
- **Directory data.** "ביטוח קבלנים לבונה הפרטי" is listed under קבלני שלד, so it can show among the shell
  pros under an answer. That's the business's own specialty tagging; fix it in the admin.
- **Nested landmarks.** Admin pages render `<main id="admin-main">` inside the root layout's `<main>`
  (pre-existing; for QA and polish).
- **Category archive H1s** keep WordPress names ("שלב מכרז קבלנים") above a stage nav that says
  "היתר/מכרז". This was left for SEO parity; the owner can rename the categories in the admin.

## 6. API spend (integration)

- **Answers.** Two real advisor answers on the local stack (Sonnet 5.5): $0.0195 + $0.0167.
- **Classification.** Two pros classifications (Haiku 4.5): about $0.003.
- **Embeddings.** About 30 dry-run query embeddings: under $0.0001.
- **Total:** about **$0.039** of the $0.20 cap, logged in `API_SPEND.md`.
