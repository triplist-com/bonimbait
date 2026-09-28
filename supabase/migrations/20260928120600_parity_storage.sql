-- =============================================================================
-- Parity foundation 7/7: Supabase Storage bucket for site media
--
-- Bucket "media" (public read via public URLs). Path conventions:
--   posts/<post_id>/...          staff
--   pages/<page_id>/...          staff
--   products/<product_id>/...    staff
--   events/<event_id>/...        staff
--   migrated/...                 import loader (service role)
--   businesses/<business_id>/... staff + that business's owner
--   members/<user_id>/...        the member (avatar)
-- Existing buckets used by apps/api (video thumbnails) are not touched.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media staff write" on storage.objects;
create policy "media staff write" on storage.objects
  for all to authenticated
  using (bucket_id = 'media' and public.is_staff())
  with check (bucket_id = 'media' and public.is_staff());

drop policy if exists "media business owner write" on storage.objects;
create policy "media business owner write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'businesses'
    and exists (select 1 from public.businesses b
                where b.id::text = (storage.foldername(name))[2]
                  and b.owner_member_id = auth.uid())
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'businesses'
    and exists (select 1 from public.businesses b
                where b.id::text = (storage.foldername(name))[2]
                  and b.owner_member_id = auth.uid())
  );

drop policy if exists "media member own folder" on storage.objects;
create policy "media member own folder" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'members'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'members'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
