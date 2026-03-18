# Plan: Sprint 1 — Infrastructure & Go-Live Foundation

> Source PRD: [Issue #1](https://github.com/triplist-com/bonimbait/issues/1) / [Sprint Issue #2](https://github.com/triplist-com/bonimbait/issues/2)

## Architectural decisions

Durable decisions that apply across all phases:

- **Deployment topology**: Vercel (Next.js frontend) + Render (FastAPI Docker, single service) + Supabase (PostgreSQL 16 + pgvector, existing)
- **Region**: Frankfurt (both Vercel and Render, closest to Israel)
- **Frontend→Backend proxy**: Next.js API routes (`/api/*`) proxy to FastAPI backend via `BACKEND_URL` env var (server-side only, never exposed to client)
- **Database**: Supabase PostgreSQL (existing). No Render-managed DB needed. `DATABASE_URL` uses Supabase connection string with `asyncpg` driver.
- **Response shape mapping**: Next.js proxy routes are responsible for mapping FastAPI response shapes to the frontend's expected types (e.g., UUID category_id → slug strings, adding `channel_name`, computing `costs_count`/`tips_count`)
- **Static JSON fallback**: Remove `apps/web/data/videos.json` dependency entirely. If backend is unreachable, API routes return 503 (no silent fallback to stale data)
- **Environment variables**:
  - Vercel: `BACKEND_URL` (internal, server-only), `NEXT_PUBLIC_SITE_URL`
  - Render: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CORS_ORIGINS`

---

## Phase 1: Deploy FastAPI on Render + verify DB connectivity

**User stories**: #28 (live database), #29 (sub-second response)

### What to build

Deploy the existing FastAPI app (`apps/api/`) as a Docker web service on Render. Point it at the existing Supabase PostgreSQL. Verify the `/health` endpoint confirms DB connectivity, pgvector extension, and video/segment/embedding counts.

Key changes:
- Update `render.yaml` to contain only the API service (remove frontend and database blocks since those stay on Vercel/Supabase)
- Update `DATABASE_URL` format: Supabase provides `postgresql://` but FastAPI needs `postgresql+asyncpg://` — handle the rewrite in config
- Ensure `alembic upgrade head` runs on first deploy (or manually)
- Verify pgvector extension is enabled on Supabase (`CREATE EXTENSION IF NOT EXISTS vector;`)

### Acceptance criteria

- [ ] FastAPI is live on `https://bonimbait-api.onrender.com` (or similar)
- [ ] `GET /health` returns 200 with DB connected, pgvector enabled, video count > 0
- [ ] `GET /api/videos` returns paginated videos from Supabase
- [ ] `GET /api/categories` returns categories with video counts
- [ ] `GET /api/search?q=יסוד` returns hybrid search results
- [ ] `GET /api/search/suggest?q=בני` returns autocomplete suggestions
- [ ] `render.yaml` contains only the API service

---

## Phase 2: Generate missing embeddings + verify semantic search

**User stories**: #28 (live database), #29 (sub-second response)

### What to build

Currently only ~50 videos have embeddings. The remaining ~130 videos with segments need embeddings generated. Run the embedding pipeline script for the missing videos (~$0.07 cost). Verify that semantic search works end-to-end on the live API.

Key changes:
- Run `scripts/embed/run.py` for videos that don't yet have embeddings
- Verify embeddings are loaded into Supabase `embeddings` table
- Test hybrid search (semantic + FTS) returns better results than FTS alone
- Confirm the cosine distance operator (`<=>`) works on Supabase pgvector

### Acceptance criteria

- [ ] All ~180 videos with segments have embeddings in the database
- [ ] `GET /api/search?q=כמה עולה יסוד` returns semantically relevant results (not just keyword matches)
- [ ] Embedding generation cost stayed under $1
- [ ] Embedding count in `/health` matches segment count

---

## Phase 3: Convert Next.js API routes to backend proxies

**User stories**: #28 (live database), #29 (sub-second response)

### What to build

Replace every Next.js API route that currently imports from `_lib/data.ts` (static JSON) with a thin proxy to the FastAPI backend. Each proxy route fetches from `BACKEND_URL`, maps the response shape to what the frontend components expect, and returns it.

Routes to convert:
1. `/api/search` — proxy to `BACKEND_URL/api/search`, map `SearchResultItem` → frontend `SearchResult` shape (add `channel_name`, map `category_id` UUID to slug)
2. `/api/videos` — proxy to `BACKEND_URL/api/videos`, map `VideoSummary` → frontend `Video` shape (add `channel_name`, `costs_count`, `tips_count`)
3. `/api/videos/[id]` — proxy to `BACKEND_URL/api/videos/{id}`, map `VideoDetail` → frontend `VideoDetail` shape
4. `/api/categories` — proxy to `BACKEND_URL/api/categories`, map `CategoryResponse` → frontend `Category` shape (UUID id → slug as id)
5. `/api/suggestions` — proxy to `BACKEND_URL/api/search/suggest`
6. `/api/health` — proxy to `BACKEND_URL/health`

Keep `BACKEND_URL` as a server-side env var (no `NEXT_PUBLIC_` prefix) — it should never leak to the client.

Delete or deprecate `apps/web/app/api/_lib/data.ts` and the static `apps/web/data/videos.json` dependency.

### Acceptance criteria

- [ ] All 6 Next.js API routes proxy to FastAPI backend
- [ ] No imports from `_lib/data.ts` remain in any API route
- [ ] Response shapes match what frontend components expect (no client-side errors)
- [ ] `BACKEND_URL` is server-side only (not in client bundle)
- [ ] Error handling: if backend returns 4xx/5xx, proxy returns appropriate error to client
- [ ] Homepage loads with real data from Supabase (videos, categories)
- [ ] Search works end-to-end: type query → see results from live DB
- [ ] Video detail page loads with segments, key points, costs from live DB
- [ ] Category page loads with filtered videos from live DB

---

## Phase 4: Deploy to Vercel + smoke tests + DNS prep

**User stories**: #28, #29, #30 (graceful degradation)

### What to build

Deploy the updated Next.js frontend to Vercel with `BACKEND_URL` pointing to the Render API. Run smoke tests across all pages. Prepare DNS records for GoDaddy cutover.

Key changes:
- Add `BACKEND_URL` env var in Vercel dashboard (server-side)
- Verify `NEXT_PUBLIC_SITE_URL=https://bonimbait.com`
- Test all pages: homepage, search, video detail, categories, about, contact
- Test edge cases: empty search, invalid video ID, missing category
- Document GoDaddy DNS records needed (CNAME for Vercel)
- Verify CORS on Render API allows requests from bonimbait.com

### Acceptance criteria

- [ ] bonimbait.com serves live data from Supabase via Vercel → Render → Supabase
- [ ] All pages render correctly with no console errors
- [ ] Search returns results from live hybrid search
- [ ] Video detail pages show segments, key points, and costs
- [ ] 404 pages work for invalid video IDs
- [ ] DNS records documented and ready for cutover
- [ ] CORS configured: Render API accepts requests from bonimbait.com and localhost
- [ ] No references to static JSON remain in production build
