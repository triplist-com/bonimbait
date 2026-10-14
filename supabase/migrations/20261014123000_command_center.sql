-- =============================================================================
-- P4 Command Center ("חדר הבקרה"), squad `command`.
--
--   insight_runs / insight_topics  The content-gap engine ("רענון תובנות"):
--                                  one row per refresh, and the question
--                                  clusters it found (volume, trend, coverage,
--                                  examples, suggested video title, nearest
--                                  existing content).
--   pipeline_expected_values       Admin overrides of the expected value per
--                                  lead type or service plan (deal value x
--                                  close rate). Defaults live in code
--                                  (apps/web lib/command/pipeline.ts); a row
--                                  here replaces one default.
--   lead_status_events             Every lead status change (trigger), for
--                                  speed-to-lead. History starts when this
--                                  migration is applied.
--   command_* RPCs                 Staff dashboard rollups over
--                                  platform_events and leads.
--
-- * RLS on every new table. Staff (editor/admin) read; the service role
--   writes insight rows; admins write expected values; only the trigger writes
--   lead_status_events.
-- * The RPCs are SECURITY INVOKER: they inherit the RLS of platform_events and
--   leads, so anon users and members get empty results.
-- * Additive and idempotent: if not exists / or replace / drop ... if exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Content-gap engine
-- ---------------------------------------------------------------------------
create table if not exists public.insight_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz    not null default now(),
  finished_at         timestamptz,
  status              text           not null default 'running'
                        check (status in ('running', 'done', 'partial', 'empty', 'failed', 'budget')),
  window_from         timestamptz    not null,
  window_to           timestamptz    not null,
  question_count      integer        not null default 0 check (question_count >= 0),
  ask_count           integer        not null default 0 check (ask_count >= 0),
  topic_count         integer        not null default 0 check (topic_count >= 0),
  embed_tokens        integer        not null default 0 check (embed_tokens >= 0),
  label_input_tokens  integer        not null default 0 check (label_input_tokens >= 0),
  label_output_tokens integer        not null default 0 check (label_output_tokens >= 0),
  -- Estimated vendor spend in USD (sub-cent), like ai_usage.cost_usd. Not customer money.
  cost_usd            numeric(10, 6) not null default 0 check (cost_usd >= 0),
  label_model         text,
  params              jsonb          not null default '{}'::jsonb,
  message             text,
  triggered_by        uuid references public.profiles (id) on delete set null,
  constraint insight_runs_window check (window_to > window_from),
  constraint insight_runs_params_object check (jsonb_typeof(params) = 'object')
);

comment on table public.insight_runs is
  'Content-gap engine refreshes (apps/web lib/command/insights). Service-role writes, staff reads.';

create index if not exists insight_runs_started_idx on public.insight_runs (started_at desc);

create table if not exists public.insight_topics (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid          not null references public.insight_runs (id) on delete cascade,
  rank            integer       not null check (rank >= 1),
  label           text          not null,
  suggested_title text,
  asks            integer       not null default 0 check (asks >= 0),
  visitors        integer       not null default 0 check (visitors >= 0),
  question_count  integer       not null default 0 check (question_count >= 0),
  asks_this_week  integer       not null default 0 check (asks_this_week >= 0),
  asks_prev_week  integer       not null default 0 check (asks_prev_week >= 0),
  trend_pct       numeric(8, 2),                        -- null: nothing asked the week before
  coverage        numeric(5, 4) not null check (coverage between 0 and 1),
  top_similarity  numeric(5, 4) not null check (top_similarity between -1 and 1),
  coverage_level  text          not null check (coverage_level in ('gap', 'partial', 'covered')),
  level_source    text          not null default 'similarity' check (level_source in ('similarity', 'review')),
  level_reason    text,
  avg_confidence  numeric(5, 4),                        -- answer_completed.confidence, when recorded
  examples        jsonb         not null default '[]'::jsonb,  -- [{ q, asks }]
  nearest         jsonb         not null default '[]'::jsonb,  -- [{ kind, id, title, href, similarity, start_s }]
  created_at      timestamptz   not null default now(),
  constraint insight_topics_examples_array check (jsonb_typeof(examples) = 'array'),
  constraint insight_topics_nearest_array check (jsonb_typeof(nearest) = 'array'),
  constraint insight_topics_run_rank unique (run_id, rank)
);

comment on table public.insight_topics is
  'Question clusters of one insight run: volume, week-over-week trend, coverage, examples, suggested video.';

alter table public.insight_runs enable row level security;
alter table public.insight_topics enable row level security;

drop policy if exists "staff read" on public.insight_runs;
create policy "staff read" on public.insight_runs
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "staff read" on public.insight_topics;
create policy "staff read" on public.insight_topics
  for select to authenticated
  using ((select public.is_staff()));

revoke all on table public.insight_runs, public.insight_topics from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.insight_runs, public.insight_topics from authenticated;
grant select on table public.insight_runs, public.insight_topics to authenticated;
grant all on table public.insight_runs, public.insight_topics to service_role;

-- ---------------------------------------------------------------------------
-- Expected value per lead (pipeline ₪): admin overrides of the code defaults
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_expected_values (
  id                uuid primary key default gen_random_uuid(),
  key               text          not null unique
                      check (key ~ '^(type|plan):[a-z0-9_-]{1,64}$'),   -- 'type:consultation', 'plan:bonim-budget'
  deal_value_agorot bigint        not null check (deal_value_agorot between 0 and 100000000000),
  close_rate        numeric(5, 4) not null check (close_rate between 0 and 1),
  note              text check (note is null or length(note) <= 500),
  updated_at        timestamptz   not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null
);

comment on table public.pipeline_expected_values is
  'Admin overrides of the expected value per lead type or plan (apps/web lib/command/pipeline.ts holds the defaults).';

drop trigger if exists pipeline_expected_values_set_updated_at on public.pipeline_expected_values;
create trigger pipeline_expected_values_set_updated_at
  before update on public.pipeline_expected_values
  for each row execute function public.set_updated_at();

alter table public.pipeline_expected_values enable row level security;

drop policy if exists "staff read" on public.pipeline_expected_values;
create policy "staff read" on public.pipeline_expected_values
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists "admin insert" on public.pipeline_expected_values;
create policy "admin insert" on public.pipeline_expected_values
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "admin update" on public.pipeline_expected_values;
create policy "admin update" on public.pipeline_expected_values
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admin delete" on public.pipeline_expected_values;
create policy "admin delete" on public.pipeline_expected_values
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on table public.pipeline_expected_values from anon;
revoke truncate, references, trigger on table public.pipeline_expected_values from authenticated;
grant select, insert, update, delete on table public.pipeline_expected_values to authenticated;
grant all on table public.pipeline_expected_values to service_role;

-- ---------------------------------------------------------------------------
-- Lead status history (speed-to-lead = time from created_at to the first change)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_status_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid        not null references public.leads (id) on delete cascade,
  from_status text,
  to_status   text        not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid        -- auth.uid() of the staff member; null for the service role
);

comment on table public.lead_status_events is
  'Lead status changes, written by the leads_command_status_log trigger. Staff read.';

create index if not exists lead_status_events_lead_changed_idx
  on public.lead_status_events (lead_id, changed_at);

create or replace function public.leads_command_status_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_status_events (lead_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return null;
end;
$$;

revoke execute on function public.leads_command_status_log() from public, anon, authenticated;

drop trigger if exists leads_command_status_log on public.leads;
create trigger leads_command_status_log
  after update of status on public.leads
  for each row execute function public.leads_command_status_log();

alter table public.lead_status_events enable row level security;

drop policy if exists "staff read" on public.lead_status_events;
create policy "staff read" on public.lead_status_events
  for select to authenticated
  using ((select public.is_staff()));

revoke all on table public.lead_status_events from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.lead_status_events from authenticated;
grant select on table public.lead_status_events to authenticated;
grant all on table public.lead_status_events to service_role;

-- ---------------------------------------------------------------------------
-- RPC: builders' questions with their volume, for the content-gap engine.
--
-- Questions come from the `query` prop of search_submitted, answer_requested
-- and answer_completed. One search usually fires all three, so an "ask" is a
-- distinct (visitor, Israel day, question) and repeats the same day count
-- once. Questions are grouped on a normalized key (letters and digits only);
-- `question` is the newest wording of the group.
--   select * from command_question_stats(now() - interval '56 days', now(), now() - interval '7 days');
-- ---------------------------------------------------------------------------
create or replace function public.command_question_stats(
  p_from         timestamptz,
  p_to           timestamptz,
  p_week_start   timestamptz,
  p_limit        integer default 800,
  p_include_demo boolean default false
)
returns table (
  question           text,
  question_key       text,
  asks               bigint,
  visitors           bigint,
  asks_this_week     bigint,
  asks_prev_week     bigint,
  answers            bigint,
  avg_confidence     numeric,
  zero_source_answers bigint,
  avg_top_similarity numeric,
  first_seen         timestamptz,
  last_seen          timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with raw as (
    select regexp_replace(btrim(e.props ->> 'query'), '\s+', ' ', 'g')                      as question,
           e.name,
           e.props,
           e.occurred_at,
           coalesce(e.anon_id::text, e.session_id::text, e.id::text)                          as visitor,
           (e.occurred_at at time zone 'Asia/Jerusalem')::date                                as day
    from public.platform_events e
    where e.name in ('search_submitted', 'answer_requested', 'answer_completed')
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
      and e.props ? 'query'
  ),
  keyed as (
    select r.*,
           btrim(regexp_replace(regexp_replace(lower(translate(r.question, '״׳', '"''')), '[^א-תa-z0-9 ]+', ' ', 'g'), ' +', ' ', 'g')) as question_key
    from raw r
    where r.question is not null and r.question <> ''
  )
  select (array_agg(k.question order by k.occurred_at desc))[1]                                 as question,
         k.question_key,
         count(distinct (k.visitor, k.day))::bigint                                             as asks,
         count(distinct k.visitor)::bigint                                                      as visitors,
         count(distinct (k.visitor, k.day)) filter (where k.occurred_at >= p_week_start)::bigint as asks_this_week,
         count(distinct (k.visitor, k.day)) filter (
           where k.occurred_at >= p_week_start - interval '7 days' and k.occurred_at < p_week_start
         )::bigint                                                                              as asks_prev_week,
         count(*) filter (where k.name = 'answer_completed')::bigint                            as answers,
         avg(case when k.name = 'answer_completed' and jsonb_typeof(k.props -> 'confidence') = 'number'
                  then (k.props ->> 'confidence')::numeric end)                                 as avg_confidence,
         count(*) filter (where k.name = 'answer_completed' and jsonb_typeof(k.props -> 'sources') = 'number'
                            and (k.props ->> 'sources')::numeric = 0)::bigint                   as zero_source_answers,
         avg(case when k.name = 'answer_completed' and jsonb_typeof(k.props -> 'top_cos') = 'number'
                  then (k.props ->> 'top_cos')::numeric end)                                    as avg_top_similarity,
         min(k.occurred_at)                                                                     as first_seen,
         max(k.occurred_at)                                                                     as last_seen
  from keyed k
  where k.question_key <> ''
  group by k.question_key
  order by 3 desc, 12 desc
  limit greatest(1, least(coalesce(p_limit, 800), 5000));
$$;

-- ---------------------------------------------------------------------------
-- RPC: most viewed public pages (page_view.path). Staff, account and API
-- paths are left out; /platform traffic is demo traffic (is_demo).
-- ---------------------------------------------------------------------------
create or replace function public.command_top_paths(
  p_from         timestamptz,
  p_to           timestamptz,
  p_limit        integer default 100,
  p_include_demo boolean default false
)
returns table (path text, views bigint, visitors bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.path,
         count(*)::bigint,
         count(distinct coalesce(e.anon_id, e.session_id))::bigint
  from public.platform_events e
  where e.name = 'page_view'
    and e.occurred_at >= p_from
    and e.occurred_at < p_to
    and (p_include_demo or not e.is_demo)
    and e.path is not null
    and e.path !~ '^/(admin|platform|api|account|login|signup|auth|cart|checkout|partner-portal)(/|$)'
  group by e.path
  order by 2 desc, 3 desc, 1
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

-- ---------------------------------------------------------------------------
-- RPC: sources cited under AI answers (answer_completed.source_ids, emitted by
-- the advisor) and sources opened from answers (source_clicked kind + id).
-- Ids look like 'video:<youtube id>' or 'post:<slug>'.
-- ---------------------------------------------------------------------------
create or replace function public.command_cited_sources(
  p_from         timestamptz,
  p_to           timestamptz,
  p_limit        integer default 50,
  p_include_demo boolean default false
)
returns table (source_id text, citations bigint, clicks bigint, last_seen timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with cited as (
    select left(s.value, 220) as source_id, e.occurred_at, 'cite'::text as kind
    from public.platform_events e
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(e.props -> 'source_ids') = 'array' then e.props -> 'source_ids' else '[]'::jsonb end
    ) as s (value)
    where e.name = 'answer_completed'
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
  ),
  clicked as (
    select left((e.props ->> 'kind') || ':' || (e.props ->> 'id'), 220) as source_id, e.occurred_at, 'click'::text as kind
    from public.platform_events e
    where e.name = 'source_clicked'
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
      and e.props ? 'kind'
      and e.props ? 'id'
  )
  select u.source_id,
         count(*) filter (where u.kind = 'cite')::bigint,
         count(*) filter (where u.kind = 'click')::bigint,
         max(u.occurred_at)
  from (select * from cited union all select * from clicked) u
  where u.source_id is not null and u.source_id <> ''
  group by u.source_id
  order by 2 desc, 3 desc, 1
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

-- ---------------------------------------------------------------------------
-- RPC: partner exposure per partner: viewable impressions, clicks and reach
-- for sponsored slots, plus benefits-shop offer views and clicks.
-- ---------------------------------------------------------------------------
create or replace function public.command_partner_stats(
  p_from         timestamptz,
  p_to           timestamptz,
  p_include_demo boolean default false
)
returns table (
  partner_id   text,
  impressions  bigint,
  clicks       bigint,
  reach        bigint,
  offer_views  bigint,
  offer_clicks bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.partner_id,
         count(*) filter (where p.name = 'partner_impression')::bigint,
         count(*) filter (where p.name = 'partner_click')::bigint,
         count(distinct p.visitor) filter (where p.name = 'partner_impression')::bigint,
         count(*) filter (where p.name = 'partner_offer_view')::bigint,
         count(*) filter (where p.name = 'partner_offer_click')::bigint
  from (
    select left(coalesce(nullif(btrim(e.props ->> 'partner_id'), ''), nullif(btrim(e.props ->> 'partner'), '')), 120) as partner_id,
           e.name,
           coalesce(e.anon_id, e.session_id) as visitor
    from public.platform_events e
    where e.name in ('partner_impression', 'partner_click', 'partner_offer_view', 'partner_offer_click')
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
  ) p
  where p.partner_id is not null
  group by p.partner_id
  order by 2 desc, 3 desc, 1;
$$;

-- ---------------------------------------------------------------------------
-- RPC: first status change of each lead created in [p_from, p_to).
-- ---------------------------------------------------------------------------
create or replace function public.command_lead_first_changes(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (lead_id uuid, first_changed_at timestamptz, first_status text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (s.lead_id) s.lead_id, s.changed_at, s.to_status
  from public.lead_status_events s
  join public.leads l on l.id = s.lead_id
  where l.created_at >= p_from
    and l.created_at < p_to
  order by s.lead_id, s.changed_at, s.id;
$$;

revoke execute on function public.command_question_stats(timestamptz, timestamptz, timestamptz, integer, boolean) from public, anon;
revoke execute on function public.command_top_paths(timestamptz, timestamptz, integer, boolean) from public, anon;
revoke execute on function public.command_cited_sources(timestamptz, timestamptz, integer, boolean) from public, anon;
revoke execute on function public.command_partner_stats(timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.command_lead_first_changes(timestamptz, timestamptz) from public, anon;

grant execute on function public.command_question_stats(timestamptz, timestamptz, timestamptz, integer, boolean) to authenticated, service_role;
grant execute on function public.command_top_paths(timestamptz, timestamptz, integer, boolean) to authenticated, service_role;
grant execute on function public.command_cited_sources(timestamptz, timestamptz, integer, boolean) to authenticated, service_role;
grant execute on function public.command_partner_stats(timestamptz, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.command_lead_first_changes(timestamptz, timestamptz) to authenticated, service_role;
