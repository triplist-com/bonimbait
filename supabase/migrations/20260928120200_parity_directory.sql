-- =============================================================================
-- Parity foundation 3/7: professionals directory — specialties, businesses,
-- reviews. All objects are new.
-- =============================================================================

create table if not exists public.specialties (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
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
-- Businesses ("נבחרת המומלצים")
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,        -- stored decoded; keeps WP slug
  name             text not null,
  tagline          text,
  description_html text,
  region_id        uuid references public.regions (id) on delete set null,  -- primary region
  city             text,
  address          text,
  phone            text,
  whatsapp         text,
  email            text,
  website          text,
  logo_url         text,
  cover_image_url  text,
  gallery          jsonb not null default '[]'::jsonb,   -- [{ "url": "...", "alt": "..." }]
  social_links     jsonb not null default '{}'::jsonb,   -- { "facebook": "...", "instagram": "..." }
  owner_member_id  uuid references public.profiles (id) on delete set null,
  tier             text not null default 'free'
                     check (tier in ('free', 'basic', 'premium')),
  status           text not null default 'draft'
                     check (status in ('draft', 'pending', 'published', 'suspended')),
  is_featured      boolean not null default false,
  sort_order       integer not null default 0,
  seo_title        text,
  seo_description  text,
  legacy_wp_id     bigint unique,
  legacy_url       text,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists businesses_status_idx on public.businesses (status);
create index if not exists businesses_region_idx on public.businesses (region_id);
create index if not exists businesses_owner_idx on public.businesses (owner_member_id);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- Guard: pros (owners) may edit their listing content, but not moderation /
-- billing fields. Non-trusted inserts are forced into the moderation queue.
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
    new.is_featured     := false;
    new.sort_order      := 0;
    new.legacy_wp_id    := null;
    new.published_at    := null;
  else
    new.slug            := old.slug;
    new.owner_member_id := old.owner_member_id;
    new.status          := old.status;
    new.tier            := old.tier;
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

-- Many-to-many: businesses <-> specialties
create table if not exists public.business_specialties (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  specialty_id uuid not null references public.specialties (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (business_id, specialty_id)
);
create index if not exists business_specialties_specialty_idx
  on public.business_specialties (specialty_id);

-- Many-to-many: businesses <-> regions they serve (in addition to region_id)
create table if not exists public.business_regions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  region_id   uuid not null references public.regions (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (business_id, region_id)
);
create index if not exists business_regions_region_idx on public.business_regions (region_id);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  member_id    uuid references public.profiles (id) on delete set null,
  author_name  text not null,
  rating       smallint not null check (rating between 1 and 5),
  title        text,
  body         text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  source       text not null default 'member'
                 check (source in ('migrated', 'member')),
  legacy_id    text,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reviews_business_status_idx on public.reviews (business_id, status);
create unique index if not exists reviews_one_per_member_key
  on public.reviews (business_id, member_id) where member_id is not null;

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

-- Aggregate rating per business (approved reviews only). security_invoker
-- makes the view obey the caller's RLS on reviews.
create or replace view public.business_review_stats
with (security_invoker = true) as
  select
    r.business_id,
    count(*)::integer                  as review_count,
    round(avg(r.rating)::numeric, 2)   as rating_avg
  from public.reviews r
  where r.status = 'approved'
  group by r.business_id;
