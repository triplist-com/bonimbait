-- =============================================================================
-- Parity foundation 4/7: events, membership tiers, products, orders,
-- payments, memberships, event registrations. All objects are new.
--
-- Money is stored as integer agorot (1 ILS = 100 agorot) to avoid float math.
-- Orders / order_items / payments / memberships are written ONLY by server
-- code with the service-role key (checkout + payment callbacks), so prices
-- and payment state can never be forged from the browser.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Events / conferences
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  excerpt           text,
  description_html  text,
  featured_image    text,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  location_name     text,
  address           text,
  is_online         boolean not null default false,
  online_url        text,
  capacity          integer check (capacity is null or capacity > 0),
  price_agorot      integer not null default 0 check (price_agorot >= 0),
  currency          text not null default 'ILS',
  registration_open boolean not null default true,
  status            text not null default 'draft'
                      check (status in ('draft', 'published', 'cancelled', 'archived')),
  seo_title         text,
  seo_description   text,
  legacy_wp_id      bigint unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists events_status_starts_idx on public.events (status, starts_at);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership tiers (member plans and professional listing plans)
-- ---------------------------------------------------------------------------
create table if not exists public.membership_tiers (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description_html text,
  benefits         jsonb not null default '[]'::jsonb,   -- ["...", "..."]
  audience         text not null default 'member' check (audience in ('member', 'pro')),
  price_agorot     integer not null default 0 check (price_agorot >= 0),
  currency         text not null default 'ILS',
  billing_period   text not null default 'yearly'
                     check (billing_period in ('one_time', 'monthly', 'yearly')),
  duration_days    integer check (duration_days is null or duration_days > 0),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists membership_tiers_set_updated_at on public.membership_tiers;
create trigger membership_tiers_set_updated_at
  before update on public.membership_tiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Products (benefits shop)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,       -- stored decoded; /product/<slug>/
  name               text not null,
  short_description  text,
  description_html   text,
  product_type       text not null default 'simple'
                       check (product_type in ('simple', 'membership', 'event_ticket', 'service')),
  membership_tier_id uuid references public.membership_tiers (id) on delete set null,
  event_id           uuid references public.events (id) on delete set null,
  price_agorot       integer not null default 0 check (price_agorot >= 0),
  sale_price_agorot  integer check (sale_price_agorot is null or sale_price_agorot >= 0),
  currency           text not null default 'ILS',
  featured_image     text,
  images             jsonb not null default '[]'::jsonb,
  sku                text unique,
  stock_quantity     integer check (stock_quantity is null or stock_quantity >= 0),  -- null = unlimited
  status             text not null default 'draft'
                       check (status in ('draft', 'published', 'archived')),
  sort_order         integer not null default 0,
  seo_title          text,
  seo_description    text,
  legacy_wp_id       bigint unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists products_status_idx on public.products (status);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     bigint generated always as identity (start with 10001) unique,
  member_id        uuid references public.profiles (id) on delete set null,  -- null = guest
  customer_name    text not null,
  customer_email   text not null,
  customer_phone   text,
  status           text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  subtotal_agorot  integer not null default 0 check (subtotal_agorot >= 0),
  discount_agorot  integer not null default 0 check (discount_agorot >= 0),
  total_agorot     integer not null default 0 check (total_agorot >= 0),
  currency         text not null default 'ILS',
  billing          jsonb not null default '{}'::jsonb,
  notes            text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists orders_member_idx on public.orders (member_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  product_id         uuid references public.products (id) on delete set null,
  membership_tier_id uuid references public.membership_tiers (id) on delete set null,
  event_id           uuid references public.events (id) on delete set null,
  description        text not null,           -- snapshot of the product name at purchase time
  quantity           integer not null default 1 check (quantity > 0),
  unit_price_agorot  integer not null check (unit_price_agorot >= 0),
  total_agorot       integer generated always as (quantity * unit_price_agorot) stored,
  created_at         timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Payments (one order may have several attempts)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  provider      text not null check (provider in ('mock', 'upay')),
  provider_ref  text,
  status        text not null default 'pending'
                  check (status in ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
  amount_agorot integer not null check (amount_agorot >= 0),
  currency      text not null default 'ILS',
  raw           jsonb,                          -- last provider payload (callback / webhook)
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);
create unique index if not exists payments_provider_ref_key
  on public.payments (provider, provider_ref) where provider_ref is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Memberships (a member's purchased tier; pro tiers may point at a business)
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles (id) on delete cascade,
  tier_id     uuid not null references public.membership_tiers (id) on delete restrict,
  business_id uuid references public.businesses (id) on delete set null,
  order_id    uuid references public.orders (id) on delete set null,
  status      text not null default 'pending'
                check (status in ('pending', 'active', 'expired', 'cancelled')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists memberships_member_idx on public.memberships (member_id, status);

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Event registrations
-- ---------------------------------------------------------------------------
create table if not exists public.event_registrations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  member_id  uuid references public.profiles (id) on delete set null,  -- null = guest (server-created)
  full_name  text not null,
  email      text not null,
  phone      text,
  attendees  integer not null default 1 check (attendees between 1 and 20),
  status     text not null default 'registered'
               check (status in ('registered', 'waitlisted', 'cancelled', 'attended')),
  order_id   uuid references public.orders (id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_registrations_event_idx on public.event_registrations (event_id, status);
create unique index if not exists event_registrations_one_per_member_key
  on public.event_registrations (event_id, member_id) where member_id is not null;

drop trigger if exists event_registrations_set_updated_at on public.event_registrations;
create trigger event_registrations_set_updated_at
  before update on public.event_registrations
  for each row execute function public.set_updated_at();

-- Guard: members register themselves only, and may only register or cancel
-- (never mark 'attended', never attach an order).
create or replace function public.event_registrations_guard()
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
    new.member_id := auth.uid();
    new.status    := 'registered';
    new.order_id  := null;
  else
    new.member_id := old.member_id;
    new.event_id  := old.event_id;
    new.order_id  := old.order_id;
    if new.status not in ('registered', 'cancelled') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_registrations_guard on public.event_registrations;
create trigger event_registrations_guard
  before insert or update on public.event_registrations
  for each row execute function public.event_registrations_guard();
