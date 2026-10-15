-- =============================================================================
-- Advisor: member conversation threads and shared answer snapshots (apps/web lib/advisor)
--
--   advisor_threads   one row per conversation of a signed-in member
--                     (anonymous visitors keep theirs in localStorage only)
--   advisor_messages  the turns: the question, and the answer with its sources and follow-ups
--   advisor_shares    read-only snapshots behind /ask/a/<id>/, created only when a visitor
--                     taps "share" (POST /api/advisor/share checks an HMAC of the answer)
--
-- RLS
--   * threads / messages: a member reads and deletes only their own (user_id = auth.uid()).
--     Only the server writes them (the answer route, service role, with the user id from
--     the verified session), so every stored answer is one the advisor really gave and a
--     reopened answer can be signed for sharing.
--   * staff never read conversation text; they get aggregates through
--     advisor_usage_daily() (security definer, staff or service role only).
--   * advisor_shares: no API access at all. The service role writes after the HMAC
--     check and the share page reads server-side, so share ids can't be listed.
--
-- Timestamps are timestamptz, keys are UUIDs (share ids are random 16-character
-- strings: they are the capability to read a snapshot). Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- advisor_threads
-- ---------------------------------------------------------------------------
create table if not exists public.advisor_threads (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  title       text        not null check (length(title) between 1 and 300),
  turn_count  integer     not null default 0 check (turn_count >= 0),
  is_demo     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.advisor_threads is
  'Advisor conversations of signed-in members (lib/advisor/threads.ts). Owner-only RLS.';

create index if not exists advisor_threads_user_updated_idx
  on public.advisor_threads (user_id, updated_at desc);
create index if not exists advisor_threads_created_idx
  on public.advisor_threads (created_at);

-- ---------------------------------------------------------------------------
-- advisor_messages
-- ---------------------------------------------------------------------------
create table if not exists public.advisor_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.advisor_threads (id) on delete cascade,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  turn        integer     not null check (turn between 1 and 1000),
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null check (length(content) <= 20000),
  sources     jsonb       not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  followups   jsonb       not null default '[]'::jsonb check (jsonb_typeof(followups) = 'array'),
  confidence  numeric(4,3) check (confidence is null or confidence between 0 and 1),
  created_at  timestamptz not null default now()
);

comment on table public.advisor_messages is
  'Turns of advisor_threads: the question and the answer (with sources and follow-ups). Owner-only RLS.';

create index if not exists advisor_messages_thread_idx
  on public.advisor_messages (thread_id, turn, created_at);
create index if not exists advisor_messages_created_idx
  on public.advisor_messages (created_at);

-- A message must belong to a thread of the same user. RLS covers members; this also
-- holds for trusted writers (service role, migrations).
create or replace function public.advisor_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.advisor_threads t
     where t.id = new.thread_id and t.user_id = new.user_id
  ) then
    raise exception 'advisor_messages: thread % does not belong to this user', new.thread_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists advisor_messages_guard on public.advisor_messages;
create trigger advisor_messages_guard
  before insert or update on public.advisor_messages
  for each row execute function public.advisor_messages_guard();

-- Every new message bumps its thread (sorting "recent conversations").
create or replace function public.advisor_messages_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.advisor_threads
     set updated_at = now(),
         turn_count = greatest(turn_count, new.turn)
   where id = new.thread_id;
  return null;
end;
$$;

drop trigger if exists advisor_messages_touch_thread on public.advisor_messages;
create trigger advisor_messages_touch_thread
  after insert on public.advisor_messages
  for each row execute function public.advisor_messages_touch_thread();

-- ---------------------------------------------------------------------------
-- RLS: members read and delete their own; only the service role writes
-- ---------------------------------------------------------------------------
alter table public.advisor_threads enable row level security;
alter table public.advisor_messages enable row level security;

drop policy if exists advisor_threads_owner_select on public.advisor_threads;
create policy advisor_threads_owner_select on public.advisor_threads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists advisor_threads_owner_delete on public.advisor_threads;
create policy advisor_threads_owner_delete on public.advisor_threads
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists advisor_messages_owner_select on public.advisor_messages;
create policy advisor_messages_owner_select on public.advisor_messages
  for select to authenticated using (user_id = auth.uid());

drop policy if exists advisor_messages_owner_delete on public.advisor_messages;
create policy advisor_messages_owner_delete on public.advisor_messages
  for delete to authenticated using (user_id = auth.uid());

-- No insert/update policies: members can't write answers into a thread.
drop policy if exists advisor_threads_owner_insert on public.advisor_threads;
drop policy if exists advisor_threads_owner_update on public.advisor_threads;
drop policy if exists advisor_messages_owner_insert on public.advisor_messages;

revoke all on table public.advisor_threads from anon, authenticated;
revoke all on table public.advisor_messages from anon, authenticated;
grant select, delete on table public.advisor_threads to authenticated;
grant select, delete on table public.advisor_messages to authenticated;
grant all on table public.advisor_threads to service_role;
grant all on table public.advisor_messages to service_role;

-- ---------------------------------------------------------------------------
-- advisor_shares: snapshots of shared answers
-- ---------------------------------------------------------------------------
create table if not exists public.advisor_shares (
  id          text        primary key check (id ~ '^[A-HJ-NP-Za-km-z2-9]{16}$'),
  question    text        not null check (length(question) between 1 and 400),
  payload     jsonb       not null check (jsonb_typeof(payload) = 'object'),
  user_id     uuid        references public.profiles (id) on delete set null,
  is_demo     boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.advisor_shares is
  'Read-only snapshots of shared advisor answers (/ask/a/<id>/). Service role only; written after an HMAC check.';

create index if not exists advisor_shares_created_idx on public.advisor_shares (created_at);

alter table public.advisor_shares enable row level security;
-- No policies on purpose: only the service role (bypasses RLS) touches it.
revoke all on table public.advisor_shares from anon, authenticated;
grant all on table public.advisor_shares to service_role;

-- ---------------------------------------------------------------------------
-- Staff aggregates (no conversation text)
-- ---------------------------------------------------------------------------
create or replace function public.advisor_usage_daily(
  p_from timestamptz,
  p_to   timestamptz,
  p_tz   text default 'Asia/Jerusalem'
)
returns table (day date, threads bigint, questions bigint, members bigint, shares bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    raise exception 'advisor_usage_daily: staff only' using errcode = '42501';
  end if;
  return query
  with q as (
    select (m.created_at at time zone p_tz)::date as d,
           count(*)::bigint as questions,
           count(distinct m.user_id)::bigint as members
      from public.advisor_messages m
     where m.role = 'user' and m.created_at >= p_from and m.created_at < p_to
     group by 1
  ), t as (
    select (th.created_at at time zone p_tz)::date as d, count(*)::bigint as threads
      from public.advisor_threads th
     where th.created_at >= p_from and th.created_at < p_to
     group by 1
  ), s as (
    select (sh.created_at at time zone p_tz)::date as d, count(*)::bigint as shares
      from public.advisor_shares sh
     where sh.created_at >= p_from and sh.created_at < p_to
     group by 1
  ), days as (
    select q.d from q union select t.d from t union select s.d from s
  )
  select days.d,
         coalesce(t.threads, 0),
         coalesce(q.questions, 0),
         coalesce(q.members, 0),
         coalesce(s.shares, 0)
    from days
    left join q on q.d = days.d
    left join t on t.d = days.d
    left join s on s.d = days.d
   order by days.d;
end;
$$;

revoke all on function public.advisor_usage_daily(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.advisor_usage_daily(timestamptz, timestamptz, text) to authenticated, service_role;
