# Sprint Progress Tracker

## All Sprints Complete!
## Status: Ready for Data Pipeline Run & Deployment

---

| Sprint | Name | Status | Started | Completed |
|--------|------|--------|---------|-----------|
| 0 | Project Bootstrap & Infrastructure | Done | 2026-03-14 | 2026-03-14 |
| 1 | Data Pipeline — Extraction & Transcription | Done | 2026-03-14 | 2026-03-14 |
| 2 | Data Pipeline — Summarization & Categorization | Done | 2026-03-15 | 2026-03-15 |
| 3 | Data Pipeline — Embeddings & DB Loading | Done | 2026-03-15 | 2026-03-15 |
| 4 | Backend API — Search & Video Endpoints | Done | 2026-03-15 | 2026-03-15 |
| 5 | AI Answer Generation | Done | 2026-03-15 | 2026-03-15 |
| 6 | Frontend — Design System & Layout | Done | 2026-03-15 | 2026-03-15 |
| 7 | Frontend — Pages & API Integration | Done | 2026-03-15 | 2026-03-15 |
| 8 | Polish, SEO & Performance | Done | 2026-03-15 | 2026-03-15 |
| 9 | Deployment & Launch | Done | 2026-03-15 | 2026-03-15 |

## Notes
- Sprints 1-3 (data pipeline) can partially overlap with Sprints 6-7 (frontend) since they're independent
- Sprint 4-5 (backend API) blocks Sprint 7 (frontend integration)
- Each sprint targets one Opus 4.6 context window of productive work

---

## Parity program (see PARITY_PLAN.md)

| Wave | Scope | Status | Date |
|---|---|---|---|
| 1 | Foundation (schema, auth, payments interface) + live-site crawl | Done | 2026-09-28 |
| 2 | Content, Directory, Community & Commerce, Leads, data load | Done | 2026-09-28 |
| 3 | Admin CMS, posts in AI search, answer CTAs (done); QA (open) | In progress | |
| 4 | Cutover to bonimbayit.co.il | Not started | |

**URL parity after Wave 2:** 1214/1214 pass against a local build (1203 × 200; the rest redirect as live or are listed in `scripts/migrate/parity_exceptions.json`).
**Open:** hosted Supabase project (the old one is gone), UPay credentials + docs, Resend key + lead inbox address, product-data ownership fix (loader vs commerce migration).

**2026-09-29: new app live on bonimbait.com** (PR #16, merge `68cd819`). Hosted Supabase `nfbasjadvakbsusupcoy` is migrated and loaded. URL parity is 1214/1214 against https://bonimbait.com.
- `SITE_NOINDEX=true` keeps bonimbait.com out of search until the cutover to bonimbayit.co.il.
- Mock payments are refused on production, so online purchase stays hidden until UPay is configured.
- Rollback target, if needed: the previous production deployment `bonimbait-5jtax0zqs`.

**2026-09-30: posts in AI search + answer CTAs** (branch `feature/posts-index-ctas`).
- `scripts/build_posts_index.py` chunks the 806 published posts (5,233 chunks, ~1.5k chars each) into `apps/web/data/posts-index.*`. Embedding cost $0.14. Re-run it after content edits; unchanged chunks are cached in `data/processed/post_embeddings.json`.
- AI answers draw on videos and articles (at most 3 of the 5 sources are articles) and cite both.
- Every answer shows a free-consultation CTA. A classifier (`claude-haiku-4-5`, temperature 0, ~$0.001 per question) picks the directory specialty the question is about, and the answer lists up to 3 published pros in it.

---

## Platform program (see docs/platform/PROGRAM.md)

The goal is to make bonimbait.com a platform the owner of bonimbayit.co.il will want to buy. Integration branch: `feature/platform`.

| Wave | Squads | Status | Date |
|---|---|---|---|
| A | strategy, design, knowledge, foundation, autopilot | Done, merged | 2026-10-15 |
| B | advisor, hub, revenue, growth, command, pitch | Done, merged | 2026-10-15 |
| C | integration, bonimos (P7), qa, polish | In progress | |

**Wave A and B outcomes:**
- **Brand and speed:** owner-brand design system. Mobile LCP is about 1.7s with applied throttling, against 4.1s on bonimbayit.co.il.
- **Coverage:** transcripts for 278 of 951 long-form videos (89.8 h); all 951 are searchable. The 673 uncaptioned videos have no YouTube language set, which the owner can fix himself.
- **Advisor (`/ask/`):** sources first, plays the exact moment, Sonnet 5.5, about $0.018 an answer.
- **הבית שלי:** onboarding plus a 7-stage roadmap, budget, documents and the project file.
- **Revenue engine:** a scored project file on every lead, a consult booking sheet, a consult queue, routing rules, and partner tiers, portal and report.
- **Budget planner:** in-process on the owner's 2026 numbers. The production 502 is fixed.
- **חדר הבקרה:** owner dashboard, with the next videos to shoot drawn from builders' unanswered questions.
- **Content Autopilot:** runtime knowledge store, YouTube RSS watcher, ingest pipeline, about $0.002 a video.
- **Pitch:** `/platform/` pitch site, `/platform/tour/` guided tour, and demo views at `/platform/demo/*`.

**Hosted DB:** the Wave A and B migrations through `20261014124100` are applied to `nfbasjadvakbsusupcoy`. Backups are in `data/backups/remote-20261015*`.

**API spend:** see `docs/platform/API_SPEND.md` (program cap $5).
