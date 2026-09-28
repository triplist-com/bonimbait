-- =============================================================================
-- Parity foundation 5/7: leads + redirects. All objects are new.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Leads — every live form becomes a lead (replaces CF7 + Zapier):
--   consultation     budget-consultation CTA (Calendly on live; lead on booking)
--   contact          /צור-קשר/
--   advertise        /join-us/ ("פרסמו אצלנו")
--   partner          /strategic-partners/
--   join_pro         join as a professional
--   business_contact phone-reveal popup on /business/<slug>/ (routes per
--                    businesses.lead_routing)
--   benefit          benefit/product "חזרו אליי" forms
--   whatsapp_join    WhatsApp community join form (reveals the invite link)
--   service_plan     interest in a construction-management plan
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null
                       check (type in ('consultation', 'contact', 'advertise', 'partner', 'join_pro',
                                       'business_contact', 'benefit', 'whatsapp_join', 'service_plan')),
  status             text not null default 'new'
                       check (status in ('new', 'in_progress', 'qualified', 'closed', 'spam')),
  full_name          text,
  email              text,
  phone              text,
  message            text,
  region_id          uuid references public.regions (id) on delete set null,
  construction_stage text,
  payload            jsonb not null default '{}'::jsonb,   -- form-specific fields (company, category, consents, ...)
  source_url         text,
  utm                jsonb not null default '{}'::jsonb,
  business_id        uuid references public.businesses (id) on delete set null,
  product_id         uuid references public.products (id) on delete set null,
  service_plan_id    uuid references public.service_plans (id) on delete set null,
  whatsapp_group_id  uuid references public.whatsapp_groups (id) on delete set null,
  member_id          uuid references public.profiles (id) on delete set null,
  assigned_to        uuid references public.profiles (id) on delete set null,
  forwarded_to       text,            -- email the lead was routed to (info@ or the business)
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_type_idx on public.leads (type);
create index if not exists leads_business_idx on public.leads (business_id);

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
    new.status       := 'new';
    new.member_id    := auth.uid();   -- null for anonymous visitors
    new.assigned_to  := null;
    new.forwarded_to := null;
    new.notes        := null;
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

-- Seed: the 10 redirects observed on the live site
-- (data/migration/parity_baseline_live.csv, 2026-09-28).
--
-- The /checkout/ and /partner-portal/ 302s are dynamic WordPress behaviour
-- (empty cart -> cart; signed-out -> login), not static rules. They are
-- seeded INACTIVE for the record: an active row would shadow the real
-- /checkout/ and /partner-portal/ routes, which must reproduce the 302
-- themselves (see docs/ARCHITECTURE_PARITY.md#redirects).
insert into public.redirects (from_path, to_path, code, is_active, source, note) values
  ('/סיור-מסירת-שלד-בשיטת-icf-של-חברת-gsb-בדרום-וט',        '/שיטת-icf-סיור-בשטח-מה-זו-השיטה-הזו-ומדוע-ה/', 301, true,  'wp_redirection', 'live post redirect'),
  ('/פודקאסט-בונים-בית-על-בידוד-תרמי-ושיטת-icf',            '/שיטת-icf-סיור-בשטח-מה-זו-השיטה-הזו-ומדוע-ה/', 301, true,  'wp_redirection', 'live post redirect'),
  ('/איך-מוצאים-מונעים-טעויות-תכנון-שעולות',               '/סופרפוזיציה-מה-זה-ואיך-אנחנו-יכולים-לע/',    301, true,  'wp_redirection', 'live post redirect'),
  ('/תודה-על-השארת-פרטים',                                  '/thank-you/',                                  301, true,  'wp_redirection', 'live page redirect'),
  ('/video/12-טיפים-שהם-חובה-לבחירה-נכונה-של-האדריכ-2',     '/איך-בוחרים-אדריכל/',                         301, true,  'wp_redirection', 'live video redirect'),
  ('/video/פודקאסט-פרק-73-הכל-על-שיטת-icf-והאם-יש-הפרש-ב',  '/שיטת-icf-סיור-בשטח-מה-זו-השיטה-הזו-ומדוע-ה/', 301, true,  'wp_redirection', 'live video redirect'),
  ('/video/איך-בוחרים-נכון-אדריכל-בישראל-ב-2019-פרק-ש-3',   '/איך-בוחרים-אדריכל/',                         301, true,  'wp_redirection', 'live video redirect'),
  ('/partner-portal-2',                                     '/partner-portal/',                             302, true,  'wp_redirection', 'duplicate business portal page; live 302s to wp-login'),
  ('/checkout',                                             '/cart/',                                       302, false, 'wp_redirection', 'INACTIVE: /checkout/ route must 302 to /cart/ when the cart is empty'),
  ('/partner-portal',                                       '/login/?next=/partner-portal/',                302, false, 'wp_redirection', 'INACTIVE: /partner-portal/ route must 302 to /login/ when signed out')
on conflict (from_path) do nothing;
