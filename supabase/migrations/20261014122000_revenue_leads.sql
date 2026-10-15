-- =============================================================================
-- Revenue 1/4: scored leads and consult bookings (the money link).
--
--   leads.score      0-100 lead score (apps/web lib/project-file/score.ts). The
--                    trigger copies it from payload.project_score.score, so the
--                    server writes one insert. Null = not scored.
--   leads.booked_at  When the free consultation was booked: Calendly's
--                    event_scheduled (lib/revenue/booking.ts) or the consult
--                    team booking it by phone (the consult queue).
--
-- payload keys owned by revenue, written by the server (trusted writers only):
--   project_file   the ProjectFile (docs/platform/PROGRAM.md §6)
--   project_score  { version, score, band, reasons[], missing[] }
--   routing        the routing decision { rule_id, rule_name, target, business_id, campaign_id }
--   booking        { method, at, calendly_event, calendly_invitee }
-- Untrusted writers (anon and members via PostgREST) can't set score,
-- booked_at, project_score, routing or booking: the guard strips them on
-- insert and keeps the stored values on update. `routing` grants a business
-- read access (policy below), so it must never come from a browser.
--
-- Additive and idempotent: two columns, one trigger function and trigger of
-- our own, indexes and one select policy. Existing triggers are untouched.
-- =============================================================================

alter table public.leads add column if not exists score smallint;
alter table public.leads add column if not exists booked_at timestamptz;

alter table public.leads drop constraint if exists leads_score_range;
alter table public.leads add constraint leads_score_range check (score is null or score between 0 and 100);

comment on column public.leads.score is 'Lead score 0-100 (lib/project-file/score.ts); synced from payload.project_score.score.';
comment on column public.leads.booked_at is 'When the consultation was booked (Calendly event_scheduled or the consult team).';

create or replace function public.leads_revenue_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted boolean := public.is_trusted_writer();
  raw_score text;
begin
  new.payload := coalesce(new.payload, '{}'::jsonb);

  if not trusted then
    if tg_op = 'INSERT' then
      new.score := null;
      new.booked_at := null;
      new.payload := new.payload - 'project_score' - 'routing' - 'booking';
    else
      new.score := old.score;
      new.booked_at := old.booked_at;
      new.payload := (new.payload - 'project_file' - 'project_score' - 'routing' - 'booking')
        || jsonb_strip_nulls(jsonb_build_object(
             'project_file', old.payload -> 'project_file',
             'project_score', old.payload -> 'project_score',
             'routing', old.payload -> 'routing',
             'booking', old.payload -> 'booking'));
    end if;
    return new;
  end if;

  -- Trusted: keep the column in step with the stored score (unless the writer set it explicitly).
  raw_score := new.payload #>> '{project_score,score}';
  if raw_score ~ '^[0-9]{1,3}$' then
    if tg_op = 'INSERT' and new.score is null then
      new.score := least(100, raw_score::int);
    elsif tg_op = 'UPDATE'
      and new.score is not distinct from old.score
      and (new.payload -> 'project_score') is distinct from (old.payload -> 'project_score') then
      new.score := least(100, raw_score::int);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_revenue_guard on public.leads;
create trigger leads_revenue_guard
  before insert or update on public.leads
  for each row execute function public.leads_revenue_guard();

-- The consult queue: consultation leads by score.
create index if not exists leads_type_score_idx on public.leads (type, score desc nulls last, created_at desc);
create index if not exists leads_booked_idx on public.leads (booked_at desc) where booked_at is not null;
-- Leads forwarded to a business by a routing rule (partner reports, RLS below).
create index if not exists leads_routing_business_idx on public.leads ((payload #>> '{routing,business_id}'))
  where payload ? 'routing';

-- A business owner also reads the leads a routing rule forwarded to their
-- business (the existing "business owner read" covers leads.business_id).
drop policy if exists "routed business owner read" on public.leads;
create policy "routed business owner read" on public.leads
  for select to authenticated using (
    payload ? 'routing'
    and exists (
      select 1 from public.businesses b
      where b.owner_member_id = auth.uid()
        and b.id::text = leads.payload #>> '{routing,business_id}'
    )
  );
