-- =============================================================================
-- Parity foundation 2/7: content — posts, post categories, pages, videos
--
-- Coexistence with apps/api (Alembic) tables:
--   * public.categories  = VIDEO categories owned by apps/api. It is NOT reused
--     for WordPress post categories (different taxonomy, different slugs).
--     Post categories live in the new table public.post_categories.
--   * public.videos      = existing table (YouTube videos, UUID id, unique
--     youtube_id). We EXTEND it with nullable/defaulted columns only. The
--     CREATE TABLE IF NOT EXISTS below mirrors the Alembic shape so a fresh
--     project also works; on the shared DB it is a no-op.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Existing tables (no-op when already present)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  name_he        text not null,
  slug           text not null unique,
  description_he text,
  icon           text,
  created_at     timestamp not null default now()
);

create table if not exists public.videos (
  id               uuid primary key default gen_random_uuid(),
  youtube_id       text not null unique,
  title            text not null,
  description      text,
  duration_seconds integer not null,
  thumbnail_url    text,
  published_at     timestamptz,
  category_id      uuid references public.categories (id),
  transcript_text  text,
  summary          text,
  key_points       jsonb,
  costs_data       jsonb,
  created_at       timestamp not null default now(),
  updated_at       timestamp not null default now()
);

-- Alembic creates videos.id without a DB default (Python generates it).
-- Adding a default is additive and lets the admin/loader insert from SQL.
alter table public.videos alter column id set default gen_random_uuid();

-- New, additive columns for WordPress parity.
alter table public.videos add column if not exists legacy_slug     text;   -- old /video/<hebrew-slug>/ (stored decoded)
alter table public.videos add column if not exists legacy_wp_id    bigint;
alter table public.videos add column if not exists kind            text not null default 'video';
alter table public.videos add column if not exists status          text not null default 'published';
alter table public.videos add column if not exists content_html    text;   -- body of the old WP video page
alter table public.videos add column if not exists seo_title       text;
alter table public.videos add column if not exists seo_description text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'videos_kind_check') then
    alter table public.videos add constraint videos_kind_check
      check (kind in ('video', 'podcast'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'videos_status_check') then
    alter table public.videos add constraint videos_status_check
      check (status in ('draft', 'published', 'archived'));
  end if;
end;
$$;

create unique index if not exists videos_legacy_slug_key
  on public.videos (legacy_slug) where legacy_slug is not null;
create unique index if not exists videos_legacy_wp_id_key
  on public.videos (legacy_wp_id) where legacy_wp_id is not null;

-- ---------------------------------------------------------------------------
-- Post categories (the 14 WordPress construction-stage categories).
-- Not seeded: the migration loader imports them with their WP slugs.
-- ---------------------------------------------------------------------------
create table if not exists public.post_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,          -- stored decoded
  name            text not null,
  description     text,
  parent_id       uuid references public.post_categories (id) on delete set null,
  sort_order      integer not null default 0,
  seo_title       text,
  seo_description text,
  legacy_wp_id    bigint unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists post_categories_set_updated_at on public.post_categories;
create trigger post_categories_set_updated_at
  before update on public.post_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts (articles/guides served at /<slug>/)
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,      -- stored decoded (Hebrew allowed)
  title               text not null,
  content_html        text not null default '',
  excerpt             text,
  featured_image      text,
  featured_image_alt  text,
  seo_title           text,
  seo_description     text,
  noindex             boolean not null default false,
  status              text not null default 'draft'
                        check (status in ('draft', 'pending', 'published', 'archived')),
  published_at        timestamptz,
  primary_category_id uuid references public.post_categories (id) on delete set null,
  author_name         text,
  legacy_wp_id        bigint unique,
  created_by          uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists posts_status_published_idx on public.posts (status, published_at desc);
create index if not exists posts_primary_category_idx on public.posts (primary_category_id);

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Many-to-many: posts <-> post_categories
create table if not exists public.post_category_assignments (
  post_id     uuid not null references public.posts (id) on delete cascade,
  category_id uuid not null references public.post_categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, category_id)
);

create index if not exists post_category_assignments_category_idx
  on public.post_category_assignments (category_id);

-- ---------------------------------------------------------------------------
-- Pages (static WP pages: about, terms, sales pages, ...). Also root-level,
-- so the catch-all resolves pages before posts (see ARCHITECTURE_PARITY.md).
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,       -- full path without slashes for nested pages, e.g. 'about/team'
  title              text not null,
  content_html       text not null default '',
  excerpt            text,
  featured_image     text,
  featured_image_alt text,
  seo_title          text,
  seo_description    text,
  noindex            boolean not null default false,
  template           text,                        -- optional renderer hint (e.g. 'landing')
  parent_id          uuid references public.pages (id) on delete set null,
  sort_order         integer not null default 0,
  status             text not null default 'draft'
                       check (status in ('draft', 'pending', 'published', 'archived')),
  published_at       timestamptz,
  legacy_wp_id       bigint unique,
  created_by         uuid references public.profiles (id) on delete set null,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists pages_status_idx on public.pages (status);

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();
