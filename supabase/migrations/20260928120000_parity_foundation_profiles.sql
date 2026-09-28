-- =============================================================================
-- Parity foundation 1/7: shared helpers, WhatsApp groups, regions, profiles,
-- roles
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
-- WhatsApp community groups (live page /הצטרפו-לקבוצות-הווטסאפ/, 11 areas).
-- invite_url is lead-gated on the live site (revealed after the join form),
-- so the table is NOT publicly readable; public code reads the
-- whatsapp_groups_public view (no invite_url) and a server route reveals the
-- link after recording a 'whatsapp_join' lead.
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_groups (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- live form values (golan-galil, ...)
  name        text not null,
  invite_url  text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists whatsapp_groups_set_updated_at on public.whatsapp_groups;
create trigger whatsapp_groups_set_updated_at
  before update on public.whatsapp_groups
  for each row execute function public.set_updated_at();

insert into public.whatsapp_groups (slug, name, invite_url, sort_order) values
  ('golan-galil',     'גולן וגליל תחתון',            'https://chat.whatsapp.com/Kcvq4DD8aT9GvrOYPYEzcb', 1),
  ('galil-upper',     'גליל עליון ומערבי',           'https://chat.whatsapp.com/ChQP8R7N9NjB136qSyTg5M', 2),
  ('valleys',         'עמקים',                        'https://chat.whatsapp.com/29IqB2LdhewCkq00TQJRIc', 3),
  ('haifa',           'חיפה והקריות',                 'https://chat.whatsapp.com/C3NXyypzmnH3FVYCq7pzmg', 4),
  ('jerusalem',       'ירושלים וסביבה',               'https://chat.whatsapp.com/Ehu7ccuInsT1OZbfB1ZivL', 5),
  ('center-sharon',   'מרכז והשרון',                  'https://chat.whatsapp.com/7fTQnyRo3ViDXW300Sk83k', 6),
  ('shfela',          'השפלה',                        'https://chat.whatsapp.com/GX5O8lSHfBO4ON7ItM1hm3', 7),
  ('south-2',         'דרום - ב״ש/שדרות/נתיבות',      'https://chat.whatsapp.com/4VPigNIIiBbHBcM3eEDaza', 8),
  ('south-1',         'דרום - דימונה/ערד/אילת',       'https://chat.whatsapp.com/0WsQUlhxElPAXzlWdKG7fc', 9),
  ('yehuda-shomron',  'יהודה ושומרון',                'https://chat.whatsapp.com/6Y8P43KrpldFyg2qe9ZhS7', 10),
  ('ashkelon-ashdod', 'אשקלון/אשדוד/יבנה',            'https://chat.whatsapp.com/KID5Ra9nWsAGOtpVNZj9cb', 11)
on conflict (slug) do nothing;

-- Public projection without the invite link (views run with the owner's
-- rights, so anon can read this even though the base table is locked).
create or replace view public.whatsapp_groups_public as
  select id, slug, name, sort_order
  from public.whatsapp_groups
  where is_active;

-- ---------------------------------------------------------------------------
-- Regions — ONE master list, seeded from the live directory filter (14 incl.
-- "כל הארץ"). `aliases` holds every label the other live forms use (signup
-- 13, CF7 lead forms 14, business popup) so imports and form posts resolve
-- to a region via: slug = x OR name = x OR x = any(aliases).
-- whatsapp_group_id = the default community group for members of the region.
-- ---------------------------------------------------------------------------
create table if not exists public.regions (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  aliases           text[] not null default '{}',
  is_nationwide     boolean not null default false,   -- "כל הארץ" (directory/pro forms only)
  whatsapp_group_id uuid references public.whatsapp_groups (id) on delete set null,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists regions_set_updated_at on public.regions;
create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

-- Ordered north to south; slugs are stable identifiers used by forms
-- (apps/web/lib/constants/community.ts). Names are the directory labels.
insert into public.regions (slug, name, aliases, is_nationwide, sort_order, whatsapp_group_id) values
  ('golan',           'רמת הגולן',                  '{}',                                                  false,  1, (select id from public.whatsapp_groups where slug = 'golan-galil')),
  ('upper-galilee',   'גליל עליון',                 '{}',                                                  false,  2, (select id from public.whatsapp_groups where slug = 'galil-upper')),
  ('akko-nahariya',   'עכו - נהריה והסביבה',        '{"עכו -נהריה והסביבה","עכו - נהריה"}',                false,  3, (select id from public.whatsapp_groups where slug = 'galil-upper')),
  ('lower-galilee',   'גליל תחתון',                 '{}',                                                  false,  4, (select id from public.whatsapp_groups where slug = 'golan-galil')),
  ('haifa-krayot',    'חיפה, קריות והסביבה',        '{"חיפה"}',                                            false,  5, (select id from public.whatsapp_groups where slug = 'haifa')),
  ('zichron-valleys', 'זכרון והעמקים',              '{}',                                                  false,  6, (select id from public.whatsapp_groups where slug = 'valleys')),
  ('hadera',          'חדרה והסביבה',               '{}',                                                  false,  7, (select id from public.whatsapp_groups where slug = 'center-sharon')),
  ('sharon',          'אזור השרון',                 '{"השרון"}',                                           false,  8, (select id from public.whatsapp_groups where slug = 'center-sharon')),
  ('center',          'מרכז',                       '{"אזור מרכז"}',                                       false,  9, (select id from public.whatsapp_groups where slug = 'center-sharon')),
  ('shfela',          'שפלה',                       '{"השפלה"}',                                           false, 10, (select id from public.whatsapp_groups where slug = 'shfela')),
  ('jerusalem',       'אזור ירושלים',               '{"ירושלים"}',                                         false, 11, (select id from public.whatsapp_groups where slug = 'jerusalem')),
  ('judea-samaria',   'יהודה, שומרון ובקעת הירדן',  '{"יהודה ושומרון"}',                                   false, 12, (select id from public.whatsapp_groups where slug = 'yehuda-shomron')),
  ('south',           'אזור דרום',                  '{"דרום"}',                                            false, 13, (select id from public.whatsapp_groups where slug = 'south-2')),
  ('nationwide',      'כל הארץ',                    '{}',                                                  true,  99, null)
on conflict (slug) do nothing;

-- Resolve any live label / slug to a region id (null if unknown).
create or replace function public.resolve_region(label text)
returns uuid
language sql
stable
set search_path = public
as $$
  select r.id
  from public.regions r
  where r.slug = trim(label) or r.name = trim(label) or trim(label) = any (r.aliases)
  order by r.sort_order
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- construction_stage values mirror the live signup form:
--   land=רכישת מגרש, planning=תכנון, tender=מכרז קבלנים, frame=שלד,
--   finishing=גמרים, design=עיצוב, moving_in=כניסה לבית, renovation=שיפוץ
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
                         'land', 'planning', 'tender', 'frame',
                         'finishing', 'design', 'moving_in', 'renovation'
                       )),
  region_id          uuid references public.regions (id) on delete set null,
  whatsapp_opt_in    boolean not null default false,   -- live: "newsletter / tips" opt-in
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
-- region (slug or any live label), whatsapp_opt_in. Role is ALWAYS 'member';
-- ADMIN_EMAILS promotion happens in the app (see docs/ARCHITECTURE_PARITY.md).
-- Invalid metadata values are ignored rather than failing the signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_stage text  := meta ->> 'construction_stage';
begin
  if v_stage not in ('land', 'planning', 'tender', 'frame',
                     'finishing', 'design', 'moving_in', 'renovation') then
    v_stage := null;
  end if;

  insert into public.profiles (id, email, full_name, phone, construction_stage,
                               region_id, whatsapp_opt_in, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(meta ->> 'full_name', meta ->> 'name'),
    meta ->> 'phone',
    v_stage,
    public.resolve_region(meta ->> 'region'),
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
