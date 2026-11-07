-- Let users read (list) the files in their own folder of post-images.
--
-- Supabase Storage needs SELECT as well as DELETE permission to remove a
-- file. Without this policy, deleting a post's image or a replaced profile
-- photo failed silently and left orphaned files (3 of 5 files at the time).
-- Images stay publicly viewable through their public URLs as before.

begin;

drop policy if exists "Users can view their own images" on storage.objects;
create policy "Users can view their own images"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'post-images'
        and (storage.foldername(name))[1] = (auth.uid())::text
    );

commit;
