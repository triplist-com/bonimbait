-- =============================================================================
-- OPTIONAL but recommended: enable RLS on the apps/api (Alembic) tables.
--
-- Why: on Supabase, tables in `public` are exposed through PostgREST. Without
-- RLS, anyone holding the anon key (which ships to browsers once the web app
-- uses Supabase) could read AND write categories / videos / video_segments /
-- embeddings / analytics_events.
--
-- Effect on apps/api: none. FastAPI connects as the table owner (postgres)
-- through the pooler; owners bypass RLS (RLS is not FORCEd here). No columns,
-- data or constraints are changed.
--
-- Guarded with to_regclass so it is a no-op for tables that don't exist.
-- The orchestrator may skip this file if it prefers to harden separately.
-- =============================================================================

do $$
declare
  t text;
begin
  -- Public read + staff write
  foreach t in array array['public.categories', 'public.videos', 'public.video_segments'] loop
    if to_regclass(t) is not null then
      execute format('alter table %s enable row level security', t);
      execute format('drop policy if exists "public read" on %s', t);
      execute format('create policy "public read" on %s for select using (true)', t);
      execute format('drop policy if exists "staff full access" on %s', t);
      execute format(
        'create policy "staff full access" on %s for all to authenticated '
        'using (public.is_staff()) with check (public.is_staff())', t);
    end if;
  end loop;

  -- No API access at all (server/owner only)
  foreach t in array array['public.embeddings', 'public.analytics_events'] loop
    if to_regclass(t) is not null then
      execute format('alter table %s enable row level security', t);
    end if;
  end loop;
end;
$$;
