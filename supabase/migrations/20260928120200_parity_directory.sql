-- =============================================================================
-- Parity foundation 3/7: professionals directory — specialties, businesses,
-- private contact details, service regions, reviews. All objects are new.
--
-- Live-site model (crawl 2026-09-28): 158 businesses at /business/<slug>/,
-- 91 specialties (many-to-many), several "work regions" per business, no
-- public tiers. The phone is gated behind a lead popup, so contact details
-- live in business_contacts, which the public cannot read.
-- =============================================================================

create table if not exists public.specialties (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null unique,
  description     text,
  icon            text,
  sort_order      integer not null default 0,
  seo_title       text,
  seo_description text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists specialties_set_updated_at on public.specialties;
create trigger specialties_set_updated_at
  before update on public.specialties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Businesses ("נבחרת המומלצים") — public profile only, no phone/email.
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,        -- stored decoded; keeps WP slug
  name                 text not null,
  tagline              text,
  description_html     text,
  primary_specialty_id uuid references public.specialties (id) on delete set null,
  city                 text,
  address              text,
  website              text,
  logo_url             text,
  cover_image_url      text,
  gallery              jsonb not null default '[]'::jsonb,   -- [{ "url": "...", "alt": "..." }]
  social_links         jsonb not null default '{}'::jsonb,   -- { "facebook": "...", "instagram": "..." }
  extra_links          jsonb not null default '[]'::jsonb,   -- [{ "label", "url" }]
  youtube_ids          text[] not null default '{}',
  -- Lead routing: 'site' = leads go to the site inbox (info@), 'direct' =
  -- leads are forwarded to business_contacts.lead_email.
  lead_routing         text not null default 'site' check (lead_routing in ('site', 'direct')),
  owner_member_id      uuid references public.profiles (id) on delete set null,
  tier                 text not null default 'free'
                         check (tier in ('free', 'basic', 'premium')),   -- unused on the live site
  status               text not null default 'draft'
                         check (status in ('draft', 'pending', 'published', 'suspended')),
  is_featured          boolean not null default false,
  sort_order           integer not null default 0,   -- live listing order is the only ranking
  seo_title            text,
  seo_description      text,
  legacy_wp_id         bigint unique,
  legacy_url           text,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists businesses_status_order_idx on public.businesses (status, sort_order);
create index if not exists businesses_owner_idx on public.businesses (owner_member_id);
create index if not exists businesses_primary_specialty_idx on public.businesses (primary_specialty_id);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- Guard: pros (owners) may edit their listing content, but not moderation,
-- ranking, billing or lead-routing fields. Non-trusted inserts are forced
-- into the moderation queue.
create or replace function public.businesses_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.owner_member_id := auth.uid();
    new.status          := 'pending';
    new.tier            := 'free';
    new.lead_routing    := 'site';
    new.is_featured     := false;
    new.sort_order      := 0;
    new.legacy_wp_id    := null;
    new.legacy_url      := null;
    new.published_at    := null;
  else
    new.slug            := old.slug;
    new.owner_member_id := old.owner_member_id;
    new.status          := old.status;
    new.tier            := old.tier;
    new.lead_routing    := old.lead_routing;
    new.is_featured     := old.is_featured;
    new.sort_order      := old.sort_order;
    new.legacy_wp_id    := old.legacy_wp_id;
    new.legacy_url      := old.legacy_url;
    new.published_at    := old.published_at;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_guard on public.businesses;
create trigger businesses_guard
  before insert or update on public.businesses
  for each row execute function public.businesses_guard();

-- ---------------------------------------------------------------------------
-- Private contact details (1:1). NOT publicly readable: the phone is revealed
-- only by a server route after the visitor submits the lead popup
-- (lead type 'business_contact'). Owners and staff can read/edit.
-- ---------------------------------------------------------------------------
create table if not exists public.business_contacts (
  business_id  uuid primary key references public.businesses (id) on delete cascade,
  phone        text,
  whatsapp     text,            -- wa.me link or number (derived from phone on the live site)
  email        text,            -- business's public-facing email, if any
  other_phones text[] not null default '{}',
  lead_email   text,            -- where 'direct' leads are sent
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists business_contacts_set_updated_at on public.business_contacts;
create trigger business_contacts_set_updated_at
  before update on public.business_contacts
  for each row execute function public.set_updated_at();

-- Many-to-many: businesses <-> specialties
create table if not exists public.business_specialties (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  specialty_id uuid not null references public.specialties (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (business_id, specialty_id)
);
create index if not exists business_specialties_specialty_idx
  on public.business_specialties (specialty_id);

-- Many-to-many: businesses <-> work regions (may include 'nationwide')
create table if not exists public.business_regions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  region_id   uuid not null references public.regions (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (business_id, region_id)
);
create index if not exists business_regions_region_idx on public.business_regions (region_id);

-- ---------------------------------------------------------------------------
-- Reviews — live scale is 0–10 overall plus four sub-scores:
--   score_value        תמורה למחיר
--   score_availability זמינות ושירותיות
--   score_attitude     יחסי אנוש
--   score_reliability  אמינות ואיכות עבודה
-- author_name is nullable: some migrated reviews are anonymous.
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  member_id          uuid references public.profiles (id) on delete set null,
  author_name        text,
  rating             numeric(3, 1) not null check (rating >= 0 and rating <= 10),
  score_value        numeric(3, 1) check (score_value >= 0 and score_value <= 10),
  score_availability numeric(3, 1) check (score_availability >= 0 and score_availability <= 10),
  score_attitude     numeric(3, 1) check (score_attitude >= 0 and score_attitude <= 10),
  score_reliability  numeric(3, 1) check (score_reliability >= 0 and score_reliability <= 10),
  title              text,
  body               text,
  images             jsonb not null default '[]'::jsonb,
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  source             text not null default 'member'
                       check (source in ('migrated', 'member')),
  legacy_id          text,
  moderated_by       uuid references public.profiles (id) on delete set null,
  moderated_at       timestamptz,
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists reviews_business_status_idx on public.reviews (business_id, status);
create unique index if not exists reviews_one_per_member_key
  on public.reviews (business_id, member_id) where member_id is not null;
create unique index if not exists reviews_legacy_id_key
  on public.reviews (legacy_id) where legacy_id is not null;

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- Guard: member-submitted reviews always enter moderation as the caller.
create or replace function public.reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    new.member_id    := auth.uid();
    new.status       := 'pending';
    new.source       := 'member';
    new.legacy_id    := null;
    new.moderated_by := null;
    new.moderated_at := null;
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard
  before insert on public.reviews
  for each row execute function public.reviews_guard();

-- Aggregates per business (approved reviews only). rating_percent matches the
-- live "overall %" display. security_invoker makes the view obey the
-- caller's RLS on reviews.
create or replace view public.business_review_stats
with (security_invoker = true) as
  select
    r.business_id,
    count(*)::integer                             as review_count,
    round(avg(r.rating), 2)                       as rating_avg,
    round(avg(r.rating) * 10)::integer            as rating_percent,
    round(avg(r.score_value), 2)                  as score_value_avg,
    round(avg(r.score_availability), 2)           as score_availability_avg,
    round(avg(r.score_attitude), 2)               as score_attitude_avg,
    round(avg(r.score_reliability), 2)            as score_reliability_avg
  from public.reviews r
  where r.status = 'approved'
  group by r.business_id;
