# Platform foundation

Shared plumbing for the Wave B squads (advisor, hub, revenue, command, growth, pitch), built by the
`foundation` squad. It covers first-party analytics, the demo-view framework and pitch gate, the AI and
rate-limit guards, feature flags, admin navigation, lead refs and attribution.

| Area | Code | Tables / env |
|---|---|---|
| [Analytics](#1-analytics) | `lib/analytics/*`, `POST /api/track`, `components/analytics/*` | `platform_events` |
| [Viewable impressions](#15-partner-impressions-and-clicks) | `lib/analytics/viewability.ts`, `<ViewableImpression>` | `platform_events` |
| [Attribution and lead refs](#16-attribution-and-lead-refs) | `lib/analytics/attribution.ts`, `lib/leads/submit.ts` | `leads.ref`, `leads.attribution` |
| [Demo views](#2-demo-views) | `lib/demo/*`, `app/platform/*` | none (fixtures only) |
| [Pitch gate](#3-pitch-gate) | `lib/platform/gate.ts`, `middleware.ts` | `PITCH_ACCESS_CODE` |
| [Guards](#4-guards) | `lib/guard/rateLimit.ts`, `lib/guard/aiBudget.ts`, `lib/guard/aiPricing.ts` | `rate_limits`, `ai_usage`, `AI_DAILY_BUDGET_USD` |
| [Flags](#5-feature-flags) | `lib/flags.ts` | `FLAG_*` |
| [Admin nav](#6-admin-navigation) | `lib/admin/nav.ts` | none |
| [Admin API (spec)](#7-admin-api-spec) | not built yet | |

Migrations (slot `20261014102000`–`20261014102959`):

| File | Creates |
|---|---|
| `20261014102000_foundation_platform_events.sql` | `platform_events` + the `platform_events_daily` view + the RPCs `platform_daily_counts`, `platform_unique_visitors(_daily)`, `platform_funnel`, `platform_top_props` |
| `20261014102100_foundation_guards.sql` | `rate_limits` + `rate_limit_hit()`, `ai_usage` + `record_ai_usage()`, `ai_spend_for_day()` |
| `20261014102200_foundation_lead_ref.sql` | `leads.ref` (`BB-YY-NNNNNN`) from `leads_ref_seq`, `leads.attribution`, the trigger `leads_foundation_guard` |

**RLS.** Nobody but the service role writes these tables. Staff (editor/admin) can read
`platform_events` and `ai_usage`. `rate_limits` has no API access at all. The rollups are
`SECURITY INVOKER`, so anon users and members get empty results. Checked on the local stack: anon and
member JWTs read nothing.

---

## 1. Analytics

### 1.1 Track an event

```ts
// Client Component
import { track } from '@/lib/analytics/track';
track('hub_item_saved', { item_type: 'video', item_id: youtubeId });
track('signup_started');                       // props are optional when every prop is optional

// Server Action / Server Component (context comes from next/headers)
import { trackServer } from '@/lib/analytics/server';
await trackServer('quote_request', { specialty: 'אלומיניום', stage: 'frame', region: 'sharon' }, { userId: user?.id });

// Route Handler (pass the request; works inside a streaming callback too)
await trackServer('answer_completed', { query, sources: 3, confidence: 0.8, latency_ms, model }, { request });

// Server Component page that is static or ISR: fire on view, from the browser
import TrackEvent from '@/components/analytics/TrackEvent';
<TrackEvent name="pro_profile_view" props={{ business_id: business.id, business_slug: business.slug }} />
```

- Names and props are **typed by the catalog**. A wrong name or prop fails `tsc`.
- `track()` is fire-and-forget. It never throws. Events are batched and sent about 1.5s after the
  first one, at 25 events, and on `pagehide` or a hidden tab (`sendBeacon`). The landing page's UTMs
  ride along for the whole session.
- `trackServer()` never throws and gives up after about 2s, so awaiting it is safe. In serverless,
  await it before you return.
- `page_view` is automatic: `<PageViewTracker/>` in `app/layout.tsx` sends it on first load and on
  every client-side navigation. Google Analytics (`components/Analytics.tsx`, production plus
  `NEXT_PUBLIC_GA_MEASUREMENT_ID`) is unchanged and runs alongside it.
- Debugging: `localStorage.setItem('bb_track_debug', '1')` logs every event in the console. The
  `x-bb-track` response header of `/api/track` says what happened (`stored`, `bot`,
  `rate_limited`, ...).

### 1.2 Add an event to the catalog

Every name lives in `lib/analytics/events.ts`. Don't invent names ad hoc.

```ts
// lib/analytics/events.ts, inside EVENT_CATALOG
checklist_item_done: event(
  'both',                                     // 'client' | 'server' | 'both' (who may send it)
  'A builder ticked an item on a stage checklist.',
  z.object({ stage: text(40), item_id: text(120) }),
),
```

Rules:
- Use snake_case `<object>_<past-tense verb>`, matching `^[a-z][a-z0-9_]{1,63}$`. The DB enforces it.
- **No personal data in props**: no names, phones, emails or addresses. Link to rows by id
  (`lead_id`, `business_id`). Free text (`freeText()`) redacts emails and phone numbers.
- `emitter: 'server'` keeps an event off the public endpoint. `POST /api/track` drops it, so a
  browser can't forge a stored lead or a revealed phone.
- Strings are trimmed and truncated, not rejected. Unknown props are dropped. A wrong type drops
  the event.
- Add the event to the list in `tests/analytics/catalog.test.ts` when it's part of a contract other
  squads rely on.

Current catalog. Events marked **(wired)** are already emitted:

| Group | Events |
|---|---|
| Navigation | `page_view` **(wired, every page)** |
| Search / AI | `search_submitted` **(wired: SearchBar)**, `answer_requested` / `answer_completed` **(wired: /api/answer/stream, server)**, `answer_feedback`, `followup_clicked`, `source_clicked` |
| Leads | `lead_cta_shown`, `lead_cta_clicked`, `lead_submitted` **(wired: submitLead, server)**, `phone_reveal` **(wired: business popup, server)**, `consultation_clicked` **(wired: ConsultationCTA)**, `consult_booking_started` / `consult_booked` **(wired: Calendly embed)**, `quote_request`, `shortlist_add` |
| Accounts / hub | `signup_started`, `signup_completed`, `hub_onboarding_completed`, `hub_item_saved` |
| Growth | `planner_started`, `planner_completed`, `budget_estimate_completed` |
| Directory | `pro_profile_view` **(wired: /business/<slug>/)**, `pro_contact_clicked` |
| Partners | `partner_impression` / `partner_click` (sponsored slots, through `<ViewableImpression>`), `partner_offer_view` / `partner_offer_click` (benefits-shop offers) |
| Media | `video_play` |

### 1.3 What `/api/track` does

`POST /api/track` takes `{ events: [{ name, props, ts, path, referrer }], utm }`. The body is JSON,
sent as `text/plain` by `sendBeacon` and keepalive `fetch`. The route works through these steps:

1. Checks the kill switch (`FLAG_ANALYTICS=false`).
2. Drops bots, headless browsers and HTTP libraries. That includes Lighthouse and our own Playwright
   screenshots, so test with a browser UA.
3. Drops cross-site posts (`Sec-Fetch-Site`).
4. Rejects bodies over 32KB.
5. Rate-limits each IP hash to 120 batches a minute (in-memory). The hash uses the `LEAD_IP_SALT`
   scheme from `lib/leads/spam.ts`.
6. Validates each event against the catalog, so one bad event never sinks the batch.
7. Dedupes `partner_impression` (see §1.5).
8. Inserts with the service role.

It sets the `bb_aid` visitor cookie (1 year) if it's missing, and refreshes the `bb_sid` session
cookie (30 minutes, sliding). Both are httpOnly. Every outcome is a **204** except unparsable JSON,
which is a 400. Errors also return 204: analytics never breaks the UX.

Stored columns: `occurred_at` (the client clock, clamped to the last 24h), `name`, `anon_id`,
`session_id`, `user_id` (signed-in members), `path` (the pathname only; Hebrew is decoded),
`referrer` (no query string), `utm`, `props`, `ip_hash`, `device` (mobile, desktop, tablet or bot)
and `is_demo` (any `/platform/*` path).

### 1.4 Read the numbers (dashboards)

Call the RPCs as staff (RLS applies) or with the service role. Days are in Israel time, and demo
traffic is excluded unless `p_include_demo` is set.

```ts
import { platformAdminDb } from '@/lib/platform/db';   // service role, typed with these tables
const db = platformAdminDb();
const from = new Date(Date.now() - 30 * 86_400_000).toISOString(), to = new Date().toISOString();

await db.rpc('platform_daily_counts', { p_from: from, p_to: to, p_names: ['page_view', 'lead_submitted'] });
await db.rpc('platform_unique_visitors', { p_from: from, p_to: to });                 // one row
await db.rpc('platform_unique_visitors_daily', { p_from: from, p_to: to });
await db.rpc('platform_funnel', { p_steps: ['pro_profile_view', 'phone_reveal', 'lead_submitted'], p_from: from, p_to: to });
await db.rpc('platform_top_props', { p_name: 'answer_completed', p_prop: 'query', p_from: from, p_to: to, p_limit: 20 });
// also: select * from platform_events_daily (view: day, name, is_demo, events, visitors, sessions)
```

Notes:
- **Funnel**: a visitor reaches step *k* by firing it at or after the time they reached step *k−1*.
  `conversion` is relative to step 1.
- **Unanswered questions** (P4): `answer_completed` rows with low `props.confidence`, or
  `sources = 0`.

### 1.5 Partner impressions and clicks

Wrap a sponsored slot:

```tsx
import ViewableImpression from '@/components/analytics/ViewableImpression';

<ViewableImpression slot="answer-sidebar" partnerId={partner.id} offerId={offer.id} placement="answer">
  <PartnerCard ... />
</ViewableImpression>
```

`partner_impression` fires when **all** of these hold:
- at least 50% of the slot is visible (IntersectionObserver);
- it stays visible for at least 1 continuous second, with the tab visible;
- the visitor was active in the last 60 seconds (pointer, keys, wheel, scroll, touch or input).

An idle visitor isn't counted until their next action. A visitor counts **once per slot per 30
minutes**: the browser dedupes (localStorage), and `/api/track` dedupes again per `anon_id` + slot
against `platform_events`. These are billing-grade counts. If a slot rotates partners, put the
partner in the slot id (`answer-sidebar:partner-42`).

Clicks on links and buttons inside the wrapper send `partner_click`. Without IntersectionObserver,
nothing is counted, so impressions are never over-counted. The rule lives in
`lib/analytics/viewability.ts` (`VIEWABILITY`).

### 1.6 Attribution and lead refs

**Every lead carries its source.** `submitLead()` looks up the visitor's last touch in the 4 hours
before the lead (`lastTouchForVisitor`) and stores it in `leads.attribution`:

```json
{ "model": "last_touch_4h", "touch": "partner_click", "medium": "partner", "source": "partner-42",
  "campaign": "spring", "minutes_before": 12, "at": "2026-10-14T09:48:00.000Z", "path": "/search/" }
```

The newest of these touches wins:

| Touch | `medium` | `source` |
|---|---|---|
| `partner_click` | `partner` | `partner_id` |
| `source_clicked` | `ai_source` | `<kind>:<id>` |
| An acquisition `page_view` (UTM or external referrer) | `campaign` or `referral` | `utm_source` or the referrer host |

Internal page views are not touches. On a timestamp tie, `partner_click` beats `source_clicked`,
which beats a page view. With no touch, the attribution is `null` (direct). The pure function is
`pickLastTouch(rows, leadAt)`, and it's unit-tested. The admin lead page shows it as one Hebrew
line (`attributionLabelHe`). The same fields go on the `lead_submitted` event (`touch`,
`touch_medium`, `touch_source`).

**Lead refs** are the money link:
- Every lead gets `leads.ref`, like `BB-26-000123` (prefix `BB`, the year in Israel time, then a
  6-digit sequence that never resets).
- The trigger `leads_foundation_guard` assigns it on insert, replacing any client value, and keeps
  it permanent. The same trigger keeps untrusted writers from setting `attribution`.
- It shows in the admin inbox (a column, plus search by ref), the lead page header, the CSV export
  and the notification email subject.
- Quote it to pros and partners.

---

## 2. Demo views

The sales tour must never depend on real data or logins. Every Wave B squad ships
`/platform/demo/<squad>/`. It renders the squad's **real UI components from fixtures**, with no
auth, DB or API calls.

### 2.1 Write a fixture

```ts
// lib/demo/fixtures/hub.ts (one file per squad)
import { defineDemoFixture } from './define';

export const hubDemo = defineDemoFixture('hub', ({ gen, today }) => {
  const builder = gen.person();                           // Hebrew name, masked phone, example.com email
  const project = { place: gen.place(), stage: gen.stage(), sizeSqm: 190 };
  const saved = gen.fork('saved').questions(5);           // fork per section: stable when you add more
  const visits = gen.fork('visits').timeSeries({ days: 28, base: 3, weeklyGrowth: 0.02 });
  return { builder, project, saved, visits, today };
});
```

Then register it with one line in `lib/demo/fixtures/index.ts` (`DEMO_FIXTURES`).

Generator API (`lib/demo/generator.ts`). It's deterministic per seed and Israel's `today`:

| Call | Returns |
|---|---|
| `person()` | `{ fullName, firstName, lastName, gender, initials, phone: '052-•••-4821', email: '…@example.com' }` |
| `place(regionSlug?)` | a town and its region (weighted like the community, across the 13 member regions) |
| `region()`, `regions()` | one weighted member region, or all 13 |
| `stage()` | a construction stage (`value` + Hebrew `label`) |
| `business(specialtySlug?)`, `businesses(n)` | a Hebrew business name, specialty, place, `ratingPercent`, `reviewCount` |
| `lead(opts)`, `leads(n, { withinMinutes })` | a lead with `ref`, `minutesAgo`, person, place, stage, size, budget band, question, source, status and score |
| `questions(n)` | real-sounding builder questions with `asks`, `confidence` and `answered` (a low score is a content gap) |
| `timeSeries({ days, base, weeklyGrowth, weekly, noise, end })` | `{ date, value }[]` with weekly seasonality (Israeli week: Friday and Shabbat dip) and compound growth |
| `fork(label)` | an independent generator for one section |
| `rng` | the raw stream: `int`, `float`, `pick`, `weighted`, `sample`, `normal`, `uuid` |

Rules:
- Keep fixture data **plain JSON**, so it can go straight into Client Components.
- Times are relative (`minutesAgo`), so a demo always looks fresh. Render them with `agoHe()`.
- Daily series end on `today`.
- Never use `Math.random()` or real people.

### 2.2 Register and build the view

1. **Page.** Add `app/platform/demo/<squad>/page.tsx`, a Server Component:

   ```tsx
   import { loadDemoFixture } from '@/lib/demo/fixtures/define';
   import { hubDemo } from '@/lib/demo/fixtures/hub';
   export const revalidate = 3600;           // "today" moves on
   export const metadata = { title: 'הבית שלי' };
   export default function HubDemoPage() {
     const data = loadDemoFixture(hubDemo);
     return <HubRoadmap project={data.project} saved={data.saved} />;   // your real UI, fed fixtures
   }
   ```

2. **Registry.** In `lib/demo/views.ts`, flip your entry's `status` to `'ready'`. It then links
   from `/platform/demo/`.

3. **What you get for free:**
   - `app/platform/demo/layout.tsx` adds the **"תצוגת הדגמה · נתונים לדוגמה"** banner.
   - `app/platform/layout.tsx` adds the noindex metadata and the pitch shell.
   - The public site's header, footer and floating CTAs are hidden on `/platform/*` by
     `SiteChromeGate` in `app/layout.tsx`.
   - Analytics from `/platform/*` is flagged `is_demo`. AI calls from these pages are recorded as demo
     usage, but still count toward the budget.

4. **Design your components** to take data as props, so the same UI renders real data on the site
   and fixtures in the demo. If a view needs interactivity, make the leaf a Client Component and pass
   it fixture props.

The reference view is `/platform/demo/foundation/` (`lib/demo/fixtures/foundation.ts`). It shows a KPI
row, a daily chart, recent leads, leads by region and top questions.

---

## 3. Pitch gate

- If `PITCH_ACCESS_CODE` is **unset**, `/platform/*` is open.
- If it's **set**, a visitor opens any `/platform` URL once with `?code=<code>`:
  1. The middleware sets the httpOnly `bb_pitch` cookie (30 days, path `/platform`). The cookie holds
     a hash of the code, never the code.
  2. It 303-redirects to the same URL **without** the code.
  3. Later visits pass on the cookie.
- Without the cookie, the visitor gets a 401 noindex page with a small Hebrew code form.
- Changing the code signs everyone out.
- The gate runs after the legacy-redirect and trailing-slash steps. It never touches `/api`.
- `robots.txt` disallows `/platform/`, and the layout sets `noindex, nofollow`.

The share link for the tour is `https://<site>/platform/?code=<code>`.

---

## 4. Guards

### 4.1 Rate limits

```ts
import { rateLimit } from '@/lib/guard/rateLimit';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';

const rl = await rateLimit('ai_answer', hashIp(clientIpFromHeaders(request.headers)));
if (!rl.ok) return friendlyRefusal(rl.retryAfterSec);
```

- **Algorithm.** It's a sliding window counter: previous window × (1 − elapsed) + current window. A
  refused call isn't counted, so a blocked client recovers on schedule.
- **Stores.** The in-memory fast path answers first; if it already refuses, the DB is never asked.
  The DB check (`rate_limit_hit` RPC, row-locked) is authoritative across instances.
- **Fail-open.** If the DB is down, the memory verdict stands.
- **Store choice.** `store: 'memory'` is for high-volume, low-stakes intake (`/api/track`).

| Rule | Limit |
|---|---|
| `track` | 120 / minute |
| `ai_answer` | 20 / 10 minutes |
| `form` | 10 / 10 minutes |

Add a rule to `RATE_LIMITS`. To tune one at deploy time, set `RATE_LIMIT_<NAME>=<limit>/<windowSec>`
(for example `RATE_LIMIT_AI_ANSWER=60/600` for an expo booth behind one IP). Ad hoc rules work too:
`rateLimit({ name: 'quote', limit: 3, windowSec: 3600 }, userId)`.

### 4.2 AI budget ("AI cost is capped and visible")

```ts
import { checkAiBudget, recordAiUsage, AI_UNAVAILABLE_MESSAGE } from '@/lib/guard/aiBudget';
import { usageFromAnthropic } from '@/lib/guard/aiPricing';

const budget = await checkAiBudget({ estimateUsd: 0.03 });   // reserve the call's rough worst case
if (!budget.ok) return degraded(budget.message);              // friendly Hebrew, never a crash
const msg = await client.messages.create({ model: 'claude-sonnet-4-6', ... });
await recordAiUsage({ route: 'advisor_chat', model: msg.model, usage: usageFromAnthropic(msg.usage), isDemo });
```

How the cap works:
- The cap is `AI_DAILY_BUDGET_USD` per **UTC** day. The default is **$3**, and `0` turns AI off.
- `FLAG_AI_ANSWERS=false` is the kill switch. It refuses the same way.
- The cap covers every route and model, demo traffic included.

What gets recorded and how it degrades:
- **Spend.** It's in `ai_usage`, one row per day, route, model and demo flag (calls, tokens,
  `cost_usd`). Staff can read it. Each instance caches the day's total for 15 seconds and adds its
  own recordings, so a DB outage still caps that instance.
- **Streaming.** Fold each raw SSE event through `accumulateStreamUsage(usage, evt)`, which reads
  `message_start` and `message_delta` usage. If you use the SDK's `.stream()`, use
  `usageFromAnthropic(final.usage)`.
- **Prices.** They're in `lib/guard/aiPricing.ts`, in USD per million tokens, using the claude-api
  skill rates for the current Claude models plus `text-embedding-3-small`. Cache writes are priced
  at 1.25× input (5-minute TTL) or 2× (1-hour TTL). An unknown model is priced at the most expensive
  rate, with a warning. **Add your model there** if you switch.
- **Already wired:**
  - `/api/answer/stream`: per-IP rate limit, the budget check, usage recorded from the stream, and the
    `answer_requested` and `answer_completed` events. Over budget, it skips the model and streams the
    friendly message plus the retrieved sources, in the normal SSE shape (`done` carries `degraded`).
    The current UI renders that as-is. Rate-limited requests get a "slow down" message.
  - The pros classifier (`app/api/_lib/pros.ts`) is skipped when over budget, and its usage is
    recorded from `response.usage`.
- **Not recorded** in `ai_usage`: query embeddings in `semantic.ts` (about $0.0000004 each). Index
  builds should call `recordAiUsage` with the OpenAI `usage.total_tokens`.

Today's spend is `select * from ai_usage where day = current_date` (staff), or
`db.rpc('ai_spend_for_day')`.

---

## 5. Feature flags

```ts
import { isEnabled } from '@/lib/flags';
if (!isEnabled('hub')) notFound();             // Server Component / Route Handler
<HubTeaser enabled={isEnabled('hub')} />       // pass the boolean down to Client Components
```

- Each flag reads `FLAG_<NAME>`, with camelCase turned into UPPER_SNAKE: `budgetPlanner` reads
  `FLAG_BUDGET_PLANNER`.
- `true`/`1`/`on`/`yes` and `false`/`0`/`off`/`no` are recognized. Anything else falls back to the
  default.
- Flags are server-side because env vars are read at runtime. `allFlags()` returns a snapshot.
- To add a flag, add one entry to `FLAGS` with its default, owner and description.
- Defaults:
  - Ops switches are on: `analytics`, `aiAnswers`.
  - Dark launches are off: `advisor`, `hub`, `revenue`, `commandCenter`, `budgetPlanner`,
    `programmaticSeo`, `autopilot`.
- Demo views render from fixtures, so they never need a flag turned on.

---

## 6. Admin navigation

The admin sidebar renders from `lib/admin/nav.ts`. To add a screen, add one item:

```ts
{ id: 'insights', title: 'תובנות', items: [
  { href: '/admin/command/', label: 'מרכז שליטה', flag: 'commandCenter' },
  { href: '/admin/ai-usage/', label: 'עלויות AI', minRole: 'admin' },
] },
```

- Items default to editors and up. `minRole: 'admin'` hides an item from editors. The page must still
  call `requireRole('admin')`, because the nav is not the guard.
- `flag` hides an item until its flag is on.
- `app/admin/layout.tsx` resolves `adminNavFor(role, isEnabled)` on the server.

The site navigation (`lib/content/navigation.ts`) belongs to the design squad. The `/platform` shell
navigation is `lib/platform/nav.ts`.

---

## 7. Admin API (spec)

**Status: specified, not built in Wave A.** This is the token-scoped API that lets the owner's
existing AI agents keep publishing.

### 7.1 Auth

- **Header.** Requests send `Authorization: Bearer bb_live_<32 random bytes, base64url>`.
- **Tokens.** Store only the SHA-256 in `api_tokens`, which has these columns:
  - `id`, `name`, `token_hash` (unique), `prefix` (the first 8 characters, for display)
  - `scopes text[]`, `created_by` → profiles
  - `created_at`, `last_used_at`, `expires_at`, `revoked_at`
- **Lifecycle.** An admin mints a token in `/admin/settings/api-tokens/`; the token is shown once.
  Revoking it takes effect immediately.
- **Checks.** A lookup is a constant-time compare on the hash, refused when the token is revoked or
  expired.
- **Rate limit.** `rateLimit({ name: 'admin_api', limit: 120, windowSec: 60 }, tokenId)`.
- **Scopes.** `posts:read`, `posts:write`, `media:write`, `video_pages:read`, `video_pages:write`.
  Each route requires one. A missing scope gets a 403 `{ error: 'insufficient_scope', required }`.
- **Writes.**
  - They go through the same `lib/db/*` functions as the admin, with the service role, plus HTML
    sanitizing (`lib/content/sanitize`), slug rules (`lib/admin/slug.ts`) and revalidation
    (`lib/admin/revalidate.ts`).
  - `created_by` and `updated_by` are set to the token's creator.

### 7.2 Endpoints (`/api/admin/v1/*`, JSON)

| Method and path | Scope | Notes |
|---|---|---|
| `GET /posts?status=&q=&page=` | `posts:read` | Paginated `{ items, total, page, pageSize }` |
| `GET /posts/:id` | `posts:read` | |
| `POST /posts` | `posts:write` | Body: `{ title, slug?, content_html, excerpt?, status: 'draft'\|'published', published_at?, category_ids?, tags?, featured_image?, seo_title?, seo_description? }`. A missing slug becomes `slugify(title)`. Returns 409 on a slug clash |
| `PATCH /posts/:id` | `posts:write` | Partial update. A slug change on a published post adds a 301, as in the admin |
| `POST /media` | `media:write` | multipart `file` (images ≤ 10MB). Stored in `media/uploads/YYYY/MM/`. Returns `{ url }` |
| `GET /video-pages`, `GET /video-pages/:id` | `video_pages:read` | |
| `POST /video-pages`, `PATCH /video-pages/:id` | `video_pages:write` | `{ title, legacy_slug?, youtube_ids, content_html, status }` |

There is no delete in v1: agents unpublish by setting `status: 'draft'`. The API returns
`Idempotency-Key` support on POST: the same key within 24 hours returns the first result.

### 7.3 Audit log

`api_audit_log` holds `id`, `token_id`, `at`, `method`, `path`, `status`, `resource`, `resource_id`,
`ip_hash`, `request_id` and `summary jsonb`. The summary holds changed field names, not bodies. Every
call writes a row, including 4xx responses. Admins read it in the token screen.

**RLS** for both tables: admins read; the service role writes.

### 7.4 Acceptance

- A test calls every route with no token, a revoked token, a wrong scope and the right scope.
- An agent can publish a post end to end: upload an image, create a draft, then publish.
- Sanitizing the content is a no-op on content the admin editor produced.

### 7.5 Open questions (owner), before building

1. **How do the agents publish to WordPress today?** If they use the WP REST API
   (`/wp-json/wp/v2/posts` and `/media` with Application Passwords), add a thin **compatibility
   shim**: the same JSON shapes, mapped onto the v1 handlers. Each agent then only needs a new base
   URL and credentials.
2. Which content types do they touch? Posts only, or also video pages and pages?
3. Do they set categories and tags by WordPress id or by name? The import kept `legacy_wp_id`, so
   both can map.

Estimated build: a migration, the token and audit helpers, the routes, the admin token screen and
tests. That's roughly a day for one squad, best owned by `autopilot` (content in) or `command`
(owner tools).

---

## 8. Environment

| Variable | Default | Purpose |
|---|---|---|
| `AI_DAILY_BUDGET_USD` | `3` | Daily AI cap (UTC day). `0` turns AI off |
| `FLAG_<NAME>` | see `lib/flags.ts` | Feature flags, e.g. `FLAG_AI_ANSWERS=false` (kill switch), `FLAG_ANALYTICS=false` |
| `RATE_LIMIT_<RULE>` | see `RATE_LIMITS` | Override, e.g. `RATE_LIMIT_AI_ANSWER=60/600` |
| `PITCH_ACCESS_CODE` | unset (open) | Gate for `/platform/*` |
| `LEAD_IP_SALT` | the service-role key | Salt for hashed IPs (leads, analytics, rate limits) |

---

## 9. Tests

| File | Covers |
|---|---|
| `tests/analytics/catalog.test.ts` | catalog coverage, validation, redaction, `track()` typing, sanitizers |
| `tests/analytics/track-route.test.ts` | `/api/track`: storage and cookies, per-event drops, bot and cross-site drop, rate limit, fail-open, impression dedupe, kill switch |
| `tests/analytics/track-client.test.ts` | batching, `sendBeacon` on pagehide, session UTMs, never throws |
| `tests/analytics/viewability.test.ts` | the viewable rule (50%, 1s, activity, hidden tab), the 30-minute claim, `<ViewableImpression>`, Calendly mapping |
| `tests/analytics/impressions.test.ts` | server-side impression dedupe |
| `tests/analytics/attribution.test.ts` | 4-hour last touch: window, precedence, ties, labels |
| `tests/guard/rate-limit.test.ts` | window math, memory and DB stores, fail-open, overrides |
| `tests/guard/ai-budget.test.ts` | pricing math, usage parsing, budget math, DB outage, kill switch |
| `tests/guard/answer-stream-guards.test.ts` | `/api/answer/stream`: degraded answers, usage recording, analytics |
| `tests/demo/generator.test.ts` | determinism (pinned values), streams, regions, seasonality, fixtures, registry |
| `tests/platform/pitch-gate.test.ts` | the gate, plus the middleware order (redirects, trailing slash, `/api`) |
| `tests/platform/nav-and-flags.test.ts` | admin nav by role and flag, platform nav, flag parsing |
