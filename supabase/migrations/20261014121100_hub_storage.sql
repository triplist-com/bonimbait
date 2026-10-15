-- =============================================================================
-- Hub 2/3: private Storage bucket "hub-docs" for the builder's documents
--
-- Plans, permits, quotes, contracts, receipts and site photos. Layout:
--   hub-docs/<project_id>/<random>.<ext>      (one level, nothing else)
-- with a matching public.hub_documents row (20261014121000).
--
-- Access: members of that project only (the owner, plus a P7 manager the
-- service added). No staff policy, no public URLs: downloads are short-lived
-- signed URLs created with the member's own session. Limits are enforced by
-- the bucket (10 MB, PDF and images) and by the upload policy (at most 100
-- objects per project folder). Objects are immutable: no update policy, so a
-- replacement is a delete plus a new upload.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hub-docs', 'hub-docs', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- '<uuid>/...' -> the project id, or null for any other shape (never throws,
-- so a malformed path can't turn a policy check into a 500).
create or replace function public.hub_storage_project_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- Upload check: exactly '<project_id>/<file>', the caller is a member, and the
-- folder holds fewer than 100 objects.
create or replace function public.hub_storage_can_upload(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_project uuid := public.hub_storage_project_id(p_name);
begin
  if v_project is null
     or p_name !~ '^[0-9a-f-]{36}/[^/]{1,160}$'
     or not public.hub_is_project_member(v_project) then
    return false;
  end if;
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'hub-docs' and o.name like v_project::text || '/%'
  ) < 100;
end;
$$;

drop policy if exists "hub docs members read" on storage.objects;
create policy "hub docs members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'hub-docs' and public.hub_is_project_member(public.hub_storage_project_id(name)));

drop policy if exists "hub docs members upload" on storage.objects;
create policy "hub docs members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hub-docs' and public.hub_storage_can_upload(name));

drop policy if exists "hub docs members delete" on storage.objects;
create policy "hub docs members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'hub-docs' and public.hub_is_project_member(public.hub_storage_project_id(name)));
