-- =============================================================================
-- Foundation 2/2: guards for AI routes and forms (apps/web lib/guard)
--
--   rate_limits  sliding-window counters (rateLimit(), lib/guard/rateLimit.ts)
--   ai_usage     per-day AI token/cost buckets (recordAiUsage(), lib/guard/aiBudget.ts)
--
-- * Writes go through the RPCs below, called with the service role only.
-- * rate_limits: no API access at all (not even staff).
-- * ai_usage: staff read (owner dashboard: "AI cost is capped and visible").
-- * cost_usd is an exact decimal ESTIMATE of vendor spend in USD (sub-cent).
--   The integer-agorot rule is for ILS customer money; this is not that.
-- * The budget day is the UTC calendar day (vendor billing day).
-- * Idempotent: if not exists / or replace / drop ... if exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- rate_limits: one row per (key, fixed window). The sliding estimate is
--   previous_window_hits * (1 - elapsed_fraction) + current_window_hits
-- (the "sliding window counter" algorithm), so the table stays small.
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text        not null,   -- '<rule>:<identifier>', e.g. 'ai_answer:<ip hash>'
  window_start timestamptz not null,
  hits         integer     not null default 0 check (hits >= 0),
  updated_at   timestamptz not null default now(),
  primary key (key, window_start)
);

comment on table public.rate_limits is
  'Sliding-window rate-limit counters (apps/web lib/guard/rateLimit.ts). Service role only.';

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- No policies on purpose: only the service role (bypasses RLS) touches it.
revoke all on table public.rate_limits from anon, authenticated;
grant all on table public.rate_limits to service_role;

-- Count one hit (or p_cost hits) for p_key if the window allows it.
-- A refused call is NOT counted, so a blocked client recovers on schedule.
-- The current bucket row is locked (FOR UPDATE), so concurrent calls for the
-- same key are serialized and the limit holds across server instances.
create or replace function public.rate_limit_hit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer,
  p_cost           integer default 1
)
returns table (allowed boolean, used integer, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_now       double precision := extract(epoch from clock_timestamp());
  v_win       double precision;
  v_cur       timestamptz;
  v_prev      timestamptz;
  v_elapsed   double precision;
  v_frac      double precision;
  v_cur_hits  integer;
  v_prev_hits integer;
  v_est       double precision;
  v_cost      integer := greatest(coalesce(p_cost, 1), 1);
  v_wait      double precision;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'rate_limit_hit: invalid key' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: invalid limit or window' using errcode = '22023';
  end if;

  v_win     := p_window_seconds;
  v_cur     := to_timestamp(floor(v_now / v_win) * v_win);
  v_prev    := v_cur - make_interval(secs => v_win);
  v_elapsed := v_now - extract(epoch from v_cur);
  v_frac    := v_elapsed / v_win;

  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_cur, 0)
  on conflict (key, window_start) do nothing;

  select r.hits into v_cur_hits
  from public.rate_limits r
  where r.key = p_key and r.window_start = v_cur
  for update;

  select coalesce(max(r.hits), 0) into v_prev_hits
  from public.rate_limits r
  where r.key = p_key and r.window_start = v_prev;

  v_est := v_prev_hits * (1 - v_frac) + v_cur_hits;

  if v_est + v_cost > p_limit then
    allowed   := false;
    used      := ceil(v_est)::integer;
    remaining := 0;
    if v_cur_hits + v_cost > p_limit or v_prev_hits = 0 then
      -- Only the next window helps.
      v_wait := v_win - v_elapsed;
    else
      -- Wait until the previous window's weight has decayed enough:
      -- prev * (1 - f) <= limit - cur - cost.
      v_wait := (1 - (p_limit - v_cur_hits - v_cost)::double precision / v_prev_hits) * v_win - v_elapsed;
    end if;
    -- Round to whole ms first so float noise (5.000000000000001) doesn't add a second.
    retry_after_seconds := greatest(1, ceil(round(v_wait::numeric, 3)))::integer;
  else
    update public.rate_limits r
       set hits = r.hits + v_cost,
           updated_at = now()
     where r.key = p_key and r.window_start = v_cur;
    allowed             := true;
    used                := ceil(v_est + v_cost)::integer;
    remaining           := greatest(0, floor(p_limit - v_est - v_cost))::integer;
    retry_after_seconds := 0;
  end if;

  -- Opportunistic cleanup (~1% of calls): windows are at most one day long.
  if random() < 0.01 then
    delete from public.rate_limits r where r.window_start < now() - interval '2 days';
  end if;

  return next;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- ai_usage: one row per (UTC day, route, model, demo flag), incremented by
-- record_ai_usage(). Demo calls cost real money too: they count toward the
-- daily budget, and is_demo only separates them in reports.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  day                date           not null,
  route              text           not null,   -- e.g. 'answer_stream', 'pros_classifier'
  model              text           not null,   -- e.g. 'claude-sonnet-4-6', 'text-embedding-3-small'
  is_demo            boolean        not null default false,
  calls              integer        not null default 0,
  input_tokens       bigint         not null default 0,  -- uncached input
  output_tokens      bigint         not null default 0,
  cache_read_tokens  bigint         not null default 0,
  cache_write_tokens bigint         not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  created_at         timestamptz    not null default now(),
  updated_at         timestamptz    not null default now(),
  constraint ai_usage_bucket unique (day, route, model, is_demo),
  constraint ai_usage_nonnegative check (
    calls >= 0 and input_tokens >= 0 and output_tokens >= 0
    and cache_read_tokens >= 0 and cache_write_tokens >= 0 and cost_usd >= 0
  )
);

comment on table public.ai_usage is
  'Daily AI usage and estimated cost (apps/web lib/guard/aiBudget.ts). Service-role writes, staff reads.';

drop trigger if exists ai_usage_set_updated_at on public.ai_usage;
create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

alter table public.ai_usage enable row level security;

drop policy if exists "staff read" on public.ai_usage;
create policy "staff read" on public.ai_usage
  for select to authenticated
  using ((select public.is_staff()));

revoke all on table public.ai_usage from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.ai_usage from authenticated;
grant select on table public.ai_usage to authenticated;
grant all on table public.ai_usage to service_role;

-- Add one call's usage to its bucket; returns the day's total spend (all
-- routes, demo included) so the caller can refresh its budget cache.
create or replace function public.record_ai_usage(
  p_route              text,
  p_model              text,
  p_input_tokens       bigint,
  p_output_tokens      bigint,
  p_cache_read_tokens  bigint  default 0,
  p_cache_write_tokens bigint  default 0,
  p_cost_usd           numeric default 0,
  p_is_demo            boolean default false,
  p_day                date    default null
)
returns numeric
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_day   date := coalesce(p_day, (now() at time zone 'utc')::date);
  v_total numeric;
begin
  if coalesce(btrim(p_route), '') = '' or coalesce(btrim(p_model), '') = '' then
    raise exception 'record_ai_usage: route and model are required' using errcode = '22023';
  end if;

  insert into public.ai_usage as u (
    day, route, model, is_demo, calls,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd
  )
  values (
    v_day, left(btrim(p_route), 80), left(btrim(p_model), 80), coalesce(p_is_demo, false), 1,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_cache_read_tokens, 0), 0),
    greatest(coalesce(p_cache_write_tokens, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0)
  )
  on conflict (day, route, model, is_demo) do update set
    calls              = u.calls + 1,
    input_tokens       = u.input_tokens + excluded.input_tokens,
    output_tokens      = u.output_tokens + excluded.output_tokens,
    cache_read_tokens  = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    cost_usd           = u.cost_usd + excluded.cost_usd;

  select coalesce(sum(a.cost_usd), 0) into v_total
  from public.ai_usage a
  where a.day = v_day;

  return v_total;
end;
$$;

-- Total estimated spend for one UTC day (default: today), all routes and demo.
create or replace function public.ai_spend_for_day(p_day date default null)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(a.cost_usd), 0)
  from public.ai_usage a
  where a.day = coalesce(p_day, (now() at time zone 'utc')::date);
$$;

revoke execute on function public.record_ai_usage(text, text, bigint, bigint, bigint, bigint, numeric, boolean, date) from public, anon, authenticated;
grant execute on function public.record_ai_usage(text, text, bigint, bigint, bigint, bigint, numeric, boolean, date) to service_role;

revoke execute on function public.ai_spend_for_day(date) from public, anon;
grant execute on function public.ai_spend_for_day(date) to authenticated, service_role;
