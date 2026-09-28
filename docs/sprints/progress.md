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
| 3 | Admin CMS (done); search index for posts, CTA integration, QA (open) | In progress | |
| 4 | Cutover to bonimbayit.co.il | Not started | |

**URL parity after Wave 2:** 1214/1214 pass against a local build (1203 × 200; the rest redirect as live or are listed in `scripts/migrate/parity_exceptions.json`).
**Open:** hosted Supabase project (the old one is gone), UPay credentials + docs, Resend key + lead inbox address, product-data ownership fix (loader vs commerce migration).

**2026-09-29: new app live on bonimbait.com** (PR #16, merge `68cd819`). Hosted Supabase `nfbasjadvakbsusupcoy` is migrated and loaded. URL parity is 1214/1214 against https://bonimbait.com.
- `SITE_NOINDEX=true` keeps bonimbait.com out of search until the cutover to bonimbayit.co.il.
- Mock payments are refused on production, so online purchase stays hidden until UPay is configured.
- Rollback target, if needed: the previous production deployment `bonimbait-5jtax0zqs`.
