-- Private bucket for label photos (spec §7.4). Each user can only touch files
-- under a folder named with their own user id: <user_id>/<uuid>.jpg.
-- The client converts photos to JPEG and shrinks them before uploading
-- (spec §6.1), so the bucket only accepts JPEG up to 5 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg']);

create policy "food-photos: select own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "food-photos: insert own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "food-photos: delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
