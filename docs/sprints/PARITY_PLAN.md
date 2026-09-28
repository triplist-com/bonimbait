# Parity Plan — rebuild bonimbayit.co.il in the new app

Goal: every capability of the live WordPress site bonimbayit.co.il works in the new Next.js app, so the domain can move to it without losing Google rankings.

- **Staging URL:** bonimbait.com (temporary).
- **Final URL:** bonimbayit.co.il, after cutover (Wave 4).

## Decisions (2026-09-28)

| Topic | Decision |
|---|---|
| Content management | Custom admin inside `apps/web`; Supabase (Postgres + Auth + Storage) is the single store. WordPress is retired after cutover. |
| Payments | UPay — the gateway the live WooCommerce checkout uses (`payment_method_upay`). Merchant credentials come from the site owner. Build against a `PaymentProvider` interface with a sandbox/mock implementation until then. |
| Data migration | Public data only (no WP admin). Posts, pages and products come from the public REST API; videos and businesses are crawled from sitemaps. Members re-register at launch. Reviews are migrated only where they're publicly rendered. |
| Canonical host | Never hard-code a domain. Everything reads `NEXT_PUBLIC_SITE_URL`. |
| Backend | Next.js route handlers + Supabase. The FastAPI app (`apps/api`) is not used for new features. |
| Budget | API spend stays within the project's $20 cap. Crawling is free; embedding ~800 posts costs about $0.05. No LLM rewriting of migrated content. |

## Live-site inventory (what "parity" means)

Measured from the sitemaps and the REST API on 2026-09-28:

| Capability | Live site | Count |
|---|---|---|
| Articles / guides | `/<slug>/` posts in 14 stage categories (`/category/<slug>/`), `/blog/` | 804 |
| Videos + podcast episodes | `/video/<slug>/` (Hebrew slugs) | 189 |
| Recommended professionals ("נבחרת המומלצים") | `/recommended/` plus business pages with reviews and galleries | 159 |
| Join as a professional + business self-service portal | `/join-us/`, `partner-portal` ("ניהול העסק") | — |
| Membership tiers | `/membership-tiers/`, paid via UPay | — |
| Benefits shop ("חנות ההטבות") | WooCommerce `/shop/`, `/product/<slug>/`, `/checkout/` | 3 products |
| Events / conferences | `/events/` | — |
| Community | Signup with construction stage + region (14 regions), WhatsApp groups page | — |
| Lead capture | Free budget-consultation CTA and modals, contact form, "advertise with us", strategic-partners page | — |
| Construction management service | "ניהול הבנייה" / "בונים בית עד מפתח" sales pages | — |
| Static pages | About, contact, terms, privacy, site rules, … | 30 |
| Auth | Email + Google login (members and business owners) | — |
| SEO | Yoast meta + sitemaps, Redirection plugin, schema | ~1,200 URLs |
| Internal tools (not user-facing) | `bb-social` social-media campaign scheduler, `bb-imgrev`, `bonim/v1/stats`, Zapier | — |

### Crawl findings (Wave 1, 2026-09-28) — these override the table above
Full detail is in `docs/LIVE_SITE_INVENTORY.md`; the data is in `data/migration/`.

**Parity baseline:** 1,214 live URLs. `url_parity.py` passes a URL if it returns 200 or redirects the same way live does. Recreate the 10 live redirects in `redirects`:
- 7 × 301: 3 posts, 3 videos, 1 thank-you page.
- 3 × 302: checkout → cart; the two partner-portal pages → login.

**Videos:**
- 188 live video pages. Only **37** match our 179 indexed videos, and 144 of our indexed videos have no live page.
- Legacy video pages must render from crawled data (title, YouTube embed, body, SEO meta), whether or not the video is indexed.
- Our extra videos keep their `/video/<youtube-id>` pages.

**Businesses:**
- 158 businesses, 91 specialties.
- 240 reviews across 49 businesses.
- No public tier markers; listing order is the only ranking.
- **The phone number is gated behind a lead popup.** That's the lead-gen model: leads go to info@ for 134 businesses and straight to the business for the rest. Keep that gating and don't expose phones publicly.

**Membership tiers are public:** these are construction-management service plans, not site memberships. Prices exclude VAT:
- בונים תקציב: ₪6,900
- בונים בית פלוס: ₪29,000
- בונים בית עד מפתח: ₪133,000 up to 180 m², ₪149,000 above

A 12-row comparison table is also captured.

**Consultation:** a Calendly embed (`tzuri-galili-bonimbayit/demo45min`), not a form. Reuse `NEXT_PUBLIC_CALENDLY_URL`.

**Events:** there's no events page (`/events/` redirects home). Events are 8 posts in the category "כנסים ולייבים". An events feature is **not needed for parity**, so it's dropped from Leads & Events.

**Regions:** the site uses four inconsistent lists (directory 14 incl. "כל הארץ", signup 13, lead forms 14, WhatsApp 11 areas with invite links). The Architect seeds one master list and maps the others to it.

**Signup:** email or Google, 13 regions, construction stage, newsletter opt-in, reCAPTCHA and SMS phone verification. SMS verification is deferred; it needs an SMS provider.

**WhatsApp join form:** posts to Zapier, then reveals the regional invite link. Rebuild it as a lead plus the invite-link reveal.

**Images:** 7,539 unique URLs, about 4,250 of them on blogspot. Keep blogspot images hot-linked; move only `bonimbayit.co.il/wp-content` images to Storage, since those die at cutover.

**Out of scope for parity (confirm with owner):** the `bb-social` campaign automation and `bb-imgrev`. These are internal marketing tools, not site features. Zapier hooks are replaced by webhooks from the lead system.

**New app already has (keep):** AI search and answers with video timestamps, the cost wizard, 20 calculator pages, and category pages.

## URL rules

1. Every URL listed in the live site's sitemaps must return 200 on the new app at the **same path**, or 301 to its new home. `scripts/migrate/url_parity.py` checks this and must pass before cutover.
2. Posts stay at `/<slug>/` (root-level catch-all, resolved against the posts table after all fixed routes).
3. Old videos keep `/video/<hebrew-slug>/`. The new app's `/video/[id]` (YouTube ID) route must accept both: if the param is a known old slug, render that video; YouTube-ID URLs keep working.
4. Trailing slashes must match WordPress (`trailingSlash: true`), or be handled by a consistent 301.
5. Hebrew slugs are stored decoded and served percent-encoded — test both forms.

## Team

The orchestrator (the main Claude session) owns the plan, integration, merges and `docs/sprints/progress.md`. Each workstream is one agent, working in its own git worktree on a `feature/parity-*` branch. Agents read their role file in `.claude/skills/` plus this plan.

| Agent | Role file | Owns |
|---|---|---|
| Architect | `architect.md` | Supabase schema + migrations, auth and roles, data-access layer, `PaymentProvider` interface, route map |
| Migration | `data-pipeline.md` | Crawlers, content import, image transfer to Supabase Storage, URL parity checker, search-index extension |
| Content | `frontend.md` | Articles, blog, stage categories, old-slug video pages, static pages, SEO meta/schema/sitemaps |
| Directory | `frontend.md` + `backend.md` | Recommended pros, business pages, reviews, search by specialty/region, join-as-pro, business portal |
| Community & Commerce | `backend.md` | Member signup/login, profile (stage + region), membership tiers, shop, checkout via UPay, orders |
| Leads & Events | `backend.md` | Consultation booking, contact/advertise/partner forms, lead inbox + email/WhatsApp notifications, events |
| Admin | `frontend.md` | Admin CMS: posts (rich text editor), videos, businesses, reviews moderation, products, orders, members, leads, events |
| QA | `qa.md` | Parity checklist, E2E flows, Lighthouse, RTL and accessibility review, cutover rehearsal |

## Waves

Each wave's agents run in parallel. A wave starts only after the previous wave is merged to `main`.

### Wave 1 — Foundation
- **Architect:** Supabase client in `apps/web` (`@supabase/supabase-js` + `@supabase/ssr`); SQL migrations under `supabase/migrations/`.
  - Tables: posts, post_categories, pages, videos (with `legacy_slug`), businesses, business_categories, regions, reviews, members/profiles (role: member/pro/editor/admin), products, orders, memberships, events, leads, redirects.
  - Row-level security policies.
  - Supabase Auth (email + Google), replacing the admin-only NextAuth.
  - Typed data-access modules in `apps/web/lib/db/`.
  - `PaymentProvider` interface + mock provider.
  - Replace all hard-coded `bonimbait.com` with `NEXT_PUBLIC_SITE_URL`.
- **Migration:** crawlers in `scripts/migrate/`.
  - REST export of posts (content, categories, featured images, Yoast meta), pages and products.
  - Sitemap crawl of videos and businesses (profile fields, gallery, reviews, specialty, region).
  - Output normalized JSON to `data/migration/`.
  - `url_parity.py`, which takes every sitemap URL and checks a target base URL.
  - Nothing is written to the DB in this wave — schema isn't merged yet.

### Wave 2 — Features
- **Migration:** loader that imports `data/migration/` into Supabase and uploads images to Storage.
- **Content, Directory, Community & Commerce, Leads & Events:** build their public features on the Wave 1 schema.

### Wave 3 — Admin + integration
- **Admin:** CMS for everything above.
- **Migration:** add the 804 posts to the AI search index, so answers cite articles and videos.
- **Leads & Events:** CTAs wired into AI answers (consultation, matching pros by the question's specialty).
- **QA:** full parity pass.

### Wave 4 — Cutover
Owner actions are marked **(owner)**.
1. Freeze content on WordPress **(owner)**.
2. Re-run the crawl + import.
3. `url_parity.py` must be 100% green against staging.
4. Configure UPay production keys **(owner)**.
5. Point the bonimbayit.co.il DNS to Vercel **(owner)**.
6. Set `NEXT_PUBLIC_SITE_URL` to the new domain.
7. Submit the sitemaps in Search Console **(owner)**.
8. Make bonimbait.com 301 to bonimbayit.co.il.
9. Keep WordPress read-only for 30 days as a fallback.

## Blockers needing the owner
- UPay merchant credentials and terminal settings (needed before real payments; mock until then).
- Supabase project for the new data (URL, anon key, service-role key). The existing project from `project_infrastructure` can be reused.
- Professional-listing prices (what pros pay to be in "נבחרת המומלצים"). Service-plan prices are public and already captured.
- Should the 3 service plans be bought online via UPay, or stay "book a consultation"? (₪133k checkout online is unusual.)
- Email sender (e.g. Resend) and WhatsApp number for lead notifications.
- Originals of 41 files that are already dead on the live site. `verify_load.py` lists them. They're mostly 2018–2019 images, plus the plasterer contract (`/tich/`) and the smart-home cheat sheet (`/מילון-מושגים-בית-חכם-להורדה/`). Their links were dropped during migration.
- Nice-to-have: Hebrew-named PDFs download as hashed ASCII names. Serve them with `?download=<original name>` so users get a readable file name.
