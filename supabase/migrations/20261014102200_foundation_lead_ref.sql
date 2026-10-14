-- =============================================================================
-- Foundation 3/3: the lead "money link"
--
--   leads.ref          Human-friendly id 'BB-<YY>-<NNNNNN>', e.g. BB-26-000123,
--                      from leads_ref_seq. Assigned by trigger on every insert
--                      (any client-supplied value is replaced), permanent,
--                      unique, not null. YY = the lead's year in Israel time; the
--                      counter itself never resets.
--   leads.attribution  4-hour last-touch attribution set by the server
--                      (apps/web lib/analytics/attribution.ts). null = direct or
--                      unknown. Untrusted writers (anon/members via PostgREST)
--                      can't set or change it.
--
-- Additive only: two columns, one sequence and our own trigger function.
-- public.leads_guard is not modified. Existing leads are backfilled in
-- creation order without touching updated_at. Idempotent.
-- =============================================================================

create sequence if not exists public.leads_ref_seq as bigint start with 1 increment by 1;

alter table public.leads add column if not exists ref text;
alter table public.leads add column if not exists attribution jsonb;

comment on column public.leads.ref is 'Human-friendly lead id, BB-YY-NNNNNN (trigger-assigned, permanent).';
comment on column public.leads.attribution is '4h last-touch attribution (lib/analytics/attribution.ts); null = direct/unknown.';

-- The next id for a lead created at p_at.
create or replace function public.next_lead_ref(p_at timestamptz default now())
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'BB-' || to_char(coalesce(p_at, now()) at time zone 'Asia/Jerusalem', 'YY') || '-'
         || lpad(nextval('public.leads_ref_seq')::text, 6, '0');
$$;

-- Not an API: nobody may burn numbers through PostgREST.
revoke execute on function public.next_lead_ref(timestamptz) from public, anon, authenticated;

create or replace function public.leads_foundation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := public.next_lead_ref(coalesce(new.created_at, now()));
    if not public.is_trusted_writer() then
      new.attribution := null;
    end if;
  else
    -- A ref is permanent; a missing one (before the backfill) may be set once.
    if old.ref is not null then
      new.ref := old.ref;
    end if;
    if not public.is_trusted_writer() then
      new.attribution := old.attribution;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_foundation_guard on public.leads;
create trigger leads_foundation_guard
  before insert or update on public.leads
  for each row execute function public.leads_foundation_guard();

-- Backfill existing leads, oldest first (only rows without a ref).
do $$
declare
  r record;
begin
  alter table public.leads disable trigger leads_set_updated_at;
  for r in select id, created_at from public.leads where ref is null order by created_at, id loop
    update public.leads set ref = public.next_lead_ref(r.created_at) where id = r.id;
  end loop;
  alter table public.leads enable trigger leads_set_updated_at;
end;
$$;

create unique index if not exists leads_ref_key on public.leads (ref);
alter table public.leads alter column ref set not null;
