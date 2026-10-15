-- =============================================================================
-- Revenue 4/4: measured on intent. Metric RPCs for the pro portal, the
-- monthly partner report and the admin partner health.
--
--   revenue_business_metrics(business, from, to, patterns)  one business, one period
--   revenue_peer_rank(business, from, to)                    anonymised rank among peers
--   revenue_partner_overview(from, to)                       staff: every partner at once
--
-- platform_events is staff/service-only (foundation RLS), so these are
-- SECURITY DEFINER and authorize inside: the caller must own the business, be
-- staff, or be the service role (public.is_trusted_writer()). A pro therefore
-- only ever sees their own numbers; peers come back as ranks and medians,
-- never names or ids. `patterns` are the trade-topic regexes from
-- apps/web lib/revenue/topics.ts ("questions about their category").
-- Demo traffic (is_demo) is excluded. Idempotent.
-- =============================================================================

create or replace function public.revenue_business_metrics(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_patterns text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bid text := p_business_id::text;
  patterns text[] := coalesce(p_patterns, '{}'::text[]);
  ev jsonb;
  asked jsonb;
  lead_stats jsonb;
  deal_stats jsonb;
  daily jsonb;
  serves_nationwide boolean;
  served_regions text[];
  regional bigint;
begin
  if p_business_id is null or p_from is null or p_to is null then
    raise exception 'missing argument' using errcode = '22004';
  end if;
  if not (public.is_trusted_writer() or public.revenue_owns_business(p_business_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if cardinality(patterns) > 12 or exists (select 1 from unnest(patterns) p where length(p) not between 1 and 400) then
    raise exception 'invalid patterns' using errcode = '22023';
  end if;

  -- Exposure and contact events about this business.
  select jsonb_build_object(
    'profile_views',  count(*) filter (where e.name = 'pro_profile_view'),
    'unique_viewers', count(distinct e.anon_id) filter (where e.name = 'pro_profile_view'),
    'phone_reveals',  count(*) filter (where e.name = 'phone_reveal'),
    'contact_clicks', count(*) filter (where e.name = 'pro_contact_clicked'),
    'shortlist_adds', count(*) filter (where e.name = 'shortlist_add'),
    'quote_events',   count(*) filter (where e.name = 'quote_request'),
    'impressions',    count(*) filter (where e.name = 'partner_impression'),
    'reach',          count(distinct e.anon_id) filter (where e.name = 'partner_impression'),
    'clicks',         count(*) filter (where e.name = 'partner_click')
  )
  into ev
  from public.platform_events e
  where e.occurred_at >= p_from and e.occurred_at < p_to
    and not e.is_demo
    and e.name in ('pro_profile_view', 'phone_reveal', 'pro_contact_clicked', 'shortlist_add',
                   'quote_request', 'partner_impression', 'partner_click')
    and coalesce(e.props ->> 'business_id', e.props ->> 'partner_id') = bid;

  -- Builders who asked about this business's trade (answers site-wide).
  select jsonb_build_object(
    'category_questions', count(*),
    'category_askers', count(distinct coalesce(e.anon_id::text, e.session_id::text, e.id::text))
  )
  into asked
  from public.platform_events e
  where cardinality(patterns) > 0
    and e.name = 'answer_completed'
    and e.occurred_at >= p_from and e.occurred_at < p_to
    and not e.is_demo
    and (e.props ->> 'query') ~* any (patterns);

  -- Project files in the regions this business serves that ask about its trade.
  select coalesce(bool_or(r.is_nationwide), false), coalesce(array_agg(r.slug), '{}'::text[])
  into serves_nationwide, served_regions
  from public.business_regions br
  join public.regions r on r.id = br.region_id
  where br.business_id = p_business_id;

  select count(*)
  into regional
  from public.leads l
  where cardinality(patterns) > 0
    and l.created_at >= p_from and l.created_at < p_to
    and l.status <> 'spam'
    and l.payload ? 'project_file'
    and (serves_nationwide or (l.payload #>> '{project_file,regionSlug}') = any (served_regions))
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(l.payload #> '{project_file,questions}') = 'array'
             then l.payload #> '{project_file,questions}' else '[]'::jsonb end
      ) q
      where (q ->> 'q') ~* any (patterns)
    );

  -- Leads delivered to this business (addressed to it or forwarded by a rule),
  -- and leads it assisted (a click on its sponsored offer was the last touch).
  select jsonb_build_object(
    'leads', count(*) filter (where delivered),
    'leads_new', count(*) filter (where delivered and l.status = 'new'),
    'leads_contacted', count(*) filter (where delivered and l.status in ('contacted', 'in_progress')),
    'leads_won', count(*) filter (where delivered and l.status in ('won', 'qualified')),
    'quote_requests', count(*) filter (where delivered and l.payload ->> 'kind' = 'quote_request'),
    'routed_leads', count(*) filter (where delivered and l.business_id is distinct from p_business_id),
    'assisted_leads', count(*) filter (where not delivered),
    'regional_builders', regional
  )
  into lead_stats
  from (
    select l.*,
           (l.business_id = p_business_id or l.payload #>> '{routing,business_id}' = bid) as delivered
    from public.leads l
    where l.created_at >= p_from and l.created_at < p_to
      and l.status <> 'spam'
      and (l.business_id = p_business_id
           or l.payload #>> '{routing,business_id}' = bid
           or (l.attribution ->> 'medium' = 'partner' and l.attribution ->> 'source' = bid))
  ) l;

  select jsonb_build_object('deals', count(*), 'deal_value_agorot', coalesce(sum(d.value_agorot), 0))
  into deal_stats
  from public.partner_deals d
  where d.business_id = p_business_id
    and d.closed_on >= (p_from at time zone 'Asia/Jerusalem')::date
    and d.closed_on < (p_to at time zone 'Asia/Jerusalem')::date;

  -- Daily profile views and viewable impressions (Israel days).
  with days as (
    select generate_series(
      (p_from at time zone 'Asia/Jerusalem')::date,
      ((p_to - interval '1 second') at time zone 'Asia/Jerusalem')::date,
      interval '1 day'
    )::date as day
  ),
  counts as (
    select (e.occurred_at at time zone 'Asia/Jerusalem')::date as day,
           count(*) filter (where e.name = 'pro_profile_view') as views,
           count(*) filter (where e.name = 'partner_impression') as impressions
    from public.platform_events e
    where e.occurred_at >= p_from and e.occurred_at < p_to
      and not e.is_demo
      and e.name in ('pro_profile_view', 'partner_impression')
      and coalesce(e.props ->> 'business_id', e.props ->> 'partner_id') = bid
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('day', d.day, 'views', coalesce(c.views, 0), 'impressions', coalesce(c.impressions, 0)) order by d.day),
    '[]'::jsonb)
  into daily
  from days d
  left join counts c on c.day = d.day;

  return coalesce(ev, '{}'::jsonb) || coalesce(asked, '{}'::jsonb) || coalesce(lead_stats, '{}'::jsonb)
    || coalesce(deal_stats, '{}'::jsonb) || jsonb_build_object('daily', daily);
end;
$$;

-- Rank among peers (same primary specialty), by profile views and by leads.
create or replace function public.revenue_peer_rank(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  specialty uuid;
  result jsonb;
begin
  if not (public.is_trusted_writer() or public.revenue_owns_business(p_business_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  select b.primary_specialty_id into specialty from public.businesses b where b.id = p_business_id;

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
  select jsonb_build_object(
    'peers', (select count(*) from scored),
    'specialty', (select s.name from public.specialties s where s.id = specialty),
    'views', r.views,
    'leads', r.leads,
    'view_rank', r.view_rank,
    'lead_rank', r.lead_rank,
    'median_views', (select percentile_cont(0.5) within group (order by views) from scored),
    'median_leads', (select percentile_cont(0.5) within group (order by leads) from scored)
  )
  into result
  from ranked r
  where r.bid = p_business_id::text;

  return coalesce(result, jsonb_build_object('peers', 0));
end;
$$;

-- Staff: exposure, leads and deals for every partner (subscribed or with a campaign).
create or replace function public.revenue_partner_overview(p_from timestamptz, p_to timestamptz)
returns table (
  business_id uuid,
  impressions bigint,
  clicks bigint,
  leads bigint,
  quote_requests bigint,
  deals bigint,
  deal_value_agorot bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  return query
  with partners as (
    select s.business_id as id from public.partner_subscriptions s where s.status in ('active', 'past_due', 'pending')
    union
    select c.business_id from public.partner_campaigns c
  ),
  ev as (
    select (e.props ->> 'partner_id') as pid,
           count(*) filter (where e.name = 'partner_impression') as imp,
           count(*) filter (where e.name = 'partner_click') as clk
    from public.platform_events e
    where e.name in ('partner_impression', 'partner_click')
      and e.occurred_at >= p_from and e.occurred_at < p_to and not e.is_demo
    group by 1
  ),
  ld as (
    select p.id,
           count(l.id) as n,
           count(l.id) filter (where l.payload ->> 'kind' = 'quote_request') as q
    from partners p
    join public.leads l
      on (l.business_id = p.id or l.payload #>> '{routing,business_id}' = p.id::text)
     and l.created_at >= p_from and l.created_at < p_to and l.status <> 'spam'
    group by p.id
  ),
  dl as (
    select d.business_id as id, count(*) as n, coalesce(sum(d.value_agorot), 0)::bigint as v
    from public.partner_deals d
    where d.closed_on >= (p_from at time zone 'Asia/Jerusalem')::date
      and d.closed_on < (p_to at time zone 'Asia/Jerusalem')::date
    group by 1
  )
  select p.id, coalesce(ev.imp, 0), coalesce(ev.clk, 0), coalesce(ld.n, 0), coalesce(ld.q, 0),
         coalesce(dl.n, 0), coalesce(dl.v, 0)
  from partners p
  left join ev on ev.pid = p.id::text
  left join ld on ld.id = p.id
  left join dl on dl.id = p.id;
end;
$$;

revoke execute on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) from public, anon;
revoke execute on function public.revenue_peer_rank(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.revenue_partner_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) to authenticated, service_role;
grant execute on function public.revenue_peer_rank(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.revenue_partner_overview(timestamptz, timestamptz) to authenticated, service_role;
