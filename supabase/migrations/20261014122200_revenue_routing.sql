-- =============================================================================
-- Revenue 3/4: lead routing rules (admin-configurable).
--
-- Rules are evaluated by priority (lowest first) when a lead is stored
-- (apps/web lib/revenue/routing.ts); the first active rule whose conditions
-- all match decides where the lead goes. An empty condition array matches
-- anything. Targets:
--   owner_inbox       the site inbox (LEAD_NOTIFY_EMAIL)
--   business          forward to target_business_id's lead email
--   partner_campaign  forward to the campaign's partner and credit the campaign
--   business_default  today's behaviour (the business's lead_routing)
-- With no matching rule the code applies business_default, so an empty table
-- reproduces the current routing exactly: info@ for lead_routing='site',
-- direct for the rest.
--
-- Staff only (RLS). Idempotent.
-- =============================================================================

create table if not exists public.lead_routing_rules (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 2 and 120),
  is_active          boolean not null default true,
  priority           smallint not null default 100 check (priority between 0 and 10000),
  lead_types         text[] not null default '{}',
  specialty_slugs    text[] not null default '{}',
  region_slugs       text[] not null default '{}',
  stages             text[] not null default '{}',
  min_score          smallint check (min_score is null or min_score between 0 and 100),
  max_score          smallint check (max_score is null or max_score between 0 and 100),
  target             text not null check (target in ('owner_inbox', 'business', 'partner_campaign', 'business_default')),
  target_business_id uuid references public.businesses (id) on delete cascade,
  target_campaign_id uuid references public.partner_campaigns (id) on delete cascade,
  note               text check (note is null or length(note) <= 500),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint lead_routing_rules_target_ref check (
    (target = 'business' and target_business_id is not null)
    or (target = 'partner_campaign' and target_campaign_id is not null)
    or target in ('owner_inbox', 'business_default')
  ),
  constraint lead_routing_rules_score_range check (min_score is null or max_score is null or min_score <= max_score)
);

create index if not exists lead_routing_rules_active_idx on public.lead_routing_rules (is_active, priority);

drop trigger if exists lead_routing_rules_set_updated_at on public.lead_routing_rules;
create trigger lead_routing_rules_set_updated_at
  before update on public.lead_routing_rules
  for each row execute function public.set_updated_at();

alter table public.lead_routing_rules enable row level security;
drop policy if exists "staff full access" on public.lead_routing_rules;
create policy "staff full access" on public.lead_routing_rules
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
