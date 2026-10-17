-- =============================================================================
-- Integration (advisor -> revenue): builders asking about a partner's trade
-- IN THE PARTNER'S REGIONS.
--
-- The advisor now records the builder's region on every answer
-- (answer_completed.props.region: bb.hub.draft, or the member's hub project /
-- profile; apps/web lib/advisor/builder-context.ts). revenue_business_metrics()
-- gains two numbers next to the site-wide category_questions/askers:
--
--   regional_questions   answers about the trade asked from a region the
--                        business serves (every region for a nationwide one)
--   regional_askers      the distinct builders behind them
--
-- An answer without a known region never counts as regional. The rest of the
-- function is unchanged from 20261014122300_revenue_metrics.sql (same
-- signature, same authorization: owner of the business, staff, or the service
-- role). Idempotent (create or replace; grants restated).
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

  -- The regions this business serves (read before the askers: they are counted by region).
  select coalesce(bool_or(r.is_nationwide), false), coalesce(array_agg(r.slug), '{}'::text[])
  into serves_nationwide, served_regions
  from public.business_regions br
  join public.regions r on r.id = br.region_id
  where br.business_id = p_business_id;

  -- Builders who asked about this business's trade: site-wide, and from its regions.
  select jsonb_build_object(
    'category_questions', count(*),
    'category_askers', count(distinct coalesce(e.anon_id::text, e.session_id::text, e.id::text)),
    'regional_questions', count(*) filter (
      where serves_nationwide or (e.props ->> 'region') = any (served_regions)),
    'regional_askers', count(distinct coalesce(e.anon_id::text, e.session_id::text, e.id::text)) filter (
      where serves_nationwide or (e.props ->> 'region') = any (served_regions))
  )
  into asked
  from public.platform_events e
  where cardinality(patterns) > 0
    and e.name = 'answer_completed'
    and e.occurred_at >= p_from and e.occurred_at < p_to
    and not e.is_demo
    and (e.props ->> 'query') ~* any (patterns);

  -- Project files in the regions this business serves that ask about its trade.
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

revoke execute on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) from public, anon;
grant execute on function public.revenue_business_metrics(uuid, timestamptz, timestamptz, text[]) to authenticated, service_role;
