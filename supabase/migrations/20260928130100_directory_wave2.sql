-- =============================================================================
-- Wave 2 / Directory: claim requests, lead rate-limit indexes, review
-- aggregate that matches the live "overall %".
--
-- Idempotent and additive. Safe to re-run on the shared DB.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. leads.type gains 'claim_business' ("claim this business" requests,
--    approved by an admin in Wave 3).
--
-- Other workstreams may extend the same check in parallel, so the constraint
-- is rebuilt from whatever values it currently allows plus ours, instead of
-- from a hard-coded list.
-- ---------------------------------------------------------------------------
do $$
declare
  current_def text;
  vals text[];
begin
  select pg_get_constraintdef(c.oid) into current_def
  from pg_constraint c
  where c.conrelid = 'public.leads'::regclass and c.conname = 'leads_type_check';

  if current_def is not null and current_def ~ '\mclaim_business\M' then
    return;  -- already present
  end if;

  -- Wave 1 base list, plus anything another workstream has added since.
  vals := array['consultation', 'contact', 'advertise', 'partner', 'join_pro',
                'business_contact', 'benefit', 'whatsapp_join', 'service_plan'];
  if current_def is not null then
    select array(
      select distinct v from unnest(
        vals || coalesce(
          -- Works for both ARRAY['a'::text, ...] and '{a,b}'::text[] renderings.
          (select array_agg(t.m[1])
             from regexp_matches(current_def, '([a-z][a-z_]*)', 'g') as t(m)
            where t.m[1] not in ('check', 'type', 'any', 'array', 'text')),
          '{}'::text[]
        )
      ) as v
    ) into vals;
  end if;

  vals := array_append(vals, 'claim_business');

  alter table public.leads drop constraint if exists leads_type_check;
  execute format(
    'alter table public.leads add constraint leads_type_check check (type = any (array[%s]::text[]))',
    (select string_agg(quote_literal(v), ', ') from unnest(vals) as v)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting for the phone-reveal popup. The server action stores a
--    salted hash of the visitor IP in payload.ip_hash and counts recent
--    business_contact leads per (ip, business) and per ip.
-- ---------------------------------------------------------------------------
create index if not exists leads_business_contact_ip_idx
  on public.leads ((payload ->> 'ip_hash'), created_at desc)
  where type = 'business_contact';

create index if not exists leads_business_created_idx
  on public.leads (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Review aggregate. The live "ציון משוקלל" percent is the mean of the four
--    sub-score averages x 10 (verified against the crawl: e.g. 9.5/10/10/10
--    -> 99%, 7.2/8.2/8.2/8.0 -> 79%). Migrated per-review `rating` values are
--    all 10, so avg(rating) would overstate it. Same columns as the Wave 1
--    view; only rating_avg / rating_percent change.
-- ---------------------------------------------------------------------------
create or replace view public.business_review_stats
with (security_invoker = true) as
  with agg as (
    select
      r.business_id,
      count(*)::integer              as review_count,
      avg(r.rating)                  as rating_raw,
      avg(r.score_value)             as v,
      avg(r.score_availability)      as a,
      avg(r.score_attitude)          as t,
      avg(r.score_reliability)       as l
    from public.reviews r
    where r.status = 'approved'
    group by r.business_id
  ),
  overall as (
    select
      agg.*,
      coalesce(
        (select avg(x) from unnest(array[agg.v, agg.a, agg.t, agg.l]) as x),
        agg.rating_raw
      ) as overall
    from agg
  )
  select
    business_id,
    review_count,
    round(overall, 2)                  as rating_avg,
    round(overall * 10)::integer       as rating_percent,
    round(v, 2)                        as score_value_avg,
    round(a, 2)                        as score_availability_avg,
    round(t, 2)                        as score_attitude_avg,
    round(l, 2)                        as score_reliability_avg
  from overall;
