-- =============================================================================
-- Parity foundation 4/7: construction-management service plans, benefits
-- shop (products + categories), orders, payments. All objects are new.
--
-- Money is stored as integer agorot (1 ILS = 100 agorot) to avoid float math.
-- Orders / order_items / payments are written ONLY by server code with the
-- service-role key (checkout + payment callbacks), so prices and payment
-- state can never be forged from the browser.
--
-- Not modelled (dropped after the live-site crawl): generic site
-- memberships (/membership-tiers/ is really the service-plan page) and
-- events (no events feature on the live site).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Service plans (/membership-tiers/ — "ניהול ופיקוח")
-- Prices are EXCLUDING VAT on the live site (vat_included = false).
-- features: rows of the comparison table, e.g.
--   [{ "category": "תקציב", "label": "תקציב בניה מקיף", "value": true }, ...]
--   value is true/false or a short text.
-- highlights: the bullet list on each plan card.
-- ---------------------------------------------------------------------------
create table if not exists public.service_plans (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  track_label           text,                  -- "מסלול 01"
  subtitle              text,                  -- "התוכנית הבסיסית"
  description_html      text,
  highlights            jsonb not null default '[]'::jsonb,
  features              jsonb not null default '[]'::jsonb,
  is_featured           boolean not null default false,
  is_purchasable_online boolean not null default false,   -- undecided: consultation-led sale for now
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists service_plans_set_updated_at on public.service_plans;
create trigger service_plans_set_updated_at
  before update on public.service_plans
  for each row execute function public.set_updated_at();

-- One plan may have several prices (e.g. by house size).
create table if not exists public.service_plan_prices (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.service_plans (id) on delete cascade,
  label        text,                           -- "לבתים עד 180 מ״ר"
  min_sqm      integer check (min_sqm is null or min_sqm >= 0),
  max_sqm      integer check (max_sqm is null or max_sqm >= 0),
  price_agorot integer not null check (price_agorot >= 0),
  currency     text not null default 'ILS',
  vat_included boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (plan_id, sort_order)
);

create index if not exists service_plan_prices_plan_idx on public.service_plan_prices (plan_id);

drop trigger if exists service_plan_prices_set_updated_at on public.service_plan_prices;
create trigger service_plan_prices_set_updated_at
  before update on public.service_plan_prices
  for each row execute function public.set_updated_at();

-- Seed the three live plans (crawl 2026-09-28). features left empty for the
-- import loader / admin (12-row comparison table in data/migration).
insert into public.service_plans (slug, name, track_label, subtitle, highlights, is_featured, sort_order) values
  ('bonim-budget', 'בונים תקציב', 'מסלול 01', 'התוכנית הבסיסית',
   '["תקציב בניה מקיף ומדויק במידול מתמטי וכמותי","מערכת ניהול תקציב דיגיטלית","כלי מעקב ובקרה תקציבית","כלי לניהול מו״מ אסטרטגי","3 ישיבות תקציב וייעוץ תכנוני","סטייה ממחירי השוק 3%–5% בלבד"]'::jsonb,
   false, 1),
  ('bonim-bait-plus', 'בונים בית פלוס', 'מסלול 02', 'התוכנית הגמישה',
   '["כל מה שנכלל בתוכנית בונים תקציב","עריכת חוברת מכרז לקבלנים","ישיבת הכנה למכרז קבלנים","בדיקת הצעות מחיר והשוואה","בקרה הנדסית דו״מ ותלת״מ","ניהול מכרזים, מו״מ, חוזים ולוחות תשלומים"]'::jsonb,
   false, 2),
  ('bonim-bait-turnkey', 'בונים בית עד מפתח', 'מסלול 03', 'התוכנית המנצחת',
   '["כל מה שנכלל בתוכנית בונים תקציב","ניהול הפרויקט מהתכנון ועד גמר — A to Z","עריכת חוברת מכרז לקבלנים","ניהול מכרזים, מו״מ, חוזים ותשלומים","תכנון הנדסי — מיזוג, מתח נמוך, חימום, בריכה, סולאריות","ניהול, בקרה ופיקוח ע״י מהנדס ביצוע"]'::jsonb,
   true, 3)
on conflict (slug) do nothing;

insert into public.service_plan_prices (plan_id, label, min_sqm, max_sqm, price_agorot, sort_order)
select p.id, v.label, v.min_sqm, v.max_sqm, v.price_agorot, v.sort_order
from (values
  ('bonim-budget',       null::text,            null::integer, null::integer,   690000, 1),
  ('bonim-bait-plus',    null,                  null,          null,           2900000, 1),
  ('bonim-bait-turnkey', 'לבתים עד 180 מ״ר',    null,          180,           13300000, 1),
  ('bonim-bait-turnkey', 'לבתים מעל 180 מ״ר',   181,           null,          14900000, 2)
) as v (plan_slug, label, min_sqm, max_sqm, price_agorot, sort_order)
join public.service_plans p on p.slug = v.plan_slug
on conflict (plan_id, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- Benefits shop ("חנות ההטבות"): product categories (/category-product/<slug>/)
-- and products (/product/<slug>/). Many live products are lead-gen benefits
-- ("מידע נוסף" + lead form) rather than purchasable: is_purchasable = false.
-- ---------------------------------------------------------------------------
create table if not exists public.product_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,          -- stored decoded
  name            text not null,
  description     text,
  parent_id       uuid references public.product_categories (id) on delete set null,
  sort_order      integer not null default 0,
  seo_title       text,
  seo_description text,
  legacy_wp_id    bigint unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists product_categories_set_updated_at on public.product_categories;
create trigger product_categories_set_updated_at
  before update on public.product_categories
  for each row execute function public.set_updated_at();

create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,       -- stored decoded; /product/<slug>/
  name               text not null,
  short_description  text,
  description_html   text,
  is_purchasable     boolean not null default true,
  price_agorot       integer not null default 0 check (price_agorot >= 0),
  sale_price_agorot  integer check (sale_price_agorot is null or sale_price_agorot >= 0),
  currency           text not null default 'ILS',
  featured_image     text,
  images             jsonb not null default '[]'::jsonb,
  sku                text unique,
  stock_quantity     integer check (stock_quantity is null or stock_quantity >= 0),  -- null = unlimited
  partner_business_id uuid references public.businesses (id) on delete set null,   -- benefit provider, if listed
  status             text not null default 'draft'
                       check (status in ('draft', 'published', 'archived')),
  sort_order         integer not null default 0,
  seo_title          text,
  seo_description    text,
  legacy_wp_id       bigint unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists products_status_idx on public.products (status, sort_order);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create table if not exists public.product_category_assignments (
  product_id  uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.product_categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index if not exists product_category_assignments_category_idx
  on public.product_category_assignments (category_id);

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
  vat_agorot       integer not null default 0 check (vat_agorot >= 0),
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
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid references public.products (id) on delete set null,
  service_plan_price_id uuid references public.service_plan_prices (id) on delete set null,
  description           text not null,           -- snapshot of the item name at purchase time
  quantity              integer not null default 1 check (quantity > 0),
  unit_price_agorot     integer not null check (unit_price_agorot >= 0),
  total_agorot          integer generated always as (quantity * unit_price_agorot) stored,
  created_at            timestamptz not null default now()
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
