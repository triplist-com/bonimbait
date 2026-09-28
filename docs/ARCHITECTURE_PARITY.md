# Parity architecture (Wave 1 foundation)

The foundation for rebuilding bonimbayit.co.il inside `apps/web`: Supabase schema + RLS, auth and roles,
a typed data-access layer, the payment abstraction, and routing that preserves WordPress URLs.
See `docs/sprints/PARITY_PLAN.md` for the plan and `docs/LIVE_SITE_INVENTORY.md` for the crawl.

- **Store:** Supabase (Postgres + Auth + Storage), accessed from Next.js route handlers and server
  components. `apps/api` (FastAPI) is not used for new features.
- **Domain:** never hard-coded. Everything reads `NEXT_PUBLIC_SITE_URL` through `apps/web/lib/site.ts`
  (`SITE_URL`, `absoluteUrl()`, `SITE_HOST`, `CONTACT_EMAIL`).

---

## 1. Migrations

All migrations are in `supabase/migrations/`. Apply them in filename order.

| File | Creates / changes |
|---|---|
| `20260928120000_parity_foundation_profiles.sql` | `set_updated_at()`, `whatsapp_groups` (+ `whatsapp_groups_public` view), `regions` (14 seeded), `resolve_region()`, `profiles`, role helpers (`app_role`, `has_role`, `is_staff`, `is_admin`, `is_trusted_writer`), role-guard trigger, `handle_new_user` trigger on `auth.users` |
| `20260928120100_parity_content.sql` | `post_categories`, `authors`, `posts`, `post_category_assignments`, `pages`, `video_pages`. `categories`/`videos` use `create table if not exists`: a no-op on the shared DB, and a fallback for a fresh project |
| `20260928120200_parity_directory.sql` | `specialties`, `businesses`, `business_contacts` (private), `business_specialties`, `business_regions`, `reviews`, `business_review_stats` view, guard triggers |
| `20260928120300_parity_commerce.sql` | `service_plans` + `service_plan_prices` (3 plans seeded), `product_categories`, `products`, `product_category_assignments`, `orders`, `order_items`, `payments` |
| `20260928120400_parity_leads_redirects.sql` | `leads` (+ guard), `redirects` (10 live redirects seeded) |
| `20260928120500_parity_rls.sql` | RLS on every new table (see §3) |
| `20260928120600_parity_storage.sql` | Storage bucket `media` (public read) + write policies |
| `20260928120700_harden_legacy_api_tables.sql` | **Optional.** Enables RLS on the apps/api tables (see §1.2) |

Every file is idempotent (`if not exists`, `or replace`, `drop … if exists`, `on conflict do nothing`).
All eight were applied twice, in order, to a throwaway local Postgres 16 with stubbed Supabase
`auth`/`storage` schemas, and a behaviour script exercised the RLS and triggers as anon, member,
pro and admin. They have **not** been applied to the shared Supabase project.

### 1.1 How to apply (orchestrator)

```bash
# Option A — Supabase CLI (recommended)
supabase link --project-ref <ref>
supabase db push            # applies supabase/migrations/* not yet recorded

# Option B — psql, in order
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f "$f"; done
```

Use the **direct** connection (port 5432), not the transaction pooler (6543). The migrations use `DO`
blocks and create triggers. Back up first (`supabase db dump`).

### 1.2 Coexistence with the existing apps/api tables

The shared project already has the Alembic tables `categories`, `videos`, `video_segments`,
`embeddings` and `analytics_events`. The parity migrations don't drop, rename or alter any of them.

| Existing table | Collision | Decision |
|---|---|---|
| `videos` | Legacy `/video/<hebrew-slug>/` pages need a home | **Not altered.** New `video_pages` table keyed by `legacy_slug`, with a nullable `video_id` FK and `youtube_ids text[]`. 188 legacy pages; only 37 match indexed videos |
| `categories` | Name clash with WordPress post categories | **Not reused.** Post categories live in `post_categories`; `categories` stays the apps/api video taxonomy |
| all five | No RLS today, so readable and writable by anyone with the anon key once the browser has it | `…120700_harden_legacy_api_tables.sql` enables RLS: public read on `categories`, `videos` and `video_segments`, and no API access to `embeddings` or `analytics_events`. FastAPI connects as the table owner, so it bypasses RLS and is unaffected. This file is optional; the orchestrator may skip it |

The live schema couldn't be introspected during Wave 1: the Supabase host in `.env` doesn't resolve,
and the local DB was down. The table shapes above come from `apps/api/alembic/versions/`,
`apps/api/models/` and `scripts/`. Before applying, run `\d public.videos` and
`\d public.categories` to confirm there are no out-of-band columns that clash with the fallback
`create table if not exists` statements. Those statements are skipped anyway when the tables exist.

---

## 2. Schema (text diagram)

```
auth.users 1─1 profiles ──> regions ──> whatsapp_groups (invite_url gated)
                  │ role: member | pro | editor | admin
                  │
posts ──> post_categories      posts ──> authors
posts ─< post_category_assignments >─ post_categories
pages (self parent_id)
video_pages ──> videos (apps/api, untouched) ──> categories (apps/api)

businesses ──> specialties (primary)          businesses ──> profiles (owner_member_id)
businesses 1─1 business_contacts   (phone/whatsapp/email/lead_email — PRIVATE)
businesses ─< business_specialties >─ specialties       (91 specialties)
businesses ─< business_regions     >─ regions           ("work regions", may include nationwide)
businesses ─< reviews ──> profiles (member_id)          view: business_review_stats

service_plans ─< service_plan_prices                 (/membership-tiers/)
products ─< product_category_assignments >─ product_categories
orders ──> profiles ; orders ─< order_items ──> products | service_plan_prices
orders ─< payments (provider, provider_ref, status)

leads ──> regions | businesses | products | service_plans | whatsapp_groups | profiles
redirects (from_path unique, normalized)
```

Conventions: snake_case plural tables, UUID PKs, `timestamptz` everywhere, `updated_at` maintained by
the `set_updated_at()` trigger, money as integer **agorot**, and Hebrew slugs stored **decoded**.
Every imported entity has `legacy_wp_id` for idempotent re-imports.

### 2.1 Regions — one master list

Seeded from the live directory filter: 14 regions, including "כל הארץ" (`nationwide`,
`is_nationwide = true`). `regions.aliases` holds the label variants used by the other live forms.
`public.resolve_region(label)` maps any slug, name or alias to an id, and is used by the signup
trigger and the import loader.

| slug | Directory / canonical name | Other live labels (aliases) | Signup (13) | WhatsApp group (default) |
|---|---|---|---|---|
| golan | רמת הגולן | | ✓ | גולן וגליל תחתון |
| upper-galilee | גליל עליון | | ✓ | גליל עליון ומערבי |
| akko-nahariya | עכו - נהריה והסביבה | עכו -נהריה והסביבה, עכו - נהריה | ✓ | גליל עליון ומערבי |
| lower-galilee | גליל תחתון | | ✓ | גולן וגליל תחתון |
| haifa-krayot | חיפה, קריות והסביבה | חיפה | ✓ | חיפה והקריות |
| zichron-valleys | זכרון והעמקים | | ✓ | עמקים |
| hadera | חדרה והסביבה | | ✓ | מרכז והשרון |
| sharon | אזור השרון | השרון | ✓ | מרכז והשרון |
| center | מרכז | אזור מרכז | ✓ | מרכז והשרון |
| shfela | שפלה | השפלה | ✓ | השפלה |
| jerusalem | אזור ירושלים | ירושלים | ✓ | ירושלים וסביבה |
| judea-samaria | יהודה, שומרון ובקעת הירדן | יהודה ושומרון | ✓ | יהודה ושומרון |
| south | אזור דרום | דרום | ✓ | דרום - ב״ש/שדרות/נתיבות |
| nationwide | כל הארץ | | — (pros only) | — |

- **Lead forms (CF7, 14):** the same labels as the directory. "עכו - נהריה" resolves through its alias.
- **WhatsApp page (11 areas):** stored as `whatsapp_groups`. Three of the areas have no region of
  their own. The two south groups ("דרום - דימונה/ערד/אילת" and "דרום - ב״ש…") both sit inside
  `south`, and "אשקלון/אשדוד/יבנה" sits across south and shfela. The join form lists all 11 groups
  (`whatsapp_groups_public`), and `regions.whatsapp_group_id` only sets the default suggestion.
- **Why a table instead of `regions.whatsapp_invite_url`:** the 11 groups don't map 1:1 onto the
  14 regions. The invite links are also lead-gated on the live site, so they must not be publicly
  readable. The table has no public RLS policy. The public view omits `invite_url`, and
  `revealWhatsappInvite()` (service role) returns it after a `whatsapp_join` lead is recorded.

### 2.2 Businesses and gated phones

The live site reveals a phone only after the visitor submits the lead popup. So `businesses` holds
the public profile only, and `business_contacts` (phone, whatsapp, email, other_phones, lead_email)
has **no public policy**. Only the owner, staff and the service role can read it.

Phone-reveal flow for the Directory agent:
1. Call `createLead({ type: 'business_contact', businessId, … })`.
2. Call `revealBusinessContact(adminDb, businessId)`, which returns the phones and `forwardTo`.
3. `businesses.lead_routing`: `'site'` sends the lead to the site inbox (info@, 134 businesses);
   `'direct'` forwards it to `business_contacts.lead_email`.

Owners can edit content and contacts, but not `slug`, `status`, `tier`, `lead_routing`,
`sort_order` or `is_featured`; the guard trigger silently keeps those fields. Listing order is the
live site's only ranking signal, so it's `sort_order`.

### 2.3 Reviews

Reviews use the live scale: `rating` is 0–10, plus four sub-scores (`score_value` תמורה למחיר,
`score_availability` זמינות ושירותיות, `score_attitude` יחסי אנוש, `score_reliability` אמינות ואיכות
עבודה). `author_name` is nullable because 55 migrated reviews are anonymous.
`business_review_stats.rating_percent` reproduces the live "overall %".

### 2.4 Service plans (`/membership-tiers/`)

These are construction-management plans, not site memberships:

| Plan | Price (ex-VAT) |
|---|---|
| בונים תקציב | ₪6,900 |
| בונים בית פלוס | ₪29,000 |
| בונים בית עד מפתח, up to 180 m² | ₪133,000 |
| בונים בית עד מפתח, above 180 m² | ₪149,000 |

Prices sit in `service_plan_prices` with `vat_included = false`. `features` holds the 12-row
comparison table (loaded by the importer); `highlights` holds the card bullets (seeded).
`is_purchasable_online` defaults to `false` (undecided), and checkout refuses plans without it.
Generic memberships and events were dropped: the live site has neither.

---

## 3. Row-level security

Helpers (`SECURITY DEFINER`): `is_staff()` means editor or admin. `is_trusted_writer()` means a
direct DB connection, the service role, or staff. The guard triggers use it to protect moderation
and workflow columns.

| Table(s) | anon | member (authenticated) | pro (owner) | editor/admin |
|---|---|---|---|---|
| regions, specialties, post_categories, authors, product_categories | read | read | read | all |
| whatsapp_groups | — (view `whatsapp_groups_public` without links) | — | — | all |
| posts, pages, video_pages | read published (and `published_at <= now()`) | same | same | all |
| businesses | read published | read published; insert own (forced `pending`) | read + update own (guarded columns) | all |
| business_contacts | — | — | read/write own | all |
| business_specialties, business_regions | read (published) | read | manage own | all |
| reviews | read approved | insert (forced `pending`, `member`, self); read own | read reviews of own business | all |
| service_plans / service_plan_prices | read active | read active | read active | all |
| products (+ category assignments) | read published | read published | read published | all |
| orders, order_items, payments | — | read own | read own | all |
| leads | insert | insert | insert; read leads for own business | all |
| redirects | read active | read active | read active | all |
| profiles | — | read/update own (role change blocked) | same | all (only admin changes roles) |
| storage `media` | public URLs | write `members/<uid>/…` | write `businesses/<own id>/…` | write all |

Writes to `orders`, `order_items` and `payments` go through the **service role** only
(`lib/db/commerce.ts`: `createPendingOrder`, `createPaymentAttempt`, `applyPaymentResult`). Prices
are re-read from the DB, so browsers can't forge totals or payment status. The same pattern covers
the gated reveals.

---

## 4. Auth

- **Supabase Auth** with email/password and Google, through `@supabase/ssr`. NextAuth has been removed.
- **Clients:**
  - `lib/supabase/server.ts`: user session, RLS applies.
  - `lib/supabase/browser.ts`: client components.
  - `lib/supabase/middleware.ts`: session refresh.
  - `lib/supabase/admin.ts`: service role, `server-only`, bypasses RLS.
- **Helpers** (`lib/auth/session.ts`):
  - `getUser()`
  - `getProfile()`
  - `requireRole(role, nextPath)`: server components; redirects to `/login/`.
  - `checkRole(role)`: route handlers; returns 401/403.
  - The role hierarchy is `member < pro < editor < admin` (`lib/auth/roles.ts`, mirrored by
    `public.role_rank`).
- **Routes:**
  - `/login/`: email/password + Google.
  - `/signup/`: name, email, phone, password, construction stage, region, WhatsApp/tips opt-in.
    The values travel as user metadata, and the `handle_new_user` trigger builds the profile.
    For Google signups, stage and region are passed through the callback URL.
  - `/auth/callback/`: OAuth `code`, or email `token_hash`.
  - `/auth/signout/`: POST.
- **Flow:**
  1. The browser signs in via supabase-js.
  2. `/auth/callback/` exchanges the code, sets the cookies, and runs `syncProfile()`.
  3. The middleware refreshes the session on each request.
  4. Server components call `getProfile()`.
- **`ADMIN_EMAILS`:** users listed there are always treated as `admin` by `getProfile()`. On login,
  and on the first `getProfile()`, their `profiles.role` is promoted to `admin` with the service
  role, so RLS also sees them as staff. Removing an email from the list does **not** demote the
  user; change `profiles.role` for that.
- **Admin:** `app/admin/layout.tsx` calls `requireRole('admin')`, and the middleware also bounces
  signed-out visitors from `/admin` to `/login/`. `/api/admin/stats` uses `checkRole('admin')`.

Supabase dashboard setup (owner/orchestrator):
- **Auth → URL Configuration:** set the Site URL to `NEXT_PUBLIC_SITE_URL`, and add the redirect
  URLs `<site>/auth/callback/` and `http://localhost:3000/auth/callback/`.
- **Auth → Providers → Google:** add the client ID and secret. Reuse the old NextAuth Google OAuth
  client, and add the Supabase callback `https://<ref>.supabase.co/auth/v1/callback` to its
  authorized redirect URIs.
- **Email templates:** the confirm link must go to `{{ .SiteURL }}/auth/callback/?token_hash={{ .TokenHash }}&type=email`
  (or keep the default PKCE link).
- **Deferred:** SMS phone verification and reCAPTCHA (both on the live site) need providers. See
  the open questions.

---

## 5. Data access (`apps/web/lib/db/`)

There's one module per domain: `posts`, `pages`, `videos`, `businesses`, `reviews`, `members`,
`commerce`, `leads` and `redirects`. Types are in `types.ts` (hand-written, generator-compatible),
and the helpers (`unwrap`, `unwrapMaybe`, `check`, `pageRange`) are in `client.ts`.

Every function takes the client as its first argument, so the caller chooses the RLS context:

```ts
import { createClient } from '@/lib/supabase/server';
import { getPublishedPostBySlug } from '@/lib/db/posts';
const post = await getPublishedPostBySlug(createClient(), decodeURIComponent(params.slug));

// trusted server flows only:
import { createAdminClient } from '@/lib/supabase/admin';
const contact = await revealBusinessContact(createAdminClient(), businessId);
```

Once the schema is applied, `types.ts` can be regenerated with
`supabase gen types typescript --project-id <ref> > apps/web/lib/db/types.generated.ts`, then diffed
against the hand-written file.

---

## 6. Payments (`apps/web/lib/payments/`)

`PaymentProvider` has three methods:
- `createCheckout(req)`, which returns `{ providerRef, redirectUrl }`.
- `verifyCallback(request)`, which must authenticate the callback.
- `refund(req)`.

`getPaymentProvider()` picks the provider from `PAYMENT_PROVIDER`:
- **`mock` (default):** redirects straight to `successUrl` (or to `cancelUrl` when
  `PAYMENT_MOCK_OUTCOME=failed`) with HMAC-signed params. Production requires `PAYMENT_MOCK_SECRET`.
- **`upay`:** a stub with `TODO(upay)` markers until the merchant credentials arrive.

`getPaymentProviderForCallback(name)` only accepts the active provider, so mock callbacks are
rejected once UPay is live.

Checkout sequence for the Commerce agent:
1. `createPendingOrder` (service role).
2. `provider.createCheckout`.
3. `createPaymentAttempt`.
4. Redirect the buyer.
5. On return or webhook: `verifyCallback`, then `applyPaymentResult`. It's idempotent and checks
   the amount.

---

## 7. Routing

### 7.1 Trailing slashes

`next.config.mjs` sets `trailingSlash: true` and `skipTrailingSlashRedirect: true`. The middleware
then 301s page paths to the slash form, as WordPress does. It never redirects:
- `/api/*`: payment webhooks must not get a 308.
- File-like paths: `sitemap.xml`, `robots.txt`, `/opengraph-image`.

Internal links, canonicals and sitemap entries all use the slash form. Existing routes were smoke
tested on a production build (`/about` → 301 `/about/` → 200; `/api/health` → 200; `/search?q=x` →
301 `/search/?q=x`).

### 7.2 Redirects

Middleware step 1 looks up the path in the `redirects` table:
- The whole active table is fetched via PostgREST with the anon key and cached per edge isolate
  for `REDIRECT_CACHE_TTL_SECONDS` (default 300). A failed refresh keeps the stale map.
- Paths are normalized before matching (decoded, no trailing slash, lower-case), so `/%D7%90/`,
  `/א` and `/א/` all match. The query string is preserved.
- The lookup is skipped for `/api`, `/admin` and `/auth`.

Seeded from `data/migration/parity_baseline_live.csv`:
- The 7 live 301s: 3 posts, 3 videos and `/תודה-על-השארת-פרטים/`.
- `/partner-portal-2/` → `/partner-portal/` (302).
- `/checkout/` → `/cart/` and `/partner-portal/` → `/login/`: seeded **inactive**. On WordPress
  these are dynamic (empty cart, signed out). An active row would shadow our real routes, so
  **the `/checkout/` route must 302 to `/cart/` when the cart is empty, and `/partner-portal/` must
  302 to `/login/?next=/partner-portal/` when signed out.**

### 7.3 Route map: live WordPress → new app

| Live pattern (count) | New route | Owner | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` (exists) | — | |
| `/<post-slug>/` (807) | `app/[...slug]/page.tsx` catch-all → `resolveRootSlug()` (pages first, then posts) | Content | Runs after all fixed routes. Hebrew slugs are decoded before lookup |
| `/<page-slug>/`, `/<parent>/<child>/` (29) | same catch-all, `pages.slug` = full path | Content | `pages.template` selects special renderers (thank-you, WhatsApp join, landing) |
| `/blog/` | `app/blog/page.tsx` | Content | |
| `/category/<slug>/` (14) | `app/category/[slug]` (exists, video categories) | Content | Look up `post_categories` first, then fall back to the existing English video-category slugs (no overlap) |
| `/author/<slug>/` (3) | `app/author/[slug]/page.tsx` | Content | `authors` table |
| `/video/<hebrew-slug>/` (188) | `app/video/[id]` (exists) | Content | `resolveVideoRoute()`: legacy page first, then YouTube id |
| `/video/<youtube-id>` | `app/video/[id]` (exists) | — | Unchanged |
| `/recommended/` | `app/recommended/page.tsx` | Directory | Filters: specialty, region (nationwide included) |
| `/business/<slug>/` (158) | `app/business/[slug]/page.tsx` | Directory | The live site uses `/business/`, not `/recommended/<slug>` |
| `/join-us/` | page + `advertise`/`join_pro` lead | Directory / Leads | |
| `/partner-portal/` | business self-service portal | Directory | 302 to `/login/` when signed out |
| `/membership-tiers/` | service-plans page | Community & Commerce | Consultation CTA → `NEXT_PUBLIC_CALENDLY_URL` |
| `/הטבות-לקהילה/` | benefits shop (catch-all page with a `shop` template, or a dedicated route) | Community & Commerce | |
| `/product/<slug>/` (3) | `app/product/[slug]/page.tsx` | Community & Commerce | `is_purchasable = false` means a `benefit` lead form instead of a cart |
| `/category-product/<slug>/` (8) | `app/category-product/[slug]/page.tsx` | Community & Commerce | |
| `/cart/`, `/checkout/`, `/thank-you-order/` | commerce routes | Community & Commerce | |
| `/הצטרפו-לקבוצות-הווטסאפ/` | catch-all page, template `whatsapp-join` | Community / Leads | `whatsapp_join` lead, then reveal the invite |
| `/צור-קשר/`, `/strategic-partners/` | catch-all pages + lead forms | Leads | |
| login/signup popups | `/login/`, `/signup/` | Architect (done) | |
| `/wp-admin/`, `/wp-login.php`, Yoast `/sitemap_index.xml` | suggested manual `redirects` rows → `/admin/`, `/login/`, `/sitemap.xml` | Orchestrator | Not in the live sitemaps; optional |

The existing `/about`, `/contact`, `/privacy` and `/terms` coexist with the live Hebrew pages
(`/אודותינו/`, `/צור-קשר/`, `/מדיניות-פרטיות/`, `/תקנון-האתר/`). See the open questions.

---

## 8. Environment variables

See `.env.example` and `apps/web/.env.production.example`.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | web | Canonical origin (the only domain setting) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | web | Contact email (default `info@<host>`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Supabase client. When unset, auth and redirects no-op, and the rest of the site still works |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server-only) | Service-role client (checkout, reveals, admin promotion) |
| `ADMIN_EMAILS` | web | Always-admin emails |
| `REDIRECT_CACHE_TTL_SECONDS` | web | Redirect cache TTL |
| `PAYMENT_PROVIDER`, `PAYMENT_MOCK_SECRET`, `PAYMENT_MOCK_OUTCOME` | web | Payments |
| `UPAY_API_URL`, `UPAY_MERCHANT_ID`, `UPAY_API_KEY`, `UPAY_WEBHOOK_SECRET` | web | UPay (provisional names) |
| `VAT_RATE` | web | VAT added to ex-VAT service-plan prices (default 0.18) |

No longer used and removable from Vercel: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`. Google OAuth now lives in the Supabase dashboard.

---

## 9. Open questions (owner)

1. **Supabase project:** the URL in `.env` doesn't resolve (the project is paused or deleted?).
   Should parity use a new project or the restored old one?
2. **Duplicate static pages:** keep `/about/` etc. or 301 them to the Hebrew WP slugs (`/אודותינו/`, …) after cutover?
3. **Service plans online:** should they be sold online (`is_purchasable_online`)? Is VAT 18% on
   top of the listed ex-VAT prices?
4. **SMS phone verification and reCAPTCHA** on signup and lead forms: which providers?
5. **UPay:** merchant credentials and API docs, to confirm the provisional env names.
6. **Business tiers:** there are none on the live site. Keep `businesses.tier` for future paid listings, or drop it?
7. **Consultation:** keep Calendly (`NEXT_PUBLIC_CALENDLY_URL`), or should bookings also create a `consultation` lead via a Calendly webhook?
