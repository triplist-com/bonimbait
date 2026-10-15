-- =============================================================================
-- Revenue 2/4: partner tiers, subscriptions, sponsored campaigns, reported deals.
--
--   partner_tiers          חברים / שותפים / שגרירים. Prices seeded from the
--                          owner's public /strategic-partners/ page (₪490 /
--                          ₪1,490 / ₪2,990 a month); admin-editable, as are
--                          the benefits. `rank` drives the tier effects
--                          (ordering on /recommended/, the pros boost in answers).
--   partner_subscriptions  A business on a tier. Paid through the existing
--                          PaymentProvider (mock until UPay); written only by
--                          the server (service role) and staff.
--   partner_campaigns      Sponsored placements: targeting (topics, stages,
--                          regions, placements) and the offer shown in
--                          <PartnerOfferSlot>. Live campaigns are public.
--   partner_deals          Deals a partner reports ("סגרנו עסקה"), the last
--                          step of the monthly partner report.
--
-- Money in integer agorot, timestamps timestamptz, UUID keys. RLS on every
-- table: staff full access; a business owner reads their own rows and manages
-- their own deals; nobody else sees subscriptions or deals. Idempotent.
-- =============================================================================

-- Helpers ---------------------------------------------------------------------

-- Does the caller own this business? (SECURITY DEFINER: usable inside policies.)
create or replace function public.revenue_owns_business(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b where b.id = p_business and b.owner_member_id = auth.uid()
  );
$$;

-- Was this lead addressed or forwarded to this business?
create or replace function public.revenue_lead_belongs(p_lead uuid, p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead
      and (l.business_id = p_business or l.payload #>> '{routing,business_id}' = p_business::text)
  );
$$;

-- Tiers -------------------------------------------------------------------------

create table if not exists public.partner_tiers (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  name           text not null check (length(name) between 1 and 40),
  badge_label    text not null check (length(badge_label) between 1 and 40),
  rank           smallint not null check (rank between 1 and 9),
  price_agorot   integer not null check (price_agorot between 0 and 100000000),
  billing_period text not null default 'month' check (billing_period = 'month'),
  benefits       jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  -- Viewable impressions a partner on this tier should get per 30 days (partner health pace).
  monthly_impression_target integer check (monthly_impression_target is null or monthly_impression_target >= 0),
  is_active      boolean not null default true,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.partner_tiers add column if not exists monthly_impression_target integer;
alter table public.partner_tiers drop constraint if exists partner_tiers_monthly_impression_target_check;
alter table public.partner_tiers add constraint partner_tiers_monthly_impression_target_check
  check (monthly_impression_target is null or monthly_impression_target >= 0);

comment on column public.partner_tiers.rank is 'Priority weight (1 = חברים ... 3 = שגרירים): ordering within relevance on /recommended/ and the pros boost in answers.';
comment on column public.partner_tiers.monthly_impression_target is 'Viewable impressions per 30 days the tier promises (partner health in the command center and the partner report).';

drop trigger if exists partner_tiers_set_updated_at on public.partner_tiers;
create trigger partner_tiers_set_updated_at
  before update on public.partner_tiers
  for each row execute function public.set_updated_at();

insert into public.partner_tiers (slug, name, badge_label, rank, price_agorot, monthly_impression_target, benefits, sort_order) values
  ('members', 'חברים', 'חבר בונים בית', 1, 49000, 1500,
   '["פרופיל מורחב בנבחרת המומלצים", "תג חבר בונים בית בכרטיס העסק", "דוח חשיפות ופניות חודשי", "הטבה ייעודית בעמוד ההטבות"]'::jsonb, 1),
  ('partners', 'שותפים', 'שותף בונים בית', 2, 149000, 5000,
   '["כל מה שבמסלול חברים", "קדימות בסדר ההופעה בנבחרת המומלצים", "קדימות בהמלצות על בעלי מקצוע בתשובות באתר", "באנרים בעמודי הבלוג והעמודים העסקיים", "מאמר תוכן מקצועי"]'::jsonb, 2),
  ('ambassadors', 'שגרירים', 'שגריר בונים בית', 3, 299000, 12000,
   '["כל מה שבמסלול שותפים", "קדימות עליונה בנבחרת ובתשובות באתר", "פרק פודקאסט וסרטון ייעודי", "באנר בעמוד הבית", "הפניה פרונטלית בפגישות תקציב ובשטח"]'::jsonb, 3)
on conflict (slug) do nothing;

-- Tiers created before the target column: fill the default targets once.
update public.partner_tiers t
   set monthly_impression_target = v.target
  from (values ('members', 1500), ('partners', 5000), ('ambassadors', 12000)) as v(slug, target)
 where t.slug = v.slug and t.monthly_impression_target is null;

-- Subscriptions ---------------------------------------------------------------

create table if not exists public.partner_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  tier_id            uuid not null references public.partner_tiers (id) on delete restrict,
  status             text not null default 'pending'
                       check (status in ('pending', 'active', 'past_due', 'cancelled')),
  price_agorot       integer not null check (price_agorot between 0 and 100000000),  -- locked at purchase
  started_at         timestamptz,
  current_period_end timestamptz,
  cancelled_at       timestamptz,
  provider           text check (provider in ('mock', 'upay', 'manual')),
  provider_ref       text check (provider_ref is null or length(provider_ref) <= 200),
  last_payment_at    timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  note               text check (note is null or length(note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- At most one live subscription per business; abandoned checkouts stay 'pending'.
create unique index if not exists partner_subscriptions_one_live
  on public.partner_subscriptions (business_id) where status in ('active', 'past_due');
create unique index if not exists partner_subscriptions_provider_ref_key
  on public.partner_subscriptions (provider, provider_ref) where provider_ref is not null;
create index if not exists partner_subscriptions_status_idx on public.partner_subscriptions (status, business_id);

drop trigger if exists partner_subscriptions_set_updated_at on public.partner_subscriptions;
create trigger partner_subscriptions_set_updated_at
  before update on public.partner_subscriptions
  for each row execute function public.set_updated_at();

-- Campaigns (sponsored placements) --------------------------------------------

create table if not exists public.partner_campaigns (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (length(name) between 2 and 120),
  status       text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at    timestamptz,
  ends_at      timestamptz,
  -- Targeting: an empty array matches everything.
  topics       text[] not null default '{}',   -- lib/revenue/topics.ts keys
  stages       text[] not null default '{}',   -- lib/stages.ts ids
  region_slugs text[] not null default '{}',   -- regions.slug
  placements   text[] not null default '{}',   -- video | article | directory | answer | hub | planner
  -- The offer.
  headline     text not null check (length(headline) between 2 and 120),
  body         text check (body is null or length(body) <= 400),
  cta_label    text not null default 'לפרטים' check (length(cta_label) between 1 and 40),
  target_url   text not null check (target_url ~ '^/' and target_url !~ '^//' and length(target_url) <= 500),
  product_id   uuid references public.products (id) on delete set null,
  image_url    text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 1000)),
  priority     smallint not null default 0 check (priority between -100 and 100),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint partner_campaigns_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists partner_campaigns_status_idx on public.partner_campaigns (status, business_id);

drop trigger if exists partner_campaigns_set_updated_at on public.partner_campaigns;
create trigger partner_campaigns_set_updated_at
  before update on public.partner_campaigns
  for each row execute function public.set_updated_at();

-- Reported deals ----------------------------------------------------------------

create table if not exists public.partner_deals (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  lead_id      uuid references public.leads (id) on delete set null,
  value_agorot bigint check (value_agorot is null or value_agorot between 0 and 100000000000),
  closed_on    date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  note         text check (note is null or length(note) <= 500),
  reported_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One deal per lead.
create unique index if not exists partner_deals_lead_key on public.partner_deals (lead_id) where lead_id is not null;
create index if not exists partner_deals_business_idx on public.partner_deals (business_id, closed_on desc);

drop trigger if exists partner_deals_set_updated_at on public.partner_deals;
create trigger partner_deals_set_updated_at
  before update on public.partner_deals
  for each row execute function public.set_updated_at();

-- Who reported it is always the caller (staff and the server may set it).
create or replace function public.partner_deals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    new.reported_by := auth.uid();
    if tg_op = 'UPDATE' then
      new.business_id := old.business_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists partner_deals_guard on public.partner_deals;
create trigger partner_deals_guard
  before insert or update on public.partner_deals
  for each row execute function public.partner_deals_guard();

-- RLS -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['public.partner_tiers', 'public.partner_subscriptions', 'public.partner_campaigns', 'public.partner_deals'] loop
    execute format('alter table %s enable row level security', t);
    execute format('drop policy if exists "staff full access" on %s', t);
    execute format(
      'create policy "staff full access" on %s for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end;
$$;

-- Tiers are public (the portal upsell and the partners page show prices).
drop policy if exists "public read active" on public.partner_tiers;
create policy "public read active" on public.partner_tiers for select using (is_active);

-- Subscriptions: the business owner reads their own; writes are server/staff only.
drop policy if exists "owner read" on public.partner_subscriptions;
create policy "owner read" on public.partner_subscriptions
  for select to authenticated using (public.revenue_owns_business(business_id));

-- Campaigns: live ones are public (rendered for every visitor); owners read their own.
drop policy if exists "public read live" on public.partner_campaigns;
create policy "public read live" on public.partner_campaigns
  for select using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
drop policy if exists "owner read" on public.partner_campaigns;
create policy "owner read" on public.partner_campaigns
  for select to authenticated using (public.revenue_owns_business(business_id));

-- Deals: the owner manages their own, only for leads that reached their business.
drop policy if exists "owner read" on public.partner_deals;
create policy "owner read" on public.partner_deals
  for select to authenticated using (public.revenue_owns_business(business_id));
drop policy if exists "owner insert" on public.partner_deals;
create policy "owner insert" on public.partner_deals
  for insert to authenticated with check (
    public.revenue_owns_business(business_id)
    and (lead_id is null or public.revenue_lead_belongs(lead_id, business_id))
  );
drop policy if exists "owner update" on public.partner_deals;
create policy "owner update" on public.partner_deals
  for update to authenticated
  using (public.revenue_owns_business(business_id))
  with check (
    public.revenue_owns_business(business_id)
    and (lead_id is null or public.revenue_lead_belongs(lead_id, business_id))
  );
drop policy if exists "owner delete" on public.partner_deals;
create policy "owner delete" on public.partner_deals
  for delete to authenticated using (public.revenue_owns_business(business_id));

-- Public badges: which published business is on which tier. Subscriptions
-- themselves stay private (price, provider, dates); this view exposes only
-- what every visitor sees on a business card. Owner-privileged like
-- whatsapp_groups_public, so it works for anonymous ISR pages.
create or replace view public.partner_badges as
  select s.business_id, t.slug as tier_slug, t.name as tier_name, t.badge_label, t.rank
  from public.partner_subscriptions s
  join public.partner_tiers t on t.id = s.tier_id
  join public.businesses b on b.id = s.business_id
  where s.status in ('active', 'past_due') and t.is_active and b.status = 'published';

grant select on public.partner_badges to anon, authenticated;
grant select on public.partner_tiers, public.partner_campaigns to anon, authenticated;
grant select on public.partner_subscriptions to authenticated;
grant select, insert, update, delete on public.partner_deals to authenticated;
grant insert, update, delete on public.partner_tiers, public.partner_subscriptions, public.partner_campaigns to authenticated;
