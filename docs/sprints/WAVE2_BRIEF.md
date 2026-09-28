# Wave 2 — shared rules for all agents

Read these first: `CLAUDE.md`, `docs/sprints/PARITY_PLAN.md` (especially "Crawl findings"), `docs/ARCHITECTURE_PARITY.md`, `docs/LIVE_SITE_INVENTORY.md`, and your role file in `.claude/skills/`.

## Data
- Crawled live-site data (gitignored, **read-only**) is in the main checkout: `/Users/drorkashi/Projects/bonimbayit/data/migration/`.
  - Files: `posts.json`, `pages.json`, `categories.json`, `tags.json`, `products.json`, `videos.json`, `businesses.json`, `site_structure.json`, `images.json`, `live_urls.json`.
  - Raw HTML is in `raw/` if you need to see how the live site renders something.
- The live site is https://bonimbayit.co.il. You may fetch pages to compare look and behaviour. Be polite (≤2 concurrent requests), and never submit forms on the live site.

## Shared local database
One local Supabase stack runs for **all** agents. It's already started from the main checkout, with the Wave 1 migrations applied.
- API: `http://127.0.0.1:54321`. Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Container: `supabase_db_bonimbait`.
- Keys: run `cd /Users/drorkashi/Projects/bonimbayit && supabase status -o env`, which gives `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`.
- Your worktree has no `apps/web/.env.local`. Create one by copying `/Users/drorkashi/Projects/bonimbayit/apps/web/.env.local`, then add:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (from the local stack)
  - `NEXT_PUBLIC_SITE_URL=http://localhost:<your port>`
  - `PAYMENT_PROVIDER=mock`, `PAYMENT_MOCK_SECRET=dev`
  - `ADMIN_EMAILS=admin@bonimbait.test`
- **Never** run `supabase db reset`, `supabase stop`, or anything that drops or truncates shared tables. Other agents are using the database right now.
- Schema changes:
  - Add a new idempotent SQL file in `supabase/migrations/`, using **only your timestamp range** (below).
  - Apply it with `docker exec -i supabase_db_bonimbait psql -U postgres -v ON_ERROR_STOP=1 < file.sql`.
  - Make it re-runnable (`if not exists`, `create or replace`, `drop policy if exists`), and keep it additive.
- The Migration agent is loading the real crawled content into this DB during this wave.
  - Build against the schema, and test with real rows once they appear.
  - If you need test rows before then, give them slugs starting with `zz-test-` and delete them when you're done.

| Agent | Migration timestamp range | Dev server port |
|---|---|---|
| Content | `20260928130000`–`130099` | 3101 |
| Directory | `20260928130100`–`130199` | 3102 |
| Community & Commerce | `20260928130200`–`130299` | 3103 |
| Leads | `20260928130300`–`130399` | 3104 |
| Migration | `20260928130400`–`130499` | 3105 |

## Routing contract (to avoid conflicts)
- **URLs must match the live site exactly,** trailing slash included. Hebrew slugs arrive percent-encoded; decode and NFC-normalize them before lookup.
- **Root-level `/<slug>/`:** `app/[slug]/page.tsx` is owned by **Content**. It resolves, in this order:
  1. a special page from `lib/special-pages`
  2. a post
  3. a row in `pages`
  4. otherwise 404
- **Special pages at the root with custom behaviour:**
  - If the slug is plain ASCII, you may add a normal `app/<slug>/` route instead (it wins over `[slug]`).
  - Otherwise, register the page in **your own** registry file: `lib/special-pages/{content,directory,commerce,leads}.ts`. Put its component in `components/<your-area>/`.
  - Don't edit other agents' registry files or `lib/special-pages/index.ts`.
- **Header, footer, homepage and `app/sitemap.ts`** are owned by **Content**. Other agents list the nav links and sitemap entries they need in their final report, and the orchestrator wires them in at merge.
- `lib/db/<domain>.ts`: extend only your own domain's module. If you need something from another domain, write a small query in your own module.

## Page ownership
| Owner | Live URLs |
|---|---|
| Content | `/` (homepage), all posts `/<slug>/`, `/blog/`, `/category/<slug>/`, `/author/<slug>/`, `/video/<slug>/` (188 legacy pages; the existing `/video/<youtube-id>` must keep working), `/בונים-בית-tv/`, `/אודותינו/`, `/תקנון-האתר/`, `/מדיניות-פרטיות/`, `/privacy-policy/`, `/search-result/` (→ `/search`), `/landing-page/`, `/project-maman/`, `/aioc-win-a/`, `/aioc-win-b/`, `/blog-test/` (generic render), and 301s from our English `/about/` `/privacy/` `/terms/` to the Hebrew slugs |
| Directory | `/recommended/`, `/business/<slug>/` (158), `/join-us/` (pro registration), `/partner-portal/` and `/partner-portal-2/` (business self-service), `/thank-you-review/` |
| Community & Commerce | `/membership-tiers/`, `/הטבות-לקהילה/`, `/shop/`, `/product/<slug>/`, `/product-category/<slug>/`, `/category-product/<slug>/`, `/cart/`, `/checkout/`, `/thank-you-order/`, member account area |
| Leads | `/צור-קשר/` (and 301 from `/contact/`), `/הצטרפו-לקבוצות-הווטסאפ/`, `/strategic-partners/` and `/strategic-partners/thank-you/`, `/thank-you/`, `/תודה-על-השארת-פרטים/`, `/תודה-על-השארת-פרטים-מוצר/`, the consultation CTA component (Calendly), lead notifications |

## Quality bar
- Hebrew UI, RTL, logical CSS properties, Server Components by default, and the existing design system (`components/`, Tailwind theme).
- Every page needs:
  - `generateMetadata` with a canonical built from `lib/site.ts`
  - the Yoast title/description where the crawl has them
  - `notFound()` for unknown slugs
- Before you finish:
  - `cd apps/web && npm run build && npm run lint` must pass.
  - Run `/Users/drorkashi/Projects/bonimbayit/scripts/.venv/bin/python /Users/drorkashi/Projects/bonimbayit/scripts/migrate/url_parity.py --base http://localhost:<port>` (it has the deps; it overwrites the shared `data/migration/parity_report.csv`, so read your rows right after it runs) against your running server, and report the result for **your** URL types.
- No paid API calls (OpenAI or Anthropic).
- Commit on your branch with conventional commits. Don't push or merge.

## Final report (concise)
- Branch and commits.
- What you built, and parity results for your URL types.
- Migrations added.
- Nav links and sitemap entries you need.
- Anything you couldn't reproduce from public data.
- Open questions.
