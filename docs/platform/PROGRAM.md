# Bonim Bait Platform Program

Charter for the team that turns bonimbait.com from a WordPress rebuild into a platform the owner of
bonimbayit.co.il will want to buy. Every agent reads this file first. The orchestrator (the main
Claude session) owns it, the integration branch `feature/platform`, all merges, and every action on
hosted infrastructure.

> **The repo is PUBLIC** (`triplist-com/bonimbait`). Never commit secrets, passwords, personal data,
> or sales material (pricing, offers, negotiation notes, owner analysis). Sales material lives in
> `/Users/drorkashi/Projects/bonimbayit/sales/` (gitignored, main checkout only).

## 1. Mission

At the end of the program, bonimbait.com is ready to sell:
- It runs a platform with the owner's brand and content.
- It looks and feels premium on mobile and desktop.
- It has clear differentiators the owner can't get from WordPress or an agency.
- It comes with a sales kit that answers "why switch, why now, what's the risk".

## 2. Where we start (facts, 2026-10-14)

- **Parity is done.** The app runs every bonimbayit.co.il feature (PR #16): 806 posts, 188 legacy video pages, 158 businesses, 240 reviews, the benefits shop, service plans, leads, auth, and a Hebrew admin CMS. URL parity is 1214/1214.
- **Production:** bonimbait.com (noindex). Vercel project `bonimbait`; hosted Supabase `nfbasjadvakbsusupcoy`.
- **AI search and answers:** served in-process from static indexes (`apps/web/data/*-index.*`).
  - 179 videos (1,200 segments) plus 5,233 post chunks.
  - Answers come from Claude via SSE, with a pros CTA from a Haiku classifier.
  - See the auto-memory note on search architecture and `app/api/_lib/semantic.ts`.
- **Gaps we saw on the live site:**
  - The design is a generic blue/amber Tailwind template, not the owner's magenta brand.
  - The hero video (`/promo.mp4`) fails to load, so the hero shows a black box.
  - On mobile, the floating consultation pill covers the main CTA.
  - The AI answer on `/search` is a one-liner with raw `**` markdown.
  - Only about 200 of the channel's ~900 videos are indexed.
  - There are no logged-in experiences beyond orders, and no analytics.
- **The owner's business, from the public site.** The site is a funnel into:
  - Construction-management plans: ₪6,900 / ₪29,000 / ₪133–149k.
  - The free budget consultation (Calendly).
  - Paid pro listings ("נבחרת המומלצים"). The phone is lead-gated, and leads go to info@ for 134 of the 158 businesses.
  - Strategic-partner lead campaigns ("200 לידים. 50 סגירות. חודשיים.").
  - The partner benefits shop.
  - A WhatsApp community, the podcast (112 episodes) and YouTube.
- **Prior thinking:**
  - `docs/PRODUCT_DEFINITION.md` (untracked, main checkout).
  - The deck `בונים בית 2.0 - מצגת מוצר.pptx` (main checkout root): an AI knowledge engine plus a contractor marketplace.

## 3. Product hypothesis: the platform

The Strategy squad validates, sharpens or overturns this hypothesis in `sales/STRATEGY.md`. Builders
design for it unless the orchestrator updates this section.

**One line:** an operating system for building a private home in Israel. It turns the owner's
900 videos, 112 podcasts and 800 articles into an AI advisor and a personal build journey. Every
interaction becomes a qualified, routed, measurable lead for the owner's services, pros and partners.

| # | Pillar | What it is | Why the owner pays |
|---|---|---|---|
| P1 | **AI Advisor** | Multi-turn Hebrew advisor on every page. Answers are grounded in the owner's videos, podcasts and articles, and play the exact video moment. It suggests follow-ups and has lead moments built in. | Built on the one asset competitors can't copy. It turns traffic into intent signals. |
| P2 | **הבית שלי (Builder Hub)** | A free personal workspace for the build. It holds the project profile (region, stage, size, budget, timeline), a 14-stage roadmap with curated content and checklists, a budget tracker, saved items, a pro shortlist and documents. | Builders come back for 1–3 years instead of visiting once. The owner gets segmented first-party data, and that data is what makes leads valuable. |
| P3 | **Revenue Engine** | Leads arrive enriched (stage, region, budget, size, what they asked), scored and routed. The pro portal shows ROI (views, reveals, leads) and paid tiers. Strategic-partner campaigns get dashboards. | It makes the business measurable and lets the owner charge more, and prove it. |
| P4 | **Owner Command Center** | One dashboard for the funnel, leads, pipeline value and revenue. It shows what builders are asking, which questions go unanswered (the next videos to shoot), and content and partner performance. | The owner knows the market better than anyone, and stops guessing. |
| P5 | **Content Autopilot** | A new YouTube video or podcast is detected, transcribed, summarised, indexed and published automatically, with admin approval. | "Keep filming; the platform does the rest." |
| P6 | **Growth Engine** | A budget planner as the lead magnet, feeding the ₪6,900 plan and the free consultation. Plus programmatic SEO (specialty × region), and video key moments and FAQ rich results. | More organic traffic and more consultations booked. |
| F | **Foundation** | Owner-brand design system, speed, URL parity, Hebrew admin, analytics, security. | Zero-risk switch, no WordPress/Elementor/Zapier upkeep. |

## 4. Team and waves

The orchestrator runs each wave's agents in parallel. A wave starts after the previous wave is
merged into `feature/platform` and passes the gates.

| Wave | Squad (agent) | Owns | Dev port |
|---|---|---|---|
| A | `strategy`: Product Strategist + Market Researcher | `sales/STRATEGY.md`, `sales/RESEARCH.md` (no code) | — |
| A | `design`: Design Lead (UX + FE) | Design system, tokens, `components/ui/*`, header/nav/footer, homepage, `docs/platform/DESIGN_SYSTEM.md` | 3101 |
| A | `knowledge`: Data Engineer (NLP) | Full-channel inventory, captions, segment embeddings, static index rebuild, video metadata for new videos | 3102 |
| A | `foundation`: Platform Architect | Analytics events + `track()`, demo-view framework, roles, admin/site nav configs, shared conventions | 3103 |
| A | `autopilot`: Pipeline Engineer | Runtime knowledge store (pgvector delta), fusion in `semantic.ts`, YouTube watcher, ingest pipeline, `/admin/autopilot/` | 3104 |
| B | `advisor` | P1 | 3111 |
| B | `hub` | P2 | 3112 |
| B | `revenue` | P3 | 3113 |
| B | `command` | P4 | 3114 |
| B | `growth` | P6 | 3115 |
| B | `pitch`: Sales Experience | `/platform/` pitch site + guided demo tour; sales kit in `sales/` | 3116 |
| C | `qa` | E2E, parity, Lighthouse, a11y, security, cost guard | 3121 |
| C | `polish` | Cross-site visual consistency pass, the "wow" details | 3122 |

## 5. Rules of engagement (all squads)

### Git
- Work only in your worktree, on branch `feature/platform-<squad>` created from `feature/platform`.
- Commit early and often (conventional commits, English).
- **Never** push, merge, rebase other branches, or touch `main`. The orchestrator integrates.

### Environment
- Copy the shared env file into your worktree:
  `cp /private/tmp/claude-501/-Users-drorkashi-Projects-bonimbayit/08edb13f-7db1-4836-bb5d-89ddf44939ec/scratchpad/platform.env.local <worktree>/apps/web/.env.local`
  Then set `NEXT_PUBLIC_SITE_URL=http://localhost:<your port>`.
- Run `cd apps/web && npm ci` in your worktree. `node_modules` isn't shared.
- Start your server with `npx next dev -p <your port>`. Use only your port, and stop your servers before you finish.

### Database
- Use the **local Supabase only**: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. It holds the full migrated dataset.
- `psql` isn't installed on the host. Use `docker exec -i supabase_db_bonimbait psql -U postgres -v ON_ERROR_STOP=1 < file.sql`.
- **Never** connect to the hosted project (`nfbasjadvakbsusupcoy`, `*.pooler.supabase.com`, `SUPABASE_URL` in the root `.env`). The orchestrator applies migrations there after review.
- Migrations go in `supabase/migrations/<timestamp>_<squad>_<name>.sql`, inside your slot (§6).
  - They must be idempotent (`if not exists`, `create or replace`, `drop … if exists`).
  - RLS goes on every new table, with explicit policies.
  - Money is stored as integer agorot, timestamps as `timestamptz`, primary keys as UUIDs.
- Put new TypeScript types in your own module, e.g. `lib/<squad>/types.ts`. Don't grow the shared `lib/db/types.ts` unless it's unavoidable.

### API budget
- The program cap is **$5.00** of new paid API spend across all squads. The project cap is $20 lifetime, and part of it is already spent.
- Per-squad caps:

  | Squad | Cap |
  |---|---|
  | knowledge | $1.50 |
  | advisor | $1.00 |
  | autopilot | $0.75 |
  | command | $0.50 |
  | everyone else | $0.20 |

- Estimate before any paid batch. Use mocks and fixtures in tests. Never loop paid calls.
- Log each paid run in `docs/platform/API_SPEND.md`: date, squad, what, tokens/minutes, $.

### Data and privacy
- No personal data in fixtures, commits or screenshots you keep. Demo people are fictional.
- Use test accounts on the local stack only, with the `@bonimbait.test` domain. Store their passwords only in gitignored files, e.g. your `.env.local` or `/data/…`.

### Code
- Follow `CLAUDE.md` conventions:
  - Hebrew UI, English comments.
  - RTL logical properties.
  - Server Components by default.
  - TypeScript strict.
- After Wave A, use the design system (`components/ui/*`, tokens). No new hard-coded colours.

### Hebrew copy
- Write natural Israeli Hebrew, with no translated feel.
- Use the plural imperative the live site uses ("שאלו", "הצטרפו", "בונים").
- Keep numbers LTR inside RTL text.

### Accessibility
- Target WCAG 2.1 AA (IS 5568): keyboard and focus states, contrast, labels, `prefers-reduced-motion`.

### Shared files
- Edit another squad's files only for minimal hooks, such as a nav entry or a button slot.
- List every such edit in your report.

### Dependencies
- Keep additions minimal and pinned, and list them in your report. The orchestrator regenerates the lockfile at merge.

### Quality gates (before you report)
- These must pass in your worktree's `apps/web`:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm test`
  - `npm run build`
- New logic has unit tests (vitest).
- Look at every new or changed page.
  - Take desktop (1440) and mobile (390) screenshots with `node /private/tmp/claude-501/-Users-drorkashi-Projects-bonimbayit/08edb13f-7db1-4836-bb5d-89ddf44939ec/scratchpad/pw/shot.mjs <url> <out.png> [--mobile] [--full] [--wait=sel] [--delay=ms] [--click=sel]`.
  - Read the PNGs and fix what looks wrong.
  - The helper also prints console errors and failed requests.

### Report (your final message)
1. What you built, and the demo path (URLs).
2. Branch name and commits.
3. Migrations, and the env vars you need.
4. Shared-file edits.
5. New dependencies.
6. Tests and gate results.
7. Screenshot paths.
8. API spend.
9. Known gaps.

## 6. Shared conventions

### Migration slots
Use timestamps inside your range.

| Squad | Slot |
|---|---|
| knowledge | `20261014101000`–`20261014101959` |
| foundation | `20261014102000`–`20261014102959` |
| autopilot | `20261014103000`–`20261014103959` |
| advisor | `20261014120000`–`20261014120959` |
| hub | `20261014121000`–`20261014121959` |
| revenue | `20261014122000`–`20261014122959` |
| command | `20261014123000`–`20261014123959` |
| growth | `20261014124000`–`20261014124959` |
| pitch | `20261014125000`–`20261014125959` |
| qa / polish | `20261014130000`+ |

### Analytics (from foundation)
- Use `track(name, props)` on the client and `trackServer(name, props)` on the server.
- Event names live in one catalog. Don't invent names ad hoc; add them to the catalog.

### Demo views (from foundation)
- Every Wave B squad ships `/platform/demo/<squad>/`. It renders the squad's real UI from fixtures in `lib/demo/fixtures/<squad>.ts`.
- No auth, noindex, and a visible "תצוגת הדגמה · נתונים לדוגמה" banner.
- The sales tour uses these views, so it never depends on real data or logins. Real features still work end to end with real auth and RLS.

### Navigation
- Site and admin navigation are config-driven: `lib/nav.ts` and `lib/admin/nav.ts`, created in Wave A.
- To add an entry, add one config line.

### Owner brand
- The owner's brand is magenta (≈ `#E6195B`; the live Calendly embed uses `#fc3565`), black and white, with photos of Tomer and podcast art.
- The design squad defines the exact system. Everyone else uses its tokens.

## 7. Definition of done: "ready to sell"

1. bonimbait.com runs the platform in the owner's brand. It's fast and polished, and perfect on mobile.
2. **AI Advisor:** multi-turn, plays exact video moments, cites articles, suggests follow-ups, and offers lead moments. It covers as much of the channel as free captions allow.
3. **Builder Hub:** works end to end for a real signup: onboarding → roadmap → budget → saved items → pros.
4. **Revenue Engine:**
   - Leads are enriched, scored and routed.
   - The pro portal has stats and tiers (mock payments).
   - Partner campaigns have measurable results.
5. **Command Center:** shows real numbers, plus a demo mode with realistic data.
6. **Content Autopilot:** takes a new video end to end, from detection to an indexed, published page.
7. **Budget planner:** produces a professional estimate report that leads into the consultation and the ₪6,900 plan.
8. **No regressions:** URL parity stays 1214/1214, all tests pass, and Lighthouse scores ≥ 90 for SEO, a11y and best practices on key pages (performance ≥ 85 on mobile).
9. **Sales kit:**
   - `/platform/` pitch site and guided demo tour.
   - `sales/` (private): strategy, research, demo script, deck, ROI model and offer options.
10. **Security and cost:** RLS reviewed on every new table, rate limits and cost guards on AI routes, and API spend within cap.
