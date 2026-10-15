-- =============================================================================
-- Hub 1/3: "הבית שלי · תיק פרויקט" (P2 Builder Hub): the project workspace
--
-- A builder's free personal workspace, from plot to keys. Everything hangs off
-- a project, and access is by project membership only:
--
--   hub_projects          The project profile: stage, region, m², budget range,
--                         target move-in month. One per member for now (the
--                         app uses the latest active one), but many are
--                         allowed: P7 managed projects, a second house.
--   hub_project_members   role owner | manager. The creator becomes the owner
--                         (trigger). Managers (P7 Bonim.Os) are added by
--                         trusted server code only (service role): there is
--                         no self-service sharing yet.
--   hub_checklist_state   Ticked roadmap items (ids from lib/hub/content.ts).
--   hub_budget_versions   The planned budget, versioned: v1 is the first
--                         estimate (calculator or budget planner); P7 adds
--                         approved budgets v2, v3... ("budget vs actual").
--   hub_budget_items      Planned lines (per version), quotes and actuals, by
--                         category (lib/hub/budget.ts maps them to stages).
--   hub_saved_items       Videos, articles, pros (the shortlist) and answers.
--   hub_documents         Plans, permits, quotes: rows for the files in the
--                         private hub-docs bucket (20261014121100).
--   hub_tasks             A simple todo list with due dates.
--
-- RLS: project members only. There is deliberately NO "staff full access"
-- policy on these tables: the owner's staff get aggregates only, through the
-- security-definer RPCs in 20261014121200, and never see documents. A staff
-- member sees a project only when they are one of its members (their own
-- house, or P7's assigned manager). The service role bypasses RLS (server
-- code in apps/web/lib/hub/server.ts).
--
-- Conventions: UUID PKs, timestamptz, money as integer agorot (bigint), stage
-- ids = lib/stages.ts BuildStage['id']:
--   purchase | planning | permit | frame | infrastructure | finishing | moving-in
-- Idempotent: if not exists / or replace / drop ... if exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The service role, or a direct DB connection (migrations, scripts): the only
-- writers allowed to bypass the hub guards. Stricter than is_trusted_writer(),
-- which also trusts staff: staff must not write into members' projects.
create or replace function public.hub_is_service()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table if not exists public.hub_projects (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references auth.users (id) on delete cascade,
  title             text check (title is null or char_length(title) between 1 and 80),
  stage             text check (stage in ('purchase', 'planning', 'permit', 'frame',
                                          'infrastructure', 'finishing', 'moving-in')),
  region_id         uuid references public.regions (id) on delete set null,
  size_m2           integer check (size_m2 between 30 and 2000),
  budget_min_agorot bigint check (budget_min_agorot between 0 and 100000000000),
  budget_max_agorot bigint check (budget_max_agorot between 0 and 100000000000),
  -- First day of the target move-in month (ProjectFile.targetMoveIn = 'YYYY-MM').
  target_move_in    date check (target_move_in = date_trunc('month', target_move_in)::date),
  -- 'managed' = P7 Bonim.Os client (set by the service after a plan purchase).
  mode              text not null default 'self' check (mode in ('self', 'managed')),
  status            text not null default 'active' check (status in ('active', 'completed', 'archived')),
  onboarded_at      timestamptz,
  -- Where the profile came from: 'onboarding' | 'local_import' | 'signup' | ...
  source            text check (source is null or char_length(source) <= 40),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint hub_projects_budget_order check (
    budget_min_agorot is null or budget_max_agorot is null or budget_min_agorot <= budget_max_agorot
  )
);

comment on table public.hub_projects is
  'Builder Hub projects (P2). RLS: project members only; staff get aggregates via hub_staff_aggregates().';

create index if not exists hub_projects_created_by_idx on public.hub_projects (created_by, updated_at desc);
create index if not exists hub_projects_onboarded_idx on public.hub_projects (onboarded_at)
  where onboarded_at is not null;

drop trigger if exists hub_projects_set_updated_at on public.hub_projects;
create trigger hub_projects_set_updated_at
  before update on public.hub_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Members (owner | manager)
-- ---------------------------------------------------------------------------
create table if not exists public.hub_project_members (
  project_id uuid not null references public.hub_projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'manager')),
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists hub_project_members_user_idx on public.hub_project_members (user_id, role);
-- Exactly one owner per project (the trigger below adds it).
create unique index if not exists hub_project_members_one_owner
  on public.hub_project_members (project_id) where role = 'owner';

-- Membership checks for RLS. SECURITY DEFINER so policies on
-- hub_project_members itself don't recurse. They only reveal the caller's own
-- membership.
create or replace function public.hub_project_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.hub_project_members m
  where m.project_id = p_project and m.user_id = auth.uid();
$$;

create or replace function public.hub_is_project_member(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hub_project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
  );
$$;

-- Guard: members create projects for themselves, in self mode, at most 5
-- active ones; the creator and the mode can't be changed by API users.
create or replace function public.hub_projects_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.hub_is_service() then
      if auth.uid() is null then
        raise exception 'Sign in to create a project' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
      new.mode := 'self';
      if (select count(*) from public.hub_projects p
          where p.created_by = new.created_by and p.status = 'active') >= 5 then
        raise exception 'Project limit reached' using errcode = '54000';
      end if;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.created_by is distinct from old.created_by then
    raise exception 'A project''s id and creator are immutable' using errcode = '42501';
  end if;
  if new.mode is distinct from old.mode and not public.hub_is_service() then
    raise exception 'Managed mode is set by the service' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists hub_projects_guard on public.hub_projects;
create trigger hub_projects_guard
  before insert or update on public.hub_projects
  for each row execute function public.hub_projects_guard();

-- The creator is the owner, on every write path (API, service role, scripts).
create or replace function public.hub_projects_add_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hub_project_members (project_id, user_id, role, added_by)
  values (new.id, new.created_by, 'owner', new.created_by)
  on conflict (project_id, user_id) do nothing;
  return null;
end;
$$;

drop trigger if exists hub_projects_add_owner on public.hub_projects;
create trigger hub_projects_add_owner
  after insert on public.hub_projects
  for each row execute function public.hub_projects_add_owner();

-- ---------------------------------------------------------------------------
-- Child tables: shared guard + row caps
-- ---------------------------------------------------------------------------

-- project_id is immutable; for API users the actor column (tg_argv[0]) is
-- always auth.uid(): on insert, and on update too when tg_argv[1] = 'always'.
create or replace function public.hub_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'project_id is immutable' using errcode = '42501';
  end if;
  if not public.hub_is_service() and (tg_op = 'INSERT' or coalesce(tg_argv[1], '') = 'always') then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid()));
  end if;
  return new;
end;
$$;

-- At most tg_argv[0] rows per project (abuse guard; generous for real use).
create or replace function public.hub_row_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from %I.%I where project_id = $1', tg_table_schema, tg_table_name)
    into v_count using new.project_id;
  if v_count >= tg_argv[0]::bigint then
    raise exception 'Too many rows in % for this project', tg_table_name using errcode = '54000';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checklist state (roadmap items)
-- ---------------------------------------------------------------------------
create table if not exists public.hub_checklist_state (
  project_id uuid not null references public.hub_projects (id) on delete cascade,
  -- '<stage>.<item>', e.g. 'permit.compare-quotes' (lib/hub/content.ts).
  item_id    text not null check (item_id ~ '^[a-z][a-z-]*\.[a-z0-9][a-z0-9-]*$' and char_length(item_id) <= 80),
  done       boolean not null default true,
  done_at    timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, item_id)
);

drop trigger if exists hub_checklist_state_set_updated_at on public.hub_checklist_state;
create trigger hub_checklist_state_set_updated_at
  before update on public.hub_checklist_state
  for each row execute function public.set_updated_at();

drop trigger if exists hub_checklist_state_guard on public.hub_checklist_state;
create trigger hub_checklist_state_guard
  before insert or update on public.hub_checklist_state
  for each row execute function public.hub_child_guard('updated_by', 'always');

drop trigger if exists hub_checklist_state_cap on public.hub_checklist_state;
create trigger hub_checklist_state_cap
  before insert on public.hub_checklist_state
  for each row execute function public.hub_row_cap('500');

-- ---------------------------------------------------------------------------
-- Budget: versions of the plan, and items (planned lines, quotes, actuals)
-- ---------------------------------------------------------------------------
create table if not exists public.hub_budget_versions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.hub_projects (id) on delete cascade,
  version_no       integer not null check (version_no between 1 and 999),
  label            text not null check (char_length(label) between 1 and 80),
  -- Where the planned numbers came from.
  basis            text not null default 'manual' check (basis in ('calculator', 'planner', 'manual', 'quotes')),
  total_min_agorot bigint check (total_min_agorot between 0 and 100000000000),
  total_max_agorot bigint check (total_max_agorot between 0 and 100000000000),
  -- Calculator / planner inputs behind the estimate (no personal data).
  inputs           jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  -- Why this version exists ("אחרי מכרז הקבלנים"): P7's change log.
  note             text check (note is null or char_length(note) <= 500),
  is_current       boolean not null default false,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint hub_budget_versions_no unique (project_id, version_no),
  constraint hub_budget_versions_project unique (id, project_id),
  constraint hub_budget_versions_range check (
    total_min_agorot is null or total_max_agorot is null or total_min_agorot <= total_max_agorot
  )
);

create unique index if not exists hub_budget_versions_current
  on public.hub_budget_versions (project_id) where is_current;

drop trigger if exists hub_budget_versions_guard on public.hub_budget_versions;
create trigger hub_budget_versions_guard
  before insert or update on public.hub_budget_versions
  for each row execute function public.hub_child_guard('created_by');

drop trigger if exists hub_budget_versions_cap on public.hub_budget_versions;
create trigger hub_budget_versions_cap
  before insert on public.hub_budget_versions
  for each row execute function public.hub_row_cap('100');

create table if not exists public.hub_budget_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.hub_projects (id) on delete cascade,
  -- Set for 'planned' lines only: the plan is versioned, quotes and payments are facts.
  version_id    uuid,
  kind          text not null check (kind in ('planned', 'quote', 'actual')),
  -- lib/hub/budget.ts BUDGET_CATEGORIES (each belongs to one of the 7 stages).
  category      text not null check (category in ('design', 'fees', 'frame', 'systems', 'envelope', 'windows',
                                                  'plaster', 'flooring', 'carpentry', 'sanitary', 'outdoor',
                                                  'moving', 'other')),
  label         text check (label is null or char_length(label) <= 120),
  amount_agorot bigint not null check (amount_agorot between 0 and 100000000000),
  vendor        text check (vendor is null or char_length(vendor) <= 120),
  business_id   uuid references public.businesses (id) on delete set null,
  -- quote: open | accepted | rejected; actual: paid. (P7 may extend.)
  status        text check (status is null or status in ('open', 'accepted', 'rejected', 'paid')),
  occurred_on   date,
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint hub_budget_items_version foreign key (version_id, project_id)
    references public.hub_budget_versions (id, project_id) on delete cascade,
  constraint hub_budget_items_planned_version check ((kind = 'planned') = (version_id is not null))
);

create index if not exists hub_budget_items_project_idx on public.hub_budget_items (project_id, kind);
create index if not exists hub_budget_items_version_idx on public.hub_budget_items (version_id) where version_id is not null;

drop trigger if exists hub_budget_items_set_updated_at on public.hub_budget_items;
create trigger hub_budget_items_set_updated_at
  before update on public.hub_budget_items
  for each row execute function public.set_updated_at();

drop trigger if exists hub_budget_items_guard on public.hub_budget_items;
create trigger hub_budget_items_guard
  before insert or update on public.hub_budget_items
  for each row execute function public.hub_child_guard('created_by');

drop trigger if exists hub_budget_items_cap on public.hub_budget_items;
create trigger hub_budget_items_cap
  before insert on public.hub_budget_items
  for each row execute function public.hub_row_cap('2000');

-- New current budget version, atomically: bumps version_no, moves is_current,
-- and adds its planned lines ([{category, amount_agorot, label?}]).
-- SECURITY INVOKER: RLS decides (project members only).
create or replace function public.hub_new_budget_version(
  p_project   uuid,
  p_label     text,
  p_basis     text,
  p_total_min bigint,
  p_total_max bigint,
  p_inputs    jsonb default '{}'::jsonb,
  p_note      text  default null,
  p_planned   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_no integer;
  v_id uuid;
begin
  -- Serialise version numbers per project (the row lock needs update rights).
  perform 1 from public.hub_projects where id = p_project for update;
  if not found then
    raise exception 'Project not found' using errcode = '42501';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_no
  from public.hub_budget_versions where project_id = p_project;

  update public.hub_budget_versions set is_current = false
  where project_id = p_project and is_current;

  insert into public.hub_budget_versions
    (project_id, version_no, label, basis, total_min_agorot, total_max_agorot, inputs, note, is_current)
  values
    (p_project, v_no, p_label, p_basis, p_total_min, p_total_max, coalesce(p_inputs, '{}'::jsonb), p_note, true)
  returning id into v_id;

  insert into public.hub_budget_items (project_id, version_id, kind, category, label, amount_agorot)
  select p_project, v_id, 'planned', x ->> 'category', nullif(x ->> 'label', ''), (x ->> 'amount_agorot')::bigint
  from jsonb_array_elements(coalesce(p_planned, '[]'::jsonb)) as x;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved items (polymorphic): video (YouTube id), video_page (legacy slug),
-- post (slug), business (id: the shortlist), answer (the question).
-- ---------------------------------------------------------------------------
create table if not exists public.hub_saved_items (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hub_projects (id) on delete cascade,
  kind       text not null check (kind in ('video', 'video_page', 'post', 'business', 'answer')),
  ref        text not null check (char_length(ref) between 1 and 300),
  -- Display snapshot (the source may be renamed or unpublished later).
  title      text check (title is null or char_length(title) <= 300),
  meta       jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4096),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hub_saved_items_unique unique (project_id, kind, ref),
  constraint hub_saved_items_business_ref check (
    kind <> 'business' or ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create index if not exists hub_saved_items_project_idx on public.hub_saved_items (project_id, created_at desc);

drop trigger if exists hub_saved_items_guard on public.hub_saved_items;
create trigger hub_saved_items_guard
  before insert or update on public.hub_saved_items
  for each row execute function public.hub_child_guard('created_by');

drop trigger if exists hub_saved_items_cap on public.hub_saved_items;
create trigger hub_saved_items_cap
  before insert on public.hub_saved_items
  for each row execute function public.hub_row_cap('1000');

-- ---------------------------------------------------------------------------
-- Documents (files live in storage bucket hub-docs at <project_id>/<file>)
-- ---------------------------------------------------------------------------
create table if not exists public.hub_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.hub_projects (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 160),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp',
                                                  'image/heic', 'image/heif')),
  size_bytes   integer not null check (size_bytes between 1 and 10485760),
  category     text not null default 'other' check (category in ('plans', 'permit', 'quote', 'contract', 'receipt',
                                                               'photo', 'other')),
  stage        text check (stage in ('purchase', 'planning', 'permit', 'frame', 'infrastructure', 'finishing', 'moving-in')),
  -- Caption or note (P7's site-photo feed uses it as the caption).
  note         text check (note is null or char_length(note) <= 300),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- '<project_id>/<one file name>' inside the bucket, nothing else.
  constraint hub_documents_path check (
    storage_path like project_id::text || '/%'
    and position('/' in substr(storage_path, 38)) = 0
    and char_length(storage_path) between 38 and 200
  )
);

create index if not exists hub_documents_project_idx on public.hub_documents (project_id, created_at desc);

drop trigger if exists hub_documents_guard on public.hub_documents;
create trigger hub_documents_guard
  before insert or update on public.hub_documents
  for each row execute function public.hub_child_guard('uploaded_by');

drop trigger if exists hub_documents_cap on public.hub_documents;
create trigger hub_documents_cap
  before insert on public.hub_documents
  for each row execute function public.hub_row_cap('100');

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table if not exists public.hub_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.hub_projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  due_on      date,
  done        boolean not null default false,
  done_at     timestamptz,
  stage       text check (stage in ('purchase', 'planning', 'permit', 'frame', 'infrastructure', 'finishing', 'moving-in')),
  -- P7: a task the manager assigns to a member of the project.
  assigned_to uuid references auth.users (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hub_tasks_project_idx on public.hub_tasks (project_id, done, due_on);

drop trigger if exists hub_tasks_set_updated_at on public.hub_tasks;
create trigger hub_tasks_set_updated_at
  before update on public.hub_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists hub_tasks_guard on public.hub_tasks;
create trigger hub_tasks_guard
  before insert or update on public.hub_tasks
  for each row execute function public.hub_child_guard('created_by');

drop trigger if exists hub_tasks_cap on public.hub_tasks;
create trigger hub_tasks_cap
  before insert on public.hub_tasks
  for each row execute function public.hub_row_cap('500');

-- ---------------------------------------------------------------------------
-- RLS: project members only (no staff policy, see the header)
-- ---------------------------------------------------------------------------
alter table public.hub_projects        enable row level security;
alter table public.hub_project_members enable row level security;
alter table public.hub_checklist_state enable row level security;
alter table public.hub_budget_versions enable row level security;
alter table public.hub_budget_items    enable row level security;
alter table public.hub_saved_items     enable row level security;
alter table public.hub_documents       enable row level security;
alter table public.hub_tasks           enable row level security;

-- Projects: the creator sees it at once (insert ... returning), members always.
drop policy if exists "hub members read" on public.hub_projects;
create policy "hub members read" on public.hub_projects
  for select to authenticated
  using (created_by = (select auth.uid()) or public.hub_is_project_member(id));

drop policy if exists "hub create own" on public.hub_projects;
create policy "hub create own" on public.hub_projects
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "hub members update" on public.hub_projects;
create policy "hub members update" on public.hub_projects
  for update to authenticated
  using (public.hub_is_project_member(id))
  with check (public.hub_is_project_member(id));

drop policy if exists "hub owner delete" on public.hub_projects;
create policy "hub owner delete" on public.hub_projects
  for delete to authenticated
  using (public.hub_project_role(id) = 'owner');

-- Members: co-members see each other. Only the service adds members; the owner
-- (or the manager themself) can remove a manager.
drop policy if exists "hub members read" on public.hub_project_members;
create policy "hub members read" on public.hub_project_members
  for select to authenticated
  using (public.hub_is_project_member(project_id));

drop policy if exists "hub remove manager" on public.hub_project_members;
create policy "hub remove manager" on public.hub_project_members
  for delete to authenticated
  using (
    role = 'manager'
    and (public.hub_project_role(project_id) = 'owner' or user_id = (select auth.uid()))
  );

-- Child tables: members read and write their project's rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'hub_checklist_state', 'hub_budget_versions', 'hub_budget_items',
    'hub_saved_items', 'hub_documents', 'hub_tasks'
  ] loop
    execute format('drop policy if exists "hub members access" on public.%I', t);
    execute format(
      'create policy "hub members access" on public.%I for all to authenticated '
      'using (public.hub_is_project_member(project_id)) '
      'with check (public.hub_is_project_member(project_id))', t);
  end loop;
end;
$$;

-- Defence in depth on top of RLS: anonymous visitors never touch hub tables
-- (their workspace lives in localStorage until they sign up).
revoke all on table
  public.hub_projects, public.hub_project_members, public.hub_checklist_state,
  public.hub_budget_versions, public.hub_budget_items, public.hub_saved_items,
  public.hub_documents, public.hub_tasks
from anon;

grant select, insert, update, delete on table
  public.hub_projects, public.hub_checklist_state, public.hub_budget_versions,
  public.hub_budget_items, public.hub_saved_items, public.hub_documents, public.hub_tasks
to authenticated;
grant select, delete on table public.hub_project_members to authenticated;
revoke insert, update on table public.hub_project_members from authenticated;
-- RLS does not cover TRUNCATE; API roles never need these.
revoke truncate, references, trigger on table
  public.hub_projects, public.hub_project_members, public.hub_checklist_state,
  public.hub_budget_versions, public.hub_budget_items, public.hub_saved_items,
  public.hub_documents, public.hub_tasks
from authenticated;

grant all on table
  public.hub_projects, public.hub_project_members, public.hub_checklist_state,
  public.hub_budget_versions, public.hub_budget_items, public.hub_saved_items,
  public.hub_documents, public.hub_tasks
to service_role;

revoke all on function public.hub_new_budget_version(uuid, text, text, bigint, bigint, jsonb, text, jsonb) from public, anon;
grant execute on function public.hub_new_budget_version(uuid, text, text, bigint, bigint, jsonb, text, jsonb)
  to authenticated, service_role;
