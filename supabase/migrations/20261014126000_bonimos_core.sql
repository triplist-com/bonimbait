-- =============================================================================
-- Bonim.Os 1/2 (P7): "מערכת הליווי ללקוחות הניהול", the hub's managed-client mode
--
-- Builds on the hub (20261014121000_hub_core.sql). A managed project is a
-- hub_projects row with mode = 'managed'. Its client is the project owner, and
-- its project managers are hub_project_members rows with role = 'manager'
-- (added by the service only, from /admin/bonimos/). Everything here is scoped
-- by that membership:
--
--   bonimos_managers          The roster of the owner's project managers and
--                             supervisors: the name, title and phone their
--                             clients see. Written by the service only.
--   bonimos_milestones        The Gantt-lite schedule, per stage, with planned
--                             and actual dates. Managers edit; clients read.
--   bonimos_payment_requests  Contractor payment requests (amount, milestone,
--                             attachment) and their state machine:
--                               pending_review -> pending_client -> approved -> paid
--                             plus rejected and cancelled; a client can send a
--                             request back to review. A workflow and a log:
--                             no money moves anywhere.
--   bonimos_payment_events    The append-only audit log of every request.
--   bonimos_photos            The site-photo feed (bucket bonimos-photos, 126100).
--   bonimos_activity          The project's activity log and notes. Members
--                             write notes; every other row comes from triggers.
--
-- Who sees what (tests/bonimos/rls.test.ts runs this matrix on the local stack):
--   anon                     nothing
--   the client (owner)       their own project only
--   a manager                the projects assigned to them only
--   staff (editor, admin)    nothing unless assigned. The hub's aggregates stay
--                            the only staff view; admins assign managers
--                            through the service role after requireRole('admin').
--
-- Separation of duties is enforced here, not only in the UI. Only a manager
-- reviews a payment request, and only the client approves it. Nobody edits a
-- request or the audit log directly: every change goes through the SECURITY
-- DEFINER RPCs below, and each one writes its event in the same transaction.
-- A paid request becomes an 'actual' line in hub_budget_items, so the budget
-- follows the approvals.
--
-- Conventions: UUID PKs, timestamptz, money as integer agorot (bigint), stage
-- ids from lib/stages.ts, categories from lib/hub/budget.ts. Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Today in Israel (dates in this schema are local calendar dates).
create or replace function public.bonimos_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Jerusalem')::date;
$$;

-- The stage a budget category is paid in (lib/hub/budget.ts BUDGET_CATEGORIES).
create or replace function public.bonimos_category_stage(p_category text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_category
    when 'design' then 'planning'
    when 'fees' then 'permit'
    when 'frame' then 'frame'
    when 'systems' then 'infrastructure'
    when 'envelope' then 'infrastructure'
    when 'windows' then 'finishing'
    when 'plaster' then 'finishing'
    when 'flooring' then 'finishing'
    when 'carpentry' then 'finishing'
    when 'sanitary' then 'finishing'
    when 'outdoor' then 'moving-in'
    when 'moving' then 'moving-in'
  end;
$$;

-- Internal: is the project in managed mode? (Used by the activity triggers.)
create or replace function public.bonimos_is_managed(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.hub_projects p where p.id = p_project and p.mode = 'managed');
$$;

-- Does the caller share a project with p_user? (A client sees their manager's
-- roster card.) Only reveals the caller's own projects.
create or replace function public.bonimos_shares_project(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hub_project_members mine
    join public.hub_project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- The manager roster
-- ---------------------------------------------------------------------------
create table if not exists public.bonimos_managers (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  title        text not null default 'מנהל/ת פרויקט' check (char_length(title) between 2 and 60),
  phone        text check (phone is null or phone ~ '^\+?[0-9][0-9 -]{6,18}$'),
  active       boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.bonimos_managers is
  'Bonim.Os (P7) project managers and supervisors. Service-written (/admin/bonimos/); read by the manager, admins and their clients.';

drop trigger if exists bonimos_managers_set_updated_at on public.bonimos_managers;
create trigger bonimos_managers_set_updated_at
  before update on public.bonimos_managers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Milestones (Gantt-lite: planned vs actual, by stage)
-- ---------------------------------------------------------------------------
create table if not exists public.bonimos_milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.hub_projects (id) on delete cascade,
  stage         text not null check (stage in ('purchase', 'planning', 'permit', 'frame',
                                                'infrastructure', 'finishing', 'moving-in')),
  title         text not null check (char_length(title) between 2 and 120),
  planned_start date not null,
  planned_end   date not null,
  actual_start  date,
  actual_end    date,
  note          text check (note is null or char_length(note) <= 300),
  sort_order    integer not null default 0 check (sort_order between 0 and 10000),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bonimos_milestones_planned check (planned_start <= planned_end),
  constraint bonimos_milestones_actual check (
    actual_end is null or (actual_start is not null and actual_start <= actual_end)
  )
);

create index if not exists bonimos_milestones_project_idx
  on public.bonimos_milestones (project_id, planned_end, sort_order);

drop trigger if exists bonimos_milestones_set_updated_at on public.bonimos_milestones;
create trigger bonimos_milestones_set_updated_at
  before update on public.bonimos_milestones
  for each row execute function public.set_updated_at();

-- created_by on insert, updated_by on every write (always the caller for API users).
drop trigger if exists bonimos_milestones_guard_created on public.bonimos_milestones;
create trigger bonimos_milestones_guard_created
  before insert or update on public.bonimos_milestones
  for each row execute function public.hub_child_guard('created_by');

drop trigger if exists bonimos_milestones_guard_updated on public.bonimos_milestones;
create trigger bonimos_milestones_guard_updated
  before insert or update on public.bonimos_milestones
  for each row execute function public.hub_child_guard('updated_by', 'always');

drop trigger if exists bonimos_milestones_cap on public.bonimos_milestones;
create trigger bonimos_milestones_cap
  before insert on public.bonimos_milestones
  for each row execute function public.hub_row_cap('200');

-- ---------------------------------------------------------------------------
-- Payment requests and their audit log
-- ---------------------------------------------------------------------------
create table if not exists public.bonimos_payment_requests (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.hub_projects (id) on delete cascade,
  -- Per project: "בקשת תשלום #3".
  number           integer not null check (number between 1 and 100000),
  contractor       text not null check (char_length(contractor) between 2 and 120),
  title            text not null check (char_length(title) between 2 and 160),
  category         text not null check (category in ('design', 'fees', 'frame', 'systems', 'envelope', 'windows',
                                                     'plaster', 'flooring', 'carpentry', 'sanitary', 'outdoor',
                                                     'moving', 'other')),
  stage            text check (stage in ('purchase', 'planning', 'permit', 'frame', 'infrastructure',
                                         'finishing', 'moving-in')),
  milestone_id     uuid references public.bonimos_milestones (id) on delete set null,
  -- The contractor's invoice or payment demand (a hub_documents row of the project).
  attachment_id    uuid references public.hub_documents (id) on delete set null,
  requested_agorot bigint not null check (requested_agorot between 100 and 100000000000),
  -- Set by the manager's review: may be lower than requested, never higher.
  approved_agorot  bigint check (approved_agorot is null or approved_agorot between 100 and 100000000000),
  status           text not null default 'pending_review'
                   check (status in ('pending_review', 'pending_client', 'approved', 'paid', 'rejected', 'cancelled')),
  due_on           date,
  paid_on          date,
  -- The 'actual' line created when it was marked paid.
  budget_item_id   uuid references public.hub_budget_items (id) on delete set null,
  note             text check (note is null or char_length(note) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bonimos_payment_requests_no unique (project_id, number),
  constraint bonimos_payment_requests_approved check (approved_agorot is null or approved_agorot <= requested_agorot),
  constraint bonimos_payment_requests_paid check ((status = 'paid') = (paid_on is not null))
);

create index if not exists bonimos_payment_requests_project_idx
  on public.bonimos_payment_requests (project_id, status, created_at desc);

drop trigger if exists bonimos_payment_requests_set_updated_at on public.bonimos_payment_requests;
create trigger bonimos_payment_requests_set_updated_at
  before update on public.bonimos_payment_requests
  for each row execute function public.set_updated_at();

drop trigger if exists bonimos_payment_requests_cap on public.bonimos_payment_requests;
create trigger bonimos_payment_requests_cap
  before insert on public.bonimos_payment_requests
  for each row execute function public.hub_row_cap('500');

create table if not exists public.bonimos_payment_events (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.bonimos_payment_requests (id) on delete cascade,
  project_id    uuid not null references public.hub_projects (id) on delete cascade,
  action        text not null check (action in ('requested', 'review_approve', 'review_reject', 'client_approve',
                                                 'client_return', 'mark_paid', 'cancel')),
  from_status   text,
  to_status     text not null,
  actor_id      uuid references auth.users (id) on delete set null,
  actor_role    text check (actor_role in ('owner', 'manager')),
  amount_agorot bigint,
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now()
);

create index if not exists bonimos_payment_events_request_idx
  on public.bonimos_payment_events (request_id, created_at);
create index if not exists bonimos_payment_events_project_idx
  on public.bonimos_payment_events (project_id, created_at desc);

-- New request (pending_review). The client or a manager records it: the
-- contractor's demand reaches either of them. SECURITY DEFINER: API users have
-- no write grants on the request tables.
create or replace function public.bonimos_request_payment(
  p_project       uuid,
  p_contractor    text,
  p_title         text,
  p_category      text,
  p_amount_agorot bigint,
  p_milestone     uuid default null,
  p_attachment    uuid default null,
  p_due_on        date default null,
  p_note          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := public.hub_project_role(p_project);
  v_mode  text;
  v_stage text;
  v_no    integer;
  v_id    uuid;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_role is null then
    raise exception 'Project not found' using errcode = '42501';
  end if;
  -- Row lock: serialises the per-project numbering.
  select p.mode into v_mode from public.hub_projects p where p.id = p_project for update;
  if v_mode is distinct from 'managed' then
    raise exception 'Payment approvals are part of a managed project' using errcode = '42501';
  end if;
  if p_milestone is not null then
    select m.stage into v_stage from public.bonimos_milestones m where m.id = p_milestone and m.project_id = p_project;
    if not found then
      raise exception 'The milestone is not part of this project' using errcode = '22023';
    end if;
  end if;
  if p_attachment is not null
     and not exists (select 1 from public.hub_documents d where d.id = p_attachment and d.project_id = p_project) then
    raise exception 'The attachment is not part of this project' using errcode = '22023';
  end if;

  select coalesce(max(r.number), 0) + 1 into v_no
  from public.bonimos_payment_requests r where r.project_id = p_project;

  insert into public.bonimos_payment_requests
    (project_id, number, contractor, title, category, stage, milestone_id, attachment_id,
     requested_agorot, due_on, note, created_by)
  values
    (p_project, v_no, btrim(p_contractor), btrim(p_title), p_category,
     coalesce(v_stage, public.bonimos_category_stage(p_category)), p_milestone, p_attachment,
     p_amount_agorot, p_due_on, v_note, auth.uid())
  returning id into v_id;

  insert into public.bonimos_payment_events
    (request_id, project_id, action, from_status, to_status, actor_id, actor_role, amount_agorot, note)
  values
    (v_id, p_project, 'requested', null, 'pending_review', auth.uid(), v_role, p_amount_agorot, v_note);

  return v_id;
end;
$$;

-- One step of the state machine (mirrored by lib/bonimos/approvals.ts):
--   review_approve  pending_review -> pending_client  manager  (amount <= requested)
--   review_reject   pending_review -> rejected        manager  (note required)
--   client_approve  pending_client -> approved        client
--   client_return   pending_client -> pending_review  client   (note required)
--   mark_paid       approved       -> paid            client or manager (adds the budget actual)
--   cancel          pending_review | pending_client -> cancelled  manager, or whoever recorded it
-- Returns the new status. A request outside the caller's projects is "not found".
create or replace function public.bonimos_payment_transition(
  p_request       uuid,
  p_action        text,
  p_amount_agorot bigint default null,
  p_note          text default null,
  p_paid_on       date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.bonimos_payment_requests%rowtype;
  v_role   text;
  v_to     text;
  v_amount bigint;
  v_paid   date;
  v_item   uuid;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.bonimos_payment_requests where id = p_request for update;
  if not found then
    raise exception 'Payment request not found' using errcode = '42501';
  end if;
  v_role := public.hub_project_role(r.project_id);
  if v_role is null then
    raise exception 'Payment request not found' using errcode = '42501';
  end if;

  if p_action = 'review_approve' then
    if v_role <> 'manager' then
      raise exception 'Only the project manager reviews a payment request' using errcode = '42501';
    end if;
    if r.status <> 'pending_review' then
      raise exception 'This request is not waiting for review' using errcode = '55000';
    end if;
    v_amount := coalesce(p_amount_agorot, r.requested_agorot);
    if v_amount < 100 or v_amount > r.requested_agorot then
      raise exception 'The approved amount must be positive and at most the requested amount' using errcode = '22023';
    end if;
    v_to := 'pending_client';
    update public.bonimos_payment_requests set status = v_to, approved_agorot = v_amount where id = r.id;

  elsif p_action = 'review_reject' then
    if v_role <> 'manager' then
      raise exception 'Only the project manager reviews a payment request' using errcode = '42501';
    end if;
    if r.status <> 'pending_review' then
      raise exception 'This request is not waiting for review' using errcode = '55000';
    end if;
    if v_note is null then
      raise exception 'Say why the request is rejected' using errcode = '22023';
    end if;
    v_to := 'rejected';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  elsif p_action = 'client_approve' then
    if v_role <> 'owner' then
      raise exception 'Only the client approves a payment' using errcode = '42501';
    end if;
    if r.status <> 'pending_client' then
      raise exception 'This request is not waiting for the client' using errcode = '55000';
    end if;
    v_amount := r.approved_agorot;
    v_to := 'approved';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  elsif p_action = 'client_return' then
    if v_role <> 'owner' then
      raise exception 'Only the client sends a request back' using errcode = '42501';
    end if;
    if r.status <> 'pending_client' then
      raise exception 'This request is not waiting for the client' using errcode = '55000';
    end if;
    if v_note is null then
      raise exception 'Say what the manager should check' using errcode = '22023';
    end if;
    v_to := 'pending_review';
    update public.bonimos_payment_requests set status = v_to, approved_agorot = null where id = r.id;

  elsif p_action = 'mark_paid' then
    if r.status <> 'approved' then
      raise exception 'Only an approved request can be marked paid' using errcode = '55000';
    end if;
    v_paid := coalesce(p_paid_on, public.bonimos_today());
    if v_paid > public.bonimos_today() or v_paid < r.created_at::date - 365 then
      raise exception 'The payment date is out of range' using errcode = '22023';
    end if;
    v_amount := r.approved_agorot;
    insert into public.hub_budget_items
      (project_id, kind, category, label, amount_agorot, vendor, status, occurred_on, note)
    values
      (r.project_id, 'actual', r.category, left(format('בקשת תשלום #%s: %s', r.number, r.title), 120),
       v_amount, left(r.contractor, 120), 'paid', v_paid, 'נרשם מאישור תשלום ב-Bonim.Os')
    returning id into v_item;
    v_to := 'paid';
    update public.bonimos_payment_requests
      set status = v_to, paid_on = v_paid, budget_item_id = v_item
      where id = r.id;

  elsif p_action = 'cancel' then
    if not (v_role = 'manager' or r.created_by = auth.uid()) then
      raise exception 'Only the manager or whoever recorded it can cancel a request' using errcode = '42501';
    end if;
    if r.status not in ('pending_review', 'pending_client') then
      raise exception 'This request can no longer be cancelled' using errcode = '55000';
    end if;
    v_to := 'cancelled';
    update public.bonimos_payment_requests set status = v_to where id = r.id;

  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  insert into public.bonimos_payment_events
    (request_id, project_id, action, from_status, to_status, actor_id, actor_role, amount_agorot, note)
  values
    (r.id, r.project_id, p_action, r.status, v_to, auth.uid(), v_role, v_amount, v_note);

  return v_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- Site photos (files in bucket bonimos-photos: '<project>/<photo>.jpg' plus a
-- '<project>/<photo>-t.jpg' thumbnail, both resized in the browser)
-- ---------------------------------------------------------------------------
create table if not exists public.bonimos_photos (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.hub_projects (id) on delete cascade,
  storage_path text not null unique,
  thumb_path   text not null unique,
  width        integer not null check (width between 16 and 4096),
  height       integer not null check (height between 16 and 4096),
  size_bytes   integer not null check (size_bytes between 1 and 4194304),
  caption      text check (caption is null or char_length(caption) <= 300),
  stage        text check (stage in ('purchase', 'planning', 'permit', 'frame', 'infrastructure',
                                     'finishing', 'moving-in')),
  taken_on     date not null default ((now() at time zone 'Asia/Jerusalem')::date),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint bonimos_photos_paths check (
    storage_path ~ ('^' || project_id::text || '/[0-9a-f-]{36}\.(jpg|webp)$')
    and thumb_path ~ ('^' || project_id::text || '/[0-9a-f-]{36}-t\.(jpg|webp)$')
  )
);

create index if not exists bonimos_photos_project_idx
  on public.bonimos_photos (project_id, taken_on desc, created_at desc);

drop trigger if exists bonimos_photos_guard on public.bonimos_photos;
create trigger bonimos_photos_guard
  before insert or update on public.bonimos_photos
  for each row execute function public.hub_child_guard('uploaded_by');

drop trigger if exists bonimos_photos_cap on public.bonimos_photos;
create trigger bonimos_photos_cap
  before insert on public.bonimos_photos
  for each row execute function public.hub_row_cap('1000');

-- ---------------------------------------------------------------------------
-- Activity log and notes
-- ---------------------------------------------------------------------------
create table if not exists public.bonimos_activity (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.hub_projects (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null default auth.uid(),
  kind       text not null default 'note'
             check (kind in ('note', 'payment', 'budget', 'milestone', 'photo', 'document', 'team', 'stage')),
  -- '<kind>.<what>': 'note.added', 'payment.client_approve', 'milestone.completed'...
  action     text not null default 'note.added'
             check (action ~ '^[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)*$' and char_length(action) <= 60),
  -- The note's text (notes only).
  body       text check (body is null or char_length(body) between 1 and 2000),
  ref_id     uuid,
  meta       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bonimos_activity_project_idx
  on public.bonimos_activity (project_id, created_at desc);

drop trigger if exists bonimos_activity_cap on public.bonimos_activity;
create trigger bonimos_activity_cap
  before insert on public.bonimos_activity
  for each row execute function public.hub_row_cap('20000');

-- Internal writer for the triggers below (never exposed to API roles).
create or replace function public.bonimos_log(
  p_project uuid,
  p_actor   uuid,
  p_kind    text,
  p_action  text,
  p_ref     uuid default null,
  p_meta    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.bonimos_activity (project_id, actor_id, kind, action, ref_id, meta)
  values (p_project, p_actor, p_kind, p_action, p_ref, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Payments: every audit event is also an activity row.
create or replace function public.bonimos_on_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.bonimos_payment_requests%rowtype;
begin
  select * into r from public.bonimos_payment_requests where id = new.request_id;
  perform public.bonimos_log(new.project_id, new.actor_id, 'payment', 'payment.' || new.action, new.request_id,
    jsonb_strip_nulls(jsonb_build_object(
      'number', r.number, 'title', r.title, 'contractor', r.contractor, 'category', r.category,
      'amount_agorot', new.amount_agorot, 'to_status', new.to_status, 'note', new.note)));
  return null;
exception when others then
  raise warning 'bonimos activity (payment) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_payment_events_activity on public.bonimos_payment_events;
create trigger bonimos_payment_events_activity
  after insert on public.bonimos_payment_events
  for each row execute function public.bonimos_on_payment_event();

-- Milestones: added, started, completed, rescheduled, removed.
create or replace function public.bonimos_on_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.bonimos_log(new.project_id, coalesce(new.created_by, auth.uid()), 'milestone', 'milestone.added', new.id,
      jsonb_build_object('title', new.title, 'stage', new.stage, 'planned_end', new.planned_end));
  elsif tg_op = 'DELETE' then
    if public.bonimos_is_managed(old.project_id) then
      perform public.bonimos_log(old.project_id, auth.uid(), 'milestone', 'milestone.removed', old.id,
        jsonb_build_object('title', old.title, 'stage', old.stage));
    end if;
  elsif old.actual_end is null and new.actual_end is not null then
    perform public.bonimos_log(new.project_id, coalesce(new.updated_by, auth.uid()), 'milestone', 'milestone.completed', new.id,
      jsonb_build_object('title', new.title, 'stage', new.stage, 'planned_end', new.planned_end,
                         'actual_end', new.actual_end, 'slip_days', new.actual_end - new.planned_end));
  elsif old.actual_start is null and new.actual_start is not null then
    perform public.bonimos_log(new.project_id, coalesce(new.updated_by, auth.uid()), 'milestone', 'milestone.started', new.id,
      jsonb_build_object('title', new.title, 'stage', new.stage, 'actual_start', new.actual_start));
  elsif new.planned_end is distinct from old.planned_end or new.planned_start is distinct from old.planned_start then
    perform public.bonimos_log(new.project_id, coalesce(new.updated_by, auth.uid()), 'milestone', 'milestone.rescheduled', new.id,
      jsonb_build_object('title', new.title, 'stage', new.stage, 'from_end', old.planned_end, 'to_end', new.planned_end));
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (milestone) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_milestones_activity on public.bonimos_milestones;
create trigger bonimos_milestones_activity
  after insert or update or delete on public.bonimos_milestones
  for each row execute function public.bonimos_on_milestone();

-- Photos: one activity row per uploader, stage and visit (3 hours), with a count.
create or replace function public.bonimos_on_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.bonimos_activity a
  where a.project_id = new.project_id
    and a.kind = 'photo'
    and a.actor_id is not distinct from new.uploaded_by
    and a.meta ->> 'stage' is not distinct from new.stage
    and a.created_at > now() - interval '3 hours'
  order by a.created_at desc
  limit 1;
  if v_id is null then
    perform public.bonimos_log(new.project_id, new.uploaded_by, 'photo', 'photo.uploaded', new.id,
      jsonb_strip_nulls(jsonb_build_object('count', 1, 'stage', new.stage, 'taken_on', new.taken_on,
                                           'caption', new.caption, 'photo_ids', jsonb_build_array(new.id))));
  else
    update public.bonimos_activity a
      set meta = a.meta
                 || jsonb_build_object('count', coalesce((a.meta ->> 'count')::int, 1) + 1)
                 || jsonb_build_object('photo_ids',
                      case when jsonb_array_length(coalesce(a.meta -> 'photo_ids', '[]'::jsonb)) < 12
                        then coalesce(a.meta -> 'photo_ids', '[]'::jsonb) || jsonb_build_array(new.id)
                        else a.meta -> 'photo_ids' end),
          updated_at = now()
      where a.id = v_id;
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (photo) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_photos_activity on public.bonimos_photos;
create trigger bonimos_photos_activity
  after insert on public.bonimos_photos
  for each row execute function public.bonimos_on_photo();

-- Hub hooks (managed projects only): a new budget version, a document, the
-- team, the stage and the mode. They never block the hub's own writes.
create or replace function public.bonimos_on_budget_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.bonimos_is_managed(new.project_id) then
    perform public.bonimos_log(new.project_id, coalesce(new.created_by, auth.uid()), 'budget', 'budget.version_created', new.id,
      jsonb_strip_nulls(jsonb_build_object('version_no', new.version_no, 'label', new.label, 'basis', new.basis,
                                           'note', new.note, 'total_min', new.total_min_agorot,
                                           'total_max', new.total_max_agorot)));
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (budget) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_budget_versions_activity on public.hub_budget_versions;
create trigger bonimos_budget_versions_activity
  after insert on public.hub_budget_versions
  for each row execute function public.bonimos_on_budget_version();

create or replace function public.bonimos_on_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.bonimos_is_managed(new.project_id) then
      perform public.bonimos_log(new.project_id, coalesce(new.uploaded_by, auth.uid()), 'document', 'document.uploaded', new.id,
        jsonb_strip_nulls(jsonb_build_object('file_name', new.file_name, 'category', new.category, 'stage', new.stage)));
    end if;
  elsif public.bonimos_is_managed(old.project_id) then
    perform public.bonimos_log(old.project_id, auth.uid(), 'document', 'document.deleted', old.id,
      jsonb_build_object('file_name', old.file_name, 'category', old.category));
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (document) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_documents_activity on public.hub_documents;
create trigger bonimos_documents_activity
  after insert or delete on public.hub_documents
  for each row execute function public.bonimos_on_document();

create or replace function public.bonimos_on_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.role <> 'manager' or not public.bonimos_is_managed(new.project_id) then
      return null;
    end if;
    select coalesce(m.display_name, nullif(btrim(p.full_name), '')) into v_name
    from public.profiles p left join public.bonimos_managers m on m.user_id = p.id
    where p.id = new.user_id;
    perform public.bonimos_log(new.project_id, coalesce(auth.uid(), new.added_by), 'team', 'team.manager_assigned', new.user_id,
      jsonb_strip_nulls(jsonb_build_object('name', v_name)));
  else
    if old.role <> 'manager' or not public.bonimos_is_managed(old.project_id) then
      return null;
    end if;
    select coalesce(m.display_name, nullif(btrim(p.full_name), '')) into v_name
    from public.profiles p left join public.bonimos_managers m on m.user_id = p.id
    where p.id = old.user_id;
    perform public.bonimos_log(old.project_id, auth.uid(), 'team', 'team.manager_removed', old.user_id,
      jsonb_strip_nulls(jsonb_build_object('name', v_name)));
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (team) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_members_activity on public.hub_project_members;
create trigger bonimos_members_activity
  after insert or delete on public.hub_project_members
  for each row execute function public.bonimos_on_member();

create or replace function public.bonimos_on_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode is distinct from old.mode then
    perform public.bonimos_log(new.id, auth.uid(), 'team',
      case when new.mode = 'managed' then 'team.managed_started' else 'team.managed_ended' end, null, '{}'::jsonb);
  end if;
  if new.mode = 'managed' and new.stage is distinct from old.stage then
    perform public.bonimos_log(new.id, auth.uid(), 'stage', 'stage.changed', null,
      jsonb_strip_nulls(jsonb_build_object('from', old.stage, 'to', new.stage)));
  end if;
  return null;
exception when others then
  raise warning 'bonimos activity (project) skipped: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists bonimos_projects_activity on public.hub_projects;
create trigger bonimos_projects_activity
  after update of mode, stage on public.hub_projects
  for each row execute function public.bonimos_on_project();

-- In a managed project, the approved budget belongs to the manager: once a
-- manager has approved a budget (basis manual or quotes), only a manager adds
-- versions. Before that the client's estimates version freely, as in the hub.
create or replace function public.bonimos_budget_version_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.hub_is_service() then
    return new;
  end if;
  if public.bonimos_is_managed(new.project_id)
     and public.hub_project_role(new.project_id) is distinct from 'manager'
     and exists (
       select 1 from public.hub_budget_versions v
       where v.project_id = new.project_id and v.basis in ('manual', 'quotes')
     ) then
    raise exception 'In a managed project the approved budget is updated by the project manager' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists bonimos_budget_version_guard on public.hub_budget_versions;
create trigger bonimos_budget_version_guard
  before insert on public.hub_budget_versions
  for each row execute function public.bonimos_budget_version_guard();

-- ---------------------------------------------------------------------------
-- People on the caller's projects: the client sees their manager's roster card
-- (name, title, phone); a manager also sees the client's phone and email.
-- ---------------------------------------------------------------------------
create or replace function public.bonimos_project_people(p_projects uuid[])
returns table (
  project_id uuid,
  user_id    uuid,
  role       text,
  name       text,
  title      text,
  phone      text,
  email      text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.project_id,
    m.user_id,
    m.role,
    case
      when m.role = 'manager' then coalesce(bm.display_name, nullif(btrim(p.full_name), ''), 'מנהל הפרויקט')
      else coalesce(nullif(btrim(p.full_name), ''), 'בעלי הבית')
    end,
    case when m.role = 'manager' then coalesce(bm.title, 'מנהל/ת פרויקט') end,
    case
      when m.role = 'manager' then bm.phone
      when me.role = 'manager' then p.phone
    end,
    case when me.role = 'manager' and m.role = 'owner' then p.email end
  from public.hub_project_members me
  join public.hub_project_members m on m.project_id = me.project_id
  left join public.profiles p on p.id = m.user_id
  left join public.bonimos_managers bm on bm.user_id = m.user_id
  where me.user_id = auth.uid()
    and me.project_id = any (coalesce(p_projects, '{}'::uuid[]))
    and cardinality(coalesce(p_projects, '{}'::uuid[])) <= 200
  order by m.project_id, m.role desc, m.created_at;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bonimos_managers         enable row level security;
alter table public.bonimos_milestones       enable row level security;
alter table public.bonimos_payment_requests enable row level security;
alter table public.bonimos_payment_events   enable row level security;
alter table public.bonimos_photos           enable row level security;
alter table public.bonimos_activity         enable row level security;

-- Roster: the manager, admins, and the people on their projects. No API writes.
drop policy if exists "bonimos roster read" on public.bonimos_managers;
create policy "bonimos roster read" on public.bonimos_managers
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or (active and public.bonimos_shares_project(user_id))
  );

-- Milestones: members read; managers write.
drop policy if exists "bonimos members read" on public.bonimos_milestones;
create policy "bonimos members read" on public.bonimos_milestones
  for select to authenticated
  using (public.hub_is_project_member(project_id));

drop policy if exists "bonimos managers insert" on public.bonimos_milestones;
create policy "bonimos managers insert" on public.bonimos_milestones
  for insert to authenticated
  with check (public.hub_project_role(project_id) = 'manager');

drop policy if exists "bonimos managers update" on public.bonimos_milestones;
create policy "bonimos managers update" on public.bonimos_milestones
  for update to authenticated
  using (public.hub_project_role(project_id) = 'manager')
  with check (public.hub_project_role(project_id) = 'manager');

drop policy if exists "bonimos managers delete" on public.bonimos_milestones;
create policy "bonimos managers delete" on public.bonimos_milestones
  for delete to authenticated
  using (public.hub_project_role(project_id) = 'manager');

-- Payment requests and their log: members read; writes only through the RPCs.
drop policy if exists "bonimos members read" on public.bonimos_payment_requests;
create policy "bonimos members read" on public.bonimos_payment_requests
  for select to authenticated
  using (public.hub_is_project_member(project_id));

drop policy if exists "bonimos members read" on public.bonimos_payment_events;
create policy "bonimos members read" on public.bonimos_payment_events
  for select to authenticated
  using (public.hub_is_project_member(project_id));

-- Photos: members read and upload; the uploader or a manager edits the caption or removes it.
drop policy if exists "bonimos members read" on public.bonimos_photos;
create policy "bonimos members read" on public.bonimos_photos
  for select to authenticated
  using (public.hub_is_project_member(project_id));

drop policy if exists "bonimos members upload" on public.bonimos_photos;
create policy "bonimos members upload" on public.bonimos_photos
  for insert to authenticated
  with check (public.hub_is_project_member(project_id));

drop policy if exists "bonimos uploader or manager update" on public.bonimos_photos;
create policy "bonimos uploader or manager update" on public.bonimos_photos
  for update to authenticated
  using (uploaded_by = (select auth.uid()) or public.hub_project_role(project_id) = 'manager')
  with check (public.hub_is_project_member(project_id));

drop policy if exists "bonimos uploader or manager delete" on public.bonimos_photos;
create policy "bonimos uploader or manager delete" on public.bonimos_photos
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.hub_project_role(project_id) = 'manager');

-- Activity: members read; members add notes (only notes, only as themselves,
-- column grants below) and delete their own notes.
drop policy if exists "bonimos members read" on public.bonimos_activity;
create policy "bonimos members read" on public.bonimos_activity
  for select to authenticated
  using (public.hub_is_project_member(project_id));

drop policy if exists "bonimos members note" on public.bonimos_activity;
create policy "bonimos members note" on public.bonimos_activity
  for insert to authenticated
  with check (
    kind = 'note' and action = 'note.added' and actor_id = (select auth.uid())
    and body is not null and ref_id is null and meta = '{}'::jsonb
    and public.hub_is_project_member(project_id)
  );

drop policy if exists "bonimos own note delete" on public.bonimos_activity;
create policy "bonimos own note delete" on public.bonimos_activity
  for delete to authenticated
  using (kind = 'note' and actor_id = (select auth.uid()) and public.hub_is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- Grants: anonymous visitors get nothing; API users get only what RLS needs.
-- ---------------------------------------------------------------------------
revoke all on table
  public.bonimos_managers, public.bonimos_milestones, public.bonimos_payment_requests,
  public.bonimos_payment_events, public.bonimos_photos, public.bonimos_activity
from anon, authenticated;

grant select on table
  public.bonimos_managers, public.bonimos_payment_requests, public.bonimos_payment_events
to authenticated;
grant select, insert, update, delete on table public.bonimos_milestones to authenticated;
grant select, insert, delete on table public.bonimos_photos to authenticated;
grant update (caption, stage, taken_on) on table public.bonimos_photos to authenticated;
grant select, delete on table public.bonimos_activity to authenticated;
grant insert (project_id, body) on table public.bonimos_activity to authenticated;

grant all on table
  public.bonimos_managers, public.bonimos_milestones, public.bonimos_payment_requests,
  public.bonimos_payment_events, public.bonimos_photos, public.bonimos_activity
to service_role;

-- Internal helpers: triggers and SECURITY DEFINER code only.
revoke all on function public.bonimos_is_managed(uuid) from public, anon, authenticated;
revoke all on function public.bonimos_log(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.bonimos_on_payment_event() from public, anon, authenticated;
revoke all on function public.bonimos_on_milestone() from public, anon, authenticated;
revoke all on function public.bonimos_on_photo() from public, anon, authenticated;
revoke all on function public.bonimos_on_budget_version() from public, anon, authenticated;
revoke all on function public.bonimos_on_document() from public, anon, authenticated;
revoke all on function public.bonimos_on_member() from public, anon, authenticated;
revoke all on function public.bonimos_on_project() from public, anon, authenticated;
revoke all on function public.bonimos_budget_version_guard() from public, anon, authenticated;

-- Policy helper (reveals only the caller's own projects).
revoke all on function public.bonimos_shares_project(uuid) from public, anon;
grant execute on function public.bonimos_shares_project(uuid) to authenticated, service_role;

-- The RPCs: signed-in members; each checks the caller's role itself.
revoke all on function public.bonimos_request_payment(uuid, text, text, text, bigint, uuid, uuid, date, text) from public, anon;
grant execute on function public.bonimos_request_payment(uuid, text, text, text, bigint, uuid, uuid, date, text)
  to authenticated, service_role;
revoke all on function public.bonimos_payment_transition(uuid, text, bigint, text, date) from public, anon;
grant execute on function public.bonimos_payment_transition(uuid, text, bigint, text, date)
  to authenticated, service_role;
revoke all on function public.bonimos_project_people(uuid[]) from public, anon;
grant execute on function public.bonimos_project_people(uuid[]) to authenticated, service_role;
