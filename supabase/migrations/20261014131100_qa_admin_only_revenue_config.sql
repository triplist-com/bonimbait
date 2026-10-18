-- QA (Wave C): revenue configuration is admin-only in the database too.
--
-- 1. partner_tiers (prices, benefits) and lead_routing_rules (where leads go)
--    are admin-only screens in the app (/admin/partners/tiers/,
--    /admin/lead-routing/), but their RLS was "staff full access", so an
--    editor could PATCH a tier's price to 0, or add a rule that forwards leads
--    to any business (whose owner then reads them under "routed business owner
--    read"), straight through PostgREST. Now: staff read, admin write. The
--    public keeps reading active tiers.
-- 2. revenue_lead_belongs() and revenue_owns_business() answer for any caller,
--    including anon (execute was never revoked from PUBLIC). Only the
--    authenticated policies on partner_* and the app use them: anon loses
--    EXECUTE.
--
-- Idempotent: drop policy if exists / create policy, revoke/grant.

-- 1 -------------------------------------------------------------------------
drop policy if exists "staff full access" on public.partner_tiers;
drop policy if exists "staff read" on public.partner_tiers;
drop policy if exists "admin write" on public.partner_tiers;
create policy "staff read" on public.partner_tiers
  for select to authenticated using ((select public.is_staff()));
create policy "admin write" on public.partner_tiers
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "staff full access" on public.lead_routing_rules;
drop policy if exists "staff read" on public.lead_routing_rules;
drop policy if exists "admin write" on public.lead_routing_rules;
create policy "staff read" on public.lead_routing_rules
  for select to authenticated using ((select public.is_staff()));
create policy "admin write" on public.lead_routing_rules
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- 2 -------------------------------------------------------------------------
revoke execute on function public.revenue_lead_belongs(uuid, uuid) from public, anon;
grant execute on function public.revenue_lead_belongs(uuid, uuid) to authenticated, service_role;
revoke execute on function public.revenue_owns_business(uuid) from public, anon;
grant execute on function public.revenue_owns_business(uuid) to authenticated, service_role;
