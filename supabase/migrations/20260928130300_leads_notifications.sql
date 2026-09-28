-- =============================================================================
-- Wave 2 / Leads: notification tracking, rate-limit key, /contact/ redirect.
-- Idempotent and additive (safe to re-run on the shared DB).
-- =============================================================================

-- Notification outcome recorded by apps/web/lib/leads/notify.ts. Notifying
-- never blocks the visitor, so failures are only visible here.
--   pending  lead stored, notifier not finished (or crashed)
--   sent     every configured channel succeeded
--   partial  at least one channel succeeded, at least one failed
--   failed   every configured channel failed
--   logged   no channel configured (dev): the lead was written to the log
alter table public.leads add column if not exists notify_status text not null default 'pending';
alter table public.leads add column if not exists notify_channels jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists notify_error text;
alter table public.leads add column if not exists notified_at timestamptz;
-- Salted SHA-256 of the submitter IP (never the raw IP): per-IP rate limit.
alter table public.leads add column if not exists ip_hash text;

alter table public.leads drop constraint if exists leads_notify_status_check;
alter table public.leads add constraint leads_notify_status_check
  check (notify_status in ('pending', 'sent', 'partial', 'failed', 'logged'));

create index if not exists leads_ip_hash_created_idx on public.leads (ip_hash, created_at desc)
  where ip_hash is not null;
create index if not exists leads_created_idx on public.leads (created_at desc);

-- Public (non-trusted) inserts cannot pre-set workflow or notification fields.
create or replace function public.leads_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trusted_writer() then
    new.status          := 'new';
    new.member_id       := auth.uid();   -- null for anonymous visitors
    new.assigned_to     := null;
    new.forwarded_to    := null;
    new.notes           := null;
    new.notify_status   := 'pending';
    new.notify_channels := '{}'::jsonb;
    new.notify_error    := null;
    new.notified_at     := null;
  end if;
  return new;
end;
$$;

-- /contact/ (the old English page) -> the live Hebrew contact page.
insert into public.redirects (from_path, to_path, code, is_active, source, note) values
  ('/contact', '/צור-קשר/', 301, true, 'manual', 'old English contact page -> live Hebrew slug')
on conflict (from_path) do nothing;
