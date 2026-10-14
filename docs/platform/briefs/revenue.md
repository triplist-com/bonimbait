# Brief: `revenue` (P3, Must). Dev port 3113. Migration slot `20261014122000`–`20261014122959`. API cap $0.20

You own **מנוע ההכנסות · פורטל השותפים · דוח שותף**, plus **the money link**. The platform makes the owner's business
measurable: every lead carries a project file, every consult booking carries it too, and every partner gets
an intent-level report that justifies renewing and upgrading.

Read first:
- `docs/platform/PROGRAM.md`, all of it: §3.1 (P3 row, the money link), §6 (**project-file contract**, owned by you).
- `docs/platform/DESIGN_SYSTEM.md`
- `docs/platform/FOUNDATION.md`. It covers the analytics catalog, `<ViewableImpression>`, the 4-hour last-click attribution, `leads.ref` / `leads.attribution`, the Calendly hook (`lib/analytics/calendly.ts`) and the guards.
- `docs/ARCHITECTURE_PARITY.md` §2.2: businesses, gated phones, lead routing.

## The owner's model (public facts)
- **Pro directory.** 158 businesses are listed in "נבחרת המומלצים". Their phones are lead-gated: 134 businesses route leads to info@ and the rest go direct (`businesses.lead_routing`).
- **Partner tiers** come from his public `/strategic-partners/` page:

  | Tier | Price |
  |---|---|
  | **חברים** | ₪490/mo |
  | **שותפים** | ₪1,490/mo |
  | **שגרירים** | ₪2,990/mo |

  The tier prices must be admin-editable.
- **Brand partners and benefits.** Brand partners such as Pazgaz, Rinnai and Klil appear as products in the benefits shop, with lead forms (`ProductLeadForm`).
- **Consultation funnel.** The free budget consultation runs on Calendly (`NEXT_PUBLIC_CALENDLY_URL`). The CTA is `components/leads/ConsultationCTA.tsx`, which design restyled and foundation instrumented.

## Build

### 1. Project file (`lib/project-file/`)
- `types.ts`: exactly the contract in PROGRAM.md §6.
- `collectProjectFile()`. On the client, it merges the snapshots in `bb.hub.draft`, `bb.planner.last`, `bb.advisor.recent` and `bb.shortlist`, plus the UTM and landing data. On the server, for members, it adds `getMemberProjectSnapshot()` from `lib/hub/server.ts`. The `hub` squad builds that function in parallel: import it behind a tiny adapter and tolerate its absence.
- **Scoring** (0–100) with transparent reasons in Hebrew, built from:
  - budget size;
  - stage urgency: permit and shell stages score high;
  - completeness;
  - intent signals: cost and contractor questions, the planner completed, shortlists, repeat visits.
- Store the file and score in `leads.payload.project_file`, and add `leads.score` columns if needed.
- Unit-test the scoring.

### 2. Consult booking that carries the file
Upgrade `ConsultationCTA` into a booking sheet:
- It shows the file summary: "התיק שלכם יגיע לצוות הייעוץ".
- It creates a `consultation` lead, with the file, **before** it opens Calendly.
- It prefills the Calendly name and email, and passes the lead `ref` in `utm_content`.
- It listens for `calendly.event_scheduled` and marks the lead booked (`consult_booked`).

Keep the existing behaviour working when Supabase isn't configured.

### 3. Consult queue, "תור הייעוצים" (admin)
- Lives under `/admin/leads/` or a sibling page.
- Consultation leads are sorted by score.
- The **project-file panel** shows:
  - stage, region, m², budget, timeline;
  - the questions asked;
  - the planner estimate;
  - the source and attribution;
  - the score reasons.
- Add a status workflow and quick actions.
- This is demo wow #2: "צורי יודע מי מתקשר, מה הוא שאל ובאיזה שלב הוא — לפני שהרים טלפון".

### 4. Routing rules
- Admin-configurable rules over lead type, specialty, region, stage and score, with these targets:
  - the owner inbox;
  - forward to a business;
  - a partner campaign.
- The default reproduces today's behaviour: info@ for `lead_routing='site'`, direct for the rest.

### 5. Partners and tiers
**Data model:**
- `partner_tiers`, seeded with חברים / שותפים / שגרירים and admin-editable prices and benefits.
- `partner_subscriptions`: a business on a tier, with a status and the mock payment through the existing `PaymentProvider`.

**Tier effects:**
- Badges.
- Ordering within relevance on `/recommended/`.
- A priority boost in the pros shown by AI answers. Export `rankPros()` in `lib/directory/match.ts`; the `advisor` squad wires it at integration.

### 6. Sponsored placements
- `<PartnerOfferSlot context={{topic, stage, region}}>`, wrapped in `<ViewableImpression>`. It records `partner_impression` and `partner_click`, and links to the partner's offer or benefit page.
- Place it on video pages, articles and directory listings with minimal edits.
- Export `getContextualOffers()` for the advisor, hub and planner. That wiring happens at integration.

### 7. Pro and partner portal, `/partner-portal/` (redesign)
This is for business owners, role `pro`.
- **Their stats:**
  - profile views;
  - phone reveals;
  - leads and their statuses;
  - **intent**: questions about their category in their regions, shortlists and quote requests;
  - a review summary;
  - ranking among peers (anonymised).
- **Completeness score** with actions.
- **Tier upsell** with mock checkout.
- **"Request a quote"** (`quote_request`) on business pages becomes a lead with the project file.

### 8. "דוח שותף", the monthly partner report
- A printable page per partner per month.
- It shows the funnel from viewable exposures to clicks, then category questions, then quote requests, then leads, then **deals reported**. Partners can mark deals.
- It ends with an ROI estimate.
- Admin gets "partner health" across all partners.
- This is the automated version of the owner's own "200 לידים. 50 סגירות." case study.

### 9. Admin
- The leads inbox, upgraded: score, file and filters.
- A rules editor.
- Tiers and subscriptions management.
- Campaigns and partner reports.
- Nav entries go in `lib/admin/nav.ts`.

### 10. Demo views
Use fixtures only, and register each as `'ready'`:
- `/platform/demo/consult-queue/`: Tzuri's queue. The top lead is "score 82, stage היתר, Sharon, 220 m², ₪2.6M, asked 4 questions about aluminium".
- `/platform/demo/partner/`: a "חלונות הגליל" monthly report. 3,940 viewable exposures, then 112 builders asked about windows, then 37 quote requests, then 9 deals, for an ROI of ×6.
- `/platform/demo/pro/`: a fictional shell contractor's portal.

## Quality bar
- Run every charter gate.
- Unit tests cover scoring, routing rules, file collection, impression and attribution integration, and the tier-ordering math.
- **RLS:** a pro sees only their own business's stats and leads; a partner sees only their own reports.
- **Screenshots** (desktop and mobile): the booking sheet, the consult queue, the portal, the report and every demo view.
