-- =============================================================================
-- Wave 3 / Admin: lead inbox workflow statuses.
--
-- The admin inbox uses new -> contacted -> won | lost (+ spam). The Wave 1
-- names (in_progress, qualified, closed) stay valid so nothing that still
-- writes them breaks; existing rows are mapped to the new names and the admin
-- shows any leftover legacy value under its new label.
--
-- Idempotent and additive. Safe to re-run on the shared DB.
-- =============================================================================

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'won', 'lost', 'spam', 'in_progress', 'qualified', 'closed'));

update public.leads set status = 'contacted' where status = 'in_progress';
update public.leads set status = 'won'       where status = 'qualified';
update public.leads set status = 'lost'      where status = 'closed';

-- Admin inbox filters: type + status + newest first.
create index if not exists leads_type_status_created_idx on public.leads (type, status, created_at desc);
