-- =============================================================================
-- Foundation 1/2: first-party analytics (platform_events) + dashboard rollups
--
-- * A NEW table. The legacy apps/api `analytics_events` table is not touched.
-- * Writes: the service role only (POST /api/track and trackServer() in
--   apps/web/lib/analytics). No API role may insert, update or delete.
-- * Reads: staff (editor/admin) through RLS. anon and members see nothing.
-- * The rollup view and RPCs are SECURITY INVOKER, so they inherit the table's
--   RLS: staff get numbers, everyone else gets empty results.
-- * Days are bucketed in Israel time (Asia/Jerusalem) unless p_tz says otherwise.
-- * A "visitor" is anon_id (first-party cookie), falling back to session_id.
-- * Idempotent: if not exists / or replace / drop ... if exists.
-- =============================================================================

create table if not exists public.platform_events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  name        text not null,                    -- catalog name (lib/analytics/events.ts)
  anon_id     uuid,                             -- bb_aid cookie (first-party, set by /api/track)
  session_id  uuid,                             -- bb_sid cookie (30 min sliding)
  user_id     uuid references auth.users (id) on delete set null,
  path        text,                             -- pathname only, no query string
  referrer    text,                             -- origin + pathname (external) or pathname (internal)
  utm         jsonb not null default '{}'::jsonb,
  props       jsonb not null default '{}'::jsonb,  -- validated against the catalog; never PII
  ip_hash     text,                             -- salted SHA-256 (lib/leads/spam.ts hashIp)
  device      text,
  is_demo     boolean not null default false,   -- /platform/* traffic (pitch site, demo views)
  constraint platform_events_name_format check (name ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint platform_events_device_check
    check (device is null or device in ('mobile', 'desktop', 'tablet', 'bot')),
  constraint platform_events_utm_object check (jsonb_typeof(utm) = 'object'),
  constraint platform_events_props_object check (jsonb_typeof(props) = 'object')
);

comment on table public.platform_events is
  'First-party analytics events (apps/web lib/analytics). Service-role writes, staff reads.';

-- Daily counts / funnels filter by name and time.
create index if not exists platform_events_name_occurred_idx
  on public.platform_events (name, occurred_at desc);
-- Period scans across all names (unique visitors). Append-mostly, so BRIN is tiny.
create index if not exists platform_events_occurred_brin
  on public.platform_events using brin (occurred_at);
-- Per-visitor timelines.
create index if not exists platform_events_anon_occurred_idx
  on public.platform_events (anon_id, occurred_at)
  where anon_id is not null;
-- Per-member timelines (hub), and the ON DELETE SET NULL of auth.users.
create index if not exists platform_events_user_occurred_idx
  on public.platform_events (user_id, occurred_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: no public access. Staff read; only the service role (bypasses RLS) writes.
-- ---------------------------------------------------------------------------
alter table public.platform_events enable row level security;

drop policy if exists "staff read" on public.platform_events;
create policy "staff read" on public.platform_events
  for select to authenticated
  using ((select public.is_staff()));

-- Defence in depth on top of RLS: API roles never write, anon never reads.
revoke all on table public.platform_events from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_events from authenticated;
grant select on table public.platform_events to authenticated;
grant all on table public.platform_events to service_role;

-- ---------------------------------------------------------------------------
-- Rollup view: events / visitors / sessions per Israel day, name and demo flag.
-- ---------------------------------------------------------------------------
create or replace view public.platform_events_daily
with (security_invoker = true) as
select
  (e.occurred_at at time zone 'Asia/Jerusalem')::date      as day,
  e.name,
  e.is_demo,
  count(*)::bigint                                           as events,
  count(distinct coalesce(e.anon_id, e.session_id))::bigint  as visitors,
  count(distinct e.session_id)::bigint                       as sessions
from public.platform_events e
group by 1, 2, 3;

revoke all on public.platform_events_daily from anon;
grant select on public.platform_events_daily to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: daily counts by name over [p_from, p_to).
--   select * from platform_daily_counts(now() - interval '30 days', now(), array['page_view']);
-- ---------------------------------------------------------------------------
create or replace function public.platform_daily_counts(
  p_from         timestamptz,
  p_to           timestamptz,
  p_names        text[]  default null,
  p_include_demo boolean default false,
  p_tz           text    default 'Asia/Jerusalem'
)
returns table (day date, name text, events bigint, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (e.occurred_at at time zone p_tz)::date                as day,
         e.name                                                  as name,
         count(*)::bigint                                        as events,
         count(distinct coalesce(e.anon_id, e.session_id))::bigint as visitors
  from public.platform_events e
  where e.occurred_at >= p_from
    and e.occurred_at < p_to
    and (p_names is null or e.name = any (p_names))
    and (p_include_demo or not e.is_demo)
  group by 1, 2
  order by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: unique visitors over a period (one row), and per day.
-- ---------------------------------------------------------------------------
create or replace function public.platform_unique_visitors(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_demo boolean default false
)
returns table (visitors bigint, sessions bigint, page_views bigint, events bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct coalesce(e.anon_id, e.session_id))::bigint,
         count(distinct e.session_id)::bigint,
         count(*) filter (where e.name = 'page_view')::bigint,
         count(*)::bigint
  from public.platform_events e
  where e.occurred_at >= p_from
    and e.occurred_at < p_to
    and (p_include_demo or not e.is_demo);
$$;

create or replace function public.platform_unique_visitors_daily(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_demo boolean default false,
  p_tz           text    default 'Asia/Jerusalem'
)
returns table (day date, visitors bigint, sessions bigint, page_views bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (e.occurred_at at time zone p_tz)::date,
         count(distinct coalesce(e.anon_id, e.session_id))::bigint,
         count(distinct e.session_id)::bigint,
         count(*) filter (where e.name = 'page_view')::bigint
  from public.platform_events e
  where e.occurred_at >= p_from
    and e.occurred_at < p_to
    and (p_include_demo or not e.is_demo)
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- RPC: ordered funnel. A visitor reaches step k when they fire p_steps[k] at
-- or after the moment they reached step k-1 (first occurrence wins), all
-- inside [p_from, p_to). conversion is relative to step 1 (0..1).
--   select * from platform_funnel(array['pro_profile_view','phone_reveal','lead_submitted'],
--                                 now() - interval '30 days', now());
-- ---------------------------------------------------------------------------
create or replace function public.platform_funnel(
  p_steps        text[],
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_demo boolean default false
)
returns table (step integer, name text, visitors bigint, conversion numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_times timestamptz[];
  v_first bigint;
  v_n     integer := coalesce(array_length(p_steps, 1), 0);
  i       integer;
begin
  if v_n = 0 then
    return;
  end if;

  -- Step 1: each visitor's first occurrence of the first event.
  select coalesce(array_agg(t.visitor), '{}'), coalesce(array_agg(t.reached_at), '{}')
    into v_ids, v_times
  from (
    select coalesce(e.anon_id, e.session_id) as visitor, min(e.occurred_at) as reached_at
    from public.platform_events e
    where e.name = p_steps[1]
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
      and coalesce(e.anon_id, e.session_id) is not null
    group by 1
  ) t;

  v_first    := coalesce(array_length(v_ids, 1), 0);
  step       := 1;
  name       := p_steps[1];
  visitors   := v_first;
  conversion := case when v_first > 0 then 1 else 0 end;
  return next;

  for i in 2 .. v_n loop
    select coalesce(array_agg(t.visitor), '{}'), coalesce(array_agg(t.reached_at), '{}')
      into v_ids, v_times
    from (
      select prev.visitor, min(e.occurred_at) as reached_at
      from unnest(v_ids, v_times) as prev (visitor, reached_at)
      join public.platform_events e
        on coalesce(e.anon_id, e.session_id) = prev.visitor
       and e.occurred_at >= prev.reached_at
      where e.name = p_steps[i]
        and e.occurred_at < p_to
        and (p_include_demo or not e.is_demo)
      group by prev.visitor
    ) t;

    step       := i;
    name       := p_steps[i];
    visitors   := coalesce(array_length(v_ids, 1), 0);
    conversion := case when v_first > 0 then round(visitors::numeric / v_first, 4) else 0 end;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: top-N values of one prop for one event (e.g. the top questions).
-- Values are trimmed and whitespace-collapsed before grouping.
--   select * from platform_top_props('search_submitted', 'query',
--                                    now() - interval '7 days', now(), 20);
-- ---------------------------------------------------------------------------
create or replace function public.platform_top_props(
  p_name         text,
  p_prop         text,
  p_from         timestamptz,
  p_to           timestamptz,
  p_limit        integer default 20,
  p_include_demo boolean default false
)
returns table (value text, events bigint, visitors bigint, last_seen timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.value,
         count(*)::bigint,
         count(distinct v.visitor)::bigint,
         max(v.occurred_at)
  from (
    select regexp_replace(btrim(e.props ->> p_prop), '\s+', ' ', 'g') as value,
           coalesce(e.anon_id, e.session_id)                          as visitor,
           e.occurred_at
    from public.platform_events e
    where e.name = p_name
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
      and e.props ? p_prop
  ) v
  where v.value is not null and v.value <> ''
  group by v.value
  order by 2 desc, 3 desc, 1
  limit greatest(1, least(coalesce(p_limit, 20), 500));
$$;

-- Dashboards call these as staff (RLS applies) or with the service role.
revoke execute on function public.platform_daily_counts(timestamptz, timestamptz, text[], boolean, text) from public, anon;
revoke execute on function public.platform_unique_visitors(timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.platform_unique_visitors_daily(timestamptz, timestamptz, boolean, text) from public, anon;
revoke execute on function public.platform_funnel(text[], timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.platform_top_props(text, text, timestamptz, timestamptz, integer, boolean) from public, anon;

grant execute on function public.platform_daily_counts(timestamptz, timestamptz, text[], boolean, text) to authenticated, service_role;
grant execute on function public.platform_unique_visitors(timestamptz, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.platform_unique_visitors_daily(timestamptz, timestamptz, boolean, text) to authenticated, service_role;
grant execute on function public.platform_funnel(text[], timestamptz, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.platform_top_props(text, text, timestamptz, timestamptz, integer, boolean) to authenticated, service_role;
