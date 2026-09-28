-- =============================================================================
-- Parity foundation 1/7: shared helpers, regions, profiles, roles
--
-- Coexistence notes:
--   * Only NEW objects are created here. Nothing from apps/api (categories,
--     videos, video_segments, embeddings, analytics_events) is touched.
--   * Every statement is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT)
--     so the file can be re-run safely.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regions (14 Israeli regions used for signup + professional directory)
-- ---------------------------------------------------------------------------
create table if not exists public.regions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists regions_set_updated_at on public.regions;
create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

-- Seed, ordered north to south. Slugs are stable identifiers used by the
-- signup form (see apps/web/lib/constants/community.ts); names are editable.
insert into public.regions (slug, name, sort_order) values
  ('golan',            'רמת הגולן',                          1),
  ('upper-galilee',    'גליל עליון',                          2),
  ('lower-galilee',    'גליל תחתון ועמקים',                    3),
  ('haifa',            'חיפה והקריות',                        4),
  ('hadera-hefer',     'חדרה, חוף הכרמל ועמק חפר',             5),
  ('sharon',           'השרון',                               6),
  ('gush-dan',         'תל אביב וגוש דן',                     7),
  ('center',           'המרכז (פתח תקווה, ראש העין, מודיעין)', 8),
  ('shfela',           'השפלה (רחובות, רמלה, לוד)',           9),
  ('jerusalem',        'ירושלים והסביבה',                     10),
  ('judea-samaria',    'יהודה ושומרון',                       11),
  ('south-coast',      'אשדוד, אשקלון והסביבה',               12),
  ('negev',            'באר שבע והנגב',                       13),
  ('arava-eilat',      'הערבה ואילת',                         14)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  full_name          text,
  phone              text,
  role               text not null default 'member'
                       check (role in ('member', 'pro', 'editor', 'admin')),
  construction_stage text
                       check (construction_stage in (
                         'dreaming', 'land', 'planning', 'permits',
                         'construction', 'finishing', 'moved_in'
                       )),
  region_id          uuid references public.regions (id) on delete set null,
  whatsapp_opt_in    boolean not null default false,
  avatar_url         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_region_idx on public.profiles (region_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (used by RLS policies)
--
-- SECURITY DEFINER so policies on profiles can call them without recursion.
-- Rank: anon 0 < member 1 < pro 2 < editor 3 < admin 4.
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'anon'
    else coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'member')
  end;
$$;

create or replace function public.role_rank(role_name text)
returns integer
language sql
immutable
as $$
  select case role_name
    when 'member' then 1
    when 'pro'    then 2
    when 'editor' then 3
    when 'admin'  then 4
    else 0
  end;
$$;

create or replace function public.has_role(required text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_rank(public.app_role()) >= public.role_rank(required);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('editor');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin');
$$;

-- True when the current statement must not be constrained by the
-- column-guard triggers below: direct DB connections (no JWT, e.g. migrations,
-- the import loader, apps/api), the service-role key, and staff users.
create or replace function public.is_trusted_writer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
      or public.is_staff();
$$;

-- ---------------------------------------------------------------------------
-- Guard: only admins (or trusted writers) may change a profile's role.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), 'service_role') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only admins can change roles' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'Profile id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- ---------------------------------------------------------------------------
-- Auto-create a profile for every new auth user.
-- Reads optional signup metadata: full_name | name, phone, construction_stage,
-- region (slug), whatsapp_opt_in. Role is ALWAYS 'member' here; ADMIN_EMAILS
-- promotion happens in the app (see docs/ARCHITECTURE_PARITY.md).
-- Invalid metadata values are ignored rather than failing the signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_stage  text  := meta ->> 'construction_stage';
  v_region uuid;
begin
  if v_stage not in ('dreaming', 'land', 'planning', 'permits',
                     'construction', 'finishing', 'moved_in') then
    v_stage := null;
  end if;

  select r.id into v_region from public.regions r where r.slug = meta ->> 'region';

  insert into public.profiles (id, email, full_name, phone, construction_stage,
                               region_id, whatsapp_opt_in, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(meta ->> 'full_name', meta ->> 'name'),
    meta ->> 'phone',
    v_stage,
    v_region,
    coalesce(meta ->> 'whatsapp_opt_in', 'false') = 'true',
    meta ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
