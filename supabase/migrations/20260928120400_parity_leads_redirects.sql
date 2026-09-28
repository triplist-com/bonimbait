-- =============================================================================
-- Parity foundation 5/7: leads + redirects. All objects are new.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Leads (consultation, contact, advertise, partner, join-as-pro forms)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  type        text not null
                check (type in ('consultation', 'contact', 'advertise', 'partner', 'join_pro')),
  status      text not null default 'new'
                check (status in ('new', 'in_progress', 'qualified', 'closed', 'spam')),
  full_name   text,
  email       text,
  phone       text,
  message     text,
  payload     jsonb not null default '{}'::jsonb,   -- form-specific fields
  source_url  text,
  utm         jsonb not null default '{}'::jsonb,
  business_id uuid references public.businesses (id) on delete set null,  -- lead aimed at a specific pro
  member_id   uuid references public.profiles (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_type_idx on public.leads (type);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Guard: public submissions cannot pre-set workflow fields.
create or replace function public.leads_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    new.status      := 'new';
    new.member_id   := auth.uid();   -- null for anonymous visitors
    new.assigned_to := null;
    new.notes       := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_guard on public.leads;
create trigger leads_guard
  before insert on public.leads
  for each row execute function public.leads_guard();

-- ---------------------------------------------------------------------------
-- Redirects (replaces the WP Redirection plugin). Looked up by middleware.
-- from_path is stored normalized: decoded, leading '/', no trailing '/',
-- lower-case (see apps/web/lib/redirects/normalize.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.redirects (
  id         uuid primary key default gen_random_uuid(),
  from_path  text not null unique check (from_path like '/%'),
  to_path    text not null,                       -- path ('/new/') or absolute URL
  code       smallint not null default 301 check (code in (301, 302, 307, 308)),
  is_active  boolean not null default true,
  source     text not null default 'manual'
               check (source in ('manual', 'wp_redirection', 'migration')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists redirects_set_updated_at on public.redirects;
create trigger redirects_set_updated_at
  before update on public.redirects
  for each row execute function public.set_updated_at();
