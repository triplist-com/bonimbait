-- Enable RLS on the legacy apps/api `pregenerated_answers` table, which
-- 20260928120700_harden_legacy_api_tables.sql missed.
--
-- With no policies, PostgREST (anon/authenticated keys) can neither read nor
-- write it. apps/api and scripts/generate_answers.py connect directly as the
-- table owner, which bypasses RLS, so they are unaffected.
--
-- Guarded with to_regclass: a no-op on databases without the legacy table.

do $$
begin
  if to_regclass('public.pregenerated_answers') is not null then
    alter table public.pregenerated_answers enable row level security;
  end if;
end;
$$;
