-- =============================================================================
-- Migration (Wave 2): WordPress post tags + Yoast canonical fields
--
-- * post_tags / post_tag_assignments: the live site has 218 post tags
--   (/tag/<slug>/, noindex on the live site). Loaded by scripts/migrate/load.py.
-- * seo_canonical: the Yoast canonical, stored ROOT-RELATIVE (e.g. "/slug/").
--   NULL means "self" (build it from lib/site.ts as usual). Only set when the
--   crawl had one; pages should prefer absoluteUrl(seo_canonical ?? own path).
--
-- Additive and re-runnable.
-- =============================================================================

create table if not exists public.post_tags (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  seo_title       text,
  seo_description text,
  noindex         boolean not null default true,
  legacy_wp_id    bigint unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists post_tags_set_updated_at on public.post_tags;
create trigger post_tags_set_updated_at
  before update on public.post_tags
  for each row execute function public.set_updated_at();

create table if not exists public.post_tag_assignments (
  post_id    uuid not null references public.posts (id) on delete cascade,
  tag_id     uuid not null references public.post_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create index if not exists post_tag_assignments_tag_idx
  on public.post_tag_assignments (tag_id);

-- Canonical (root-relative) for every imported, routable entity.
alter table public.posts           add column if not exists seo_canonical text;
alter table public.pages           add column if not exists seo_canonical text;
alter table public.video_pages     add column if not exists seo_canonical text;
alter table public.post_categories add column if not exists seo_canonical text;
alter table public.businesses      add column if not exists seo_canonical text;
alter table public.products        add column if not exists seo_canonical text;

-- ---------------------------------------------------------------------------
-- RLS: same pattern as post_categories / post_category_assignments.
-- ---------------------------------------------------------------------------
alter table public.post_tags enable row level security;
alter table public.post_tag_assignments enable row level security;

drop policy if exists "staff all" on public.post_tags;
create policy "staff all" on public.post_tags
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public read" on public.post_tags;
create policy "public read" on public.post_tags for select using (true);

drop policy if exists "staff all" on public.post_tag_assignments;
create policy "staff all" on public.post_tag_assignments
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public read" on public.post_tag_assignments;
create policy "public read" on public.post_tag_assignments
  for select using (
    exists (select 1 from public.posts p
            where p.id = post_id
              and p.status = 'published'
              and (p.published_at is null or p.published_at <= now()))
  );

grant select on public.post_tags, public.post_tag_assignments to anon, authenticated;
grant all on public.post_tags, public.post_tag_assignments to service_role;
