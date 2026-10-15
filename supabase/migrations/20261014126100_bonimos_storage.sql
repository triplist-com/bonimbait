-- =============================================================================
-- Bonim.Os 2/2 (P7): private Storage bucket "bonimos-photos" for the site-photo feed
--
-- Layout, one level per project:
--   bonimos-photos/<project_id>/<photo_id>.jpg     the photo (≤ 1,600 px, resized in the browser)
--   bonimos-photos/<project_id>/<photo_id>-t.jpg   its thumbnail (≤ 480 px)
-- with a matching public.bonimos_photos row (20261014126000).
--
-- Access: members of that project only (the client and their assigned
-- managers). No staff policy, no public URLs: the feed uses short-lived signed
-- URLs created with the member's own session. Limits: 4 MB per object, JPEG or
-- WebP only (the browser re-encodes everything), at most 2,000 objects (1,000
-- photos with thumbnails) per project. Objects are immutable (no update
-- policy). The uploader or a manager removes a photo.
--
-- Kept apart from hub-docs on purpose: documents are capped at 100 per
-- project, and a managed build easily produces hundreds of site photos.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bonimos-photos', 'bonimos-photos', false, 4194304, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload check: exactly '<project_id>/<uuid>[-t].(jpg|webp)', the caller is a
-- member, and the folder holds fewer than 2,000 objects.
create or replace function public.bonimos_photo_can_upload(p_name text)
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
     or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(-t)?\.(jpg|webp)$'
     or not public.hub_is_project_member(v_project) then
    return false;
  end if;
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'bonimos-photos' and o.name like v_project::text || '/%'
  ) < 2000;
end;
$$;

revoke all on function public.bonimos_photo_can_upload(text) from public, anon;
grant execute on function public.bonimos_photo_can_upload(text) to authenticated, service_role;

drop policy if exists "bonimos photos members read" on storage.objects;
create policy "bonimos photos members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bonimos-photos' and public.hub_is_project_member(public.hub_storage_project_id(name)));

drop policy if exists "bonimos photos members upload" on storage.objects;
create policy "bonimos photos members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bonimos-photos' and public.bonimos_photo_can_upload(name));

drop policy if exists "bonimos photos uploader or manager delete" on storage.objects;
create policy "bonimos photos uploader or manager delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bonimos-photos'
    and public.hub_is_project_member(public.hub_storage_project_id(name))
    and (
      owner_id = (select auth.uid())::text
      or public.hub_project_role(public.hub_storage_project_id(name)) = 'manager'
    )
  );
