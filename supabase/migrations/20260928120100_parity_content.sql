-- =============================================================================
-- Parity foundation 2/7: content — posts, post categories, pages, legacy
-- video pages
--
-- Coexistence with apps/api (Alembic) tables:
--   * public.categories = VIDEO categories owned by apps/api. It is NOT reused
--     for WordPress post categories (different taxonomy, different slugs).
--     Post categories live in the new table public.post_categories.
--   * public.videos     = indexed YouTube videos owned by apps/api. It is NOT
--     altered. Legacy WordPress video pages (188, only 37 of which match an
--     indexed video) live in the new table public.video_pages, keyed by
--     legacy_slug, with a nullable link to videos.
--   * The CREATE TABLE IF NOT EXISTS for categories/videos only mirrors the
--     Alembic shape so the video_pages FK also works on a fresh project; on
--     the shared DB both statements are no-ops.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Existing apps/api tables (no-op when already present)
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
-- Authors (/author/<slug>/ archives exist on the live site — 3 URLs)
-- ---------------------------------------------------------------------------
create table if not exists public.authors (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  bio_html     text,
  avatar_url   text,
  legacy_wp_id bigint unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists authors_set_updated_at on public.authors;
create trigger authors_set_updated_at
  before update on public.authors
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
  author_id           uuid references public.authors (id) on delete set null,
  legacy_wp_id        bigint unique,
  created_by          uuid references public.profiles (id) on delete set null,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists posts_status_published_idx on public.posts (status, published_at desc);
create index if not exists posts_primary_category_idx on public.posts (primary_category_id);
create index if not exists posts_author_idx on public.posts (author_id);

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
  slug               text not null unique,       -- full path without outer slashes, e.g. 'strategic-partners/thank-you'
  title              text not null,
  content_html       text not null default '',
  excerpt            text,
  featured_image     text,
  featured_image_alt text,
  seo_title          text,
  seo_description    text,
  noindex            boolean not null default false,
  template           text,                        -- renderer hint (e.g. 'landing', 'thank-you')
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

-- ---------------------------------------------------------------------------
-- Legacy video pages (/video/<hebrew-slug>/). Render from their own content
-- whether or not an indexed video exists. youtube_ids may hold several ids
-- (one page embeds 10). video_id links the primary indexed video when known.
-- ---------------------------------------------------------------------------
create table if not exists public.video_pages (
  id                  uuid primary key default gen_random_uuid(),
  legacy_slug         text not null unique,       -- stored decoded
  title               text not null,
  body_html           text not null default '',
  excerpt             text,
  featured_image      text,
  youtube_ids         text[] not null default '{}',
  related_youtube_ids text[] not null default '{}',
  video_id            uuid references public.videos (id) on delete set null,
  kind                text not null default 'video' check (kind in ('video', 'podcast')),
  author_name         text,
  legacy_categories   jsonb not null default '[]'::jsonb,   -- [{ "name", "slug" }] from category-video
  seo_title           text,
  seo_description     text,
  noindex             boolean not null default false,
  status              text not null default 'draft'
                        check (status in ('draft', 'pending', 'published', 'archived')),
  published_at        timestamptz,
  legacy_wp_id        bigint unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists video_pages_status_idx on public.video_pages (status, published_at desc);
create index if not exists video_pages_video_idx on public.video_pages (video_id);
create index if not exists video_pages_youtube_ids_idx on public.video_pages using gin (youtube_ids);

drop trigger if exists video_pages_set_updated_at on public.video_pages;
create trigger video_pages_set_updated_at
  before update on public.video_pages
  for each row execute function public.set_updated_at();
