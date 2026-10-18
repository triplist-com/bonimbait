-- =============================================================================
-- Growth (P6): "שלחו לי את הדוח" leads from the budget planner.
--
-- leads.type gains 'budget_report': a builder leaves an email or phone to get
-- the printable estimate. The estimate rides in leads.payload (estimate id,
-- totals, answers, price book date, report URL) through the existing leads
-- pipeline (apps/web lib/leads/submit.ts): refs, attribution and notifications
-- work as for every other lead.
--
-- Other squads may extend the same check in parallel, so the constraint is
-- rebuilt from whatever values it currently allows plus ours, never from a
-- hard-coded list. Idempotent.
-- =============================================================================

do $$
declare
  current_def text;
  vals text[];
begin
  select pg_get_constraintdef(c.oid) into current_def
  from pg_constraint c
  where c.conrelid = 'public.leads'::regclass and c.conname = 'leads_type_check';

  if current_def is not null and current_def ~ '\mbudget_report\M' then
    return;  -- already present
  end if;

  vals := array['consultation', 'contact', 'advertise', 'partner', 'join_pro',
                'business_contact', 'benefit', 'whatsapp_join', 'service_plan', 'claim_business'];
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

  vals := array_append(vals, 'budget_report');

  alter table public.leads drop constraint if exists leads_type_check;
  execute format(
    'alter table public.leads add constraint leads_type_check check (type = any (array[%s]::text[]))',
    (select string_agg(quote_literal(v), ', ') from unnest(vals) as v)
  );
end;
$$;
