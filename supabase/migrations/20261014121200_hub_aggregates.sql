-- =============================================================================
-- Hub 3/3: staff aggregates and the member's contact history
--
-- hub_staff_aggregates(p_days)  The ONLY way staff see hub data: counts and
--   1-D distributions (stage, region, budget band, size band, move-in horizon)
--   plus onboarding counts. No ids, no rows, no documents. SECURITY DEFINER,
--   refused (42501) unless the caller is staff (editor/admin) or the service.
--   Band ids match apps/web/lib/hub/onboarding.ts (BUDGET_BANDS, SIZE_BANDS).
--
-- hub_my_contacts(p_limit)  The signed-in member's own contact history (the
--   leads they sent to pros and the consult team): ref, type, business, date.
--   SECURITY DEFINER over leads, so members see these safe columns only, never
--   the staff workflow fields (notes, status, assignee).
-- =============================================================================

create or replace function public.hub_staff_aggregates(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_today  date    := (now() at time zone 'Asia/Jerusalem')::date;
  v_result jsonb;
begin
  if not (public.hub_is_service() or public.is_staff()) then
    raise exception 'Hub aggregates are for staff only' using errcode = '42501';
  end if;

  with live as (
    select p.*,
           (coalesce(p.budget_min_agorot, p.budget_max_agorot) + coalesce(p.budget_max_agorot, p.budget_min_agorot))
             / 2 / 100 as budget_mid_nis
    from public.hub_projects p
    where p.status <> 'archived'
  ),
  onboarded as (
    select * from live where onboarded_at is not null
  ),
  stages(stage, ord) as (
    values ('purchase', 1), ('planning', 2), ('permit', 3), ('frame', 4),
           ('infrastructure', 5), ('finishing', 6), ('moving-in', 7), ('unknown', 8)
  ),
  budget_bands(band, ord) as (
    values ('lt-1.5m', 1), ('1.5-2m', 2), ('2-2.5m', 3), ('2.5-3m', 4), ('3-4m', 5), ('4m-plus', 6), ('unknown', 7)
  ),
  size_bands(band, ord) as (
    values ('lt-150', 1), ('150-200', 2), ('200-250', 3), ('250-300', 4), ('300-plus', 5), ('unknown', 6)
  ),
  horizons(band, ord) as (
    values ('past', 1), ('lt-12', 2), ('12-24', 3), ('24-36', 4), ('36-plus', 5), ('unknown', 6)
  ),
  tagged as (
    select
      coalesce(o.stage, 'unknown') as stage,
      r.slug as region_slug,
      r.name as region_name,
      case
        when o.budget_mid_nis is null then 'unknown'
        when o.budget_mid_nis < 1500000 then 'lt-1.5m'
        when o.budget_mid_nis < 2000000 then '1.5-2m'
        when o.budget_mid_nis < 2500000 then '2-2.5m'
        when o.budget_mid_nis < 3000000 then '2.5-3m'
        when o.budget_mid_nis < 4000000 then '3-4m'
        else '4m-plus'
      end as budget_band,
      case
        when o.size_m2 is null then 'unknown'
        when o.size_m2 < 150 then 'lt-150'
        when o.size_m2 < 200 then '150-200'
        when o.size_m2 < 250 then '200-250'
        when o.size_m2 < 300 then '250-300'
        else '300-plus'
      end as size_band,
      case
        when o.target_move_in is null then 'unknown'
        when o.target_move_in < date_trunc('month', v_today)::date then 'past'
        when o.target_move_in < (v_today + interval '12 months')::date then 'lt-12'
        when o.target_move_in < (v_today + interval '24 months')::date then '12-24'
        when o.target_move_in < (v_today + interval '36 months')::date then '24-36'
        else '36-plus'
      end as horizon
    from onboarded o
    left join public.regions r on r.id = o.region_id
  ),
  days as (
    select d::date as day
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as d
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', v_days,
    'projects', (select count(*) from live),
    'onboarded', (select count(*) from onboarded),
    'members', (select count(distinct created_by) from onboarded),
    'managed', (select count(*) from live where mode = 'managed'),
    'onboarded_7d', (select count(*) from onboarded where onboarded_at >= now() - interval '7 days'),
    'onboarded_period', (select count(*) from onboarded where onboarded_at >= now() - make_interval(days => v_days)),
    'by_stage', (
      select jsonb_agg(jsonb_build_object('stage', s.stage, 'projects',
               (select count(*) from tagged t where t.stage = s.stage)) order by s.ord)
      from stages s
    ),
    'by_region', coalesce((
      select jsonb_agg(jsonb_build_object('region', x.region_slug, 'name', x.region_name, 'projects', x.n)
               order by x.n desc, x.region_slug)
      from (
        select coalesce(region_slug, 'unknown') as region_slug, coalesce(region_name, 'לא צוין') as region_name, count(*) as n
        from tagged group by 1, 2
      ) x
    ), '[]'::jsonb),
    'by_budget_band', (
      select jsonb_agg(jsonb_build_object('band', b.band, 'projects',
               (select count(*) from tagged t where t.budget_band = b.band)) order by b.ord)
      from budget_bands b
    ),
    'by_size_band', (
      select jsonb_agg(jsonb_build_object('band', b.band, 'projects',
               (select count(*) from tagged t where t.size_band = b.band)) order by b.ord)
      from size_bands b
    ),
    'by_move_in', (
      select jsonb_agg(jsonb_build_object('band', h.band, 'projects',
               (select count(*) from tagged t where t.horizon = h.band)) order by h.ord)
      from horizons h
    ),
    'onboarding_daily', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'onboarded',
               (select count(*) from onboarded o
                where (o.onboarded_at at time zone 'Asia/Jerusalem')::date = d.day)) order by d.day)
      from days d
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hub_staff_aggregates(integer) from public, anon;
grant execute on function public.hub_staff_aggregates(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The member's own contact history (leads.member_id is set by submitLead for
-- signed-in members). B2B lead types (joining as a pro, partners, ads, claims)
-- are not part of a builder's history.
-- ---------------------------------------------------------------------------
create or replace function public.hub_my_contacts(p_limit integer default 20)
returns table (
  lead_ref      text,
  lead_type     text,
  business_id   uuid,
  business_name text,
  business_slug text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.ref, l.type, l.business_id, b.name, b.slug, l.created_at
  from public.leads l
  left join public.businesses b on b.id = l.business_id and b.status = 'published'
  where auth.uid() is not null
    and l.member_id = auth.uid()
    and l.type not in ('join_pro', 'claim_business', 'advertise', 'partner')
    and l.status is distinct from 'spam'
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.hub_my_contacts(integer) from public, anon;
grant execute on function public.hub_my_contacts(integer) to authenticated, service_role;
