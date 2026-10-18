-- QA (Wave C, after the integration migrations 20261014130500/130600): no
-- counting oracles over other people's data in the revenue RPCs.
--
-- 1. revenue_business_metrics() runs its p_patterns regexes over every
--    visitor's question text (answer_completed.props.query) and every lead's
--    project-file questions, and returns counts. Granted to authenticated, it
--    was a counting oracle: anyone can submit a (pending) business and so pass
--    its ownership check, then read other people's questions out a pattern at
--    a time (and burn database CPU). It is now SERVICE-ROLE ONLY; the portal
--    and the partner report call it after their own owner/staff check, with
--    patterns built on the server (apps/web lib/revenue/metrics.ts).
--    Hotfixed by hand on hosted and local on 2026-10-17; restated here so a
--    fresh database is safe. (20261014130500 restates the old grant, which is
--    why this lives after it.)
--
-- 2. revenue_peer_rank() returned the medians and ranks of a business's
--    specialty cohort to its owner. An owner can create a pending business
--    with any specialty, and in a cohort of one or two published businesses
--    the median gives a competitor's exact profile views and lead count
--    (median of {0, v} = v/2). Now, for non-staff callers: only a published
--    business is benchmarked, and medians and ranks come back only when at
--    least 5 other published businesses share the specialty. The business's
--    own numbers are always returned.
--
-- Idempotent: revoke/grant and create or replace.

-- 1 -------------------------------------------------------------------------
revoke all on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) to service_role;

-- 2 -------------------------------------------------------------------------
create or replace function public.revenue_peer_rank(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  specialty  uuid;
  v_status   text;
  v_trusted  boolean := public.is_trusted_writer();
  v_others   bigint;
  result     jsonb;
  min_others constant integer := 5;
begin
  if not (v_trusted or public.revenue_owns_business(p_business_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  select b.primary_specialty_id, b.status into specialty, v_status from public.businesses b where b.id = p_business_id;
  -- An owner benchmarks a published business only (a pending one could pick any specialty).
  if not v_trusted and v_status is distinct from 'published' then
    return jsonb_build_object('peers', 0);
  end if;

  with peers as (
    select b.id from public.businesses b
    where b.id = p_business_id
       or (specialty is not null and b.status = 'published' and b.primary_specialty_id = specialty)
  ),
  views as (
    select (e.props ->> 'business_id') as bid, count(*) as n
    from public.platform_events e
    where e.name = 'pro_profile_view' and e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_demo
      and (e.props ->> 'business_id') in (select id::text from peers)
    group by 1
  ),
  lead_counts as (
    select l.business_id::text as bid, count(*) as n
    from public.leads l
    where l.created_at >= p_from and l.created_at < p_to and l.status <> 'spam'
      and l.business_id in (select id from peers)
    group by 1
  ),
  scored as (
    select p.id::text as bid, coalesce(v.n, 0) as views, coalesce(lc.n, 0) as leads
    from peers p
    left join views v on v.bid = p.id::text
    left join lead_counts lc on lc.bid = p.id::text
  ),
  ranked as (
    select bid, views, leads,
           rank() over (order by views desc) as view_rank,
           rank() over (order by leads desc) as lead_rank
    from scored
  )
  select
    (select count(*) from scored) - 1,
    jsonb_build_object(
      'peers', (select count(*) from scored),
      'specialty', (select s.name from public.specialties s where s.id = specialty),
      'views', r.views,
      'leads', r.leads,
      'view_rank', r.view_rank,
      'lead_rank', r.lead_rank,
      'median_views', (select percentile_cont(0.5) within group (order by views) from scored),
      'median_leads', (select percentile_cont(0.5) within group (order by leads) from scored)
    )
  into v_others, result
  from ranked r
  where r.bid = p_business_id::text;

  if result is null then
    return jsonb_build_object('peers', 0);
  end if;
  -- Too few others to stay anonymous: the business's own numbers only.
  if not v_trusted and v_others < min_others then
    return result - 'view_rank' - 'lead_rank' - 'median_views' - 'median_leads';
  end if;
  return result;
end;
$$;

revoke execute on function public.revenue_peer_rank(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.revenue_peer_rank(uuid, timestamptz, timestamptz) to authenticated, service_role;
