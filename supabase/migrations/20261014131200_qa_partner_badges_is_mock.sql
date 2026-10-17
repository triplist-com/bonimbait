-- QA (Wave C): public partner badges say whether the tier was paid with the
-- mock provider, so the app leaves those tiers out of public badges and
-- ordering on production (apps/web lib/revenue/badges.ts). A mock "purchase"
-- on a preview deployment that shares the production database must never
-- feature a business on the live site.
--
-- Same view as 20261014122100_revenue_partners.sql, plus is_mock (a boolean,
-- not the provider name). Idempotent (create or replace view; grant restated).

create or replace view public.partner_badges as
  select s.business_id,
         t.slug as tier_slug,
         t.name as tier_name,
         t.badge_label,
         t.rank,
         coalesce(s.provider = 'mock', false) as is_mock
    from public.partner_subscriptions s
    join public.partner_tiers t on t.id = s.tier_id
    join public.businesses b on b.id = s.business_id
   where s.status in ('active', 'past_due') and t.is_active and b.status = 'published';

grant select on public.partner_badges to anon, authenticated;
