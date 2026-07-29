-- ---------------------------------------------------------------------------
-- Objects in the `auth` and `storage` schemas.
--
-- WHY THIS FILE IS HAND-WRITTEN AND NOT GENERATED
--
-- `supabase db diff` only tracks the schemas it manages, which does not
-- include `auth` or `storage`. A declarative file in supabase/schemas/ that
-- created a trigger on `auth.users` or a row in `storage.buckets` would be
-- applied to the shadow database, found "missing" from the diff's field of
-- view, and silently dropped from the generated migration. Everything that
-- lives outside `public` therefore lives in a migration, and the CI check in
-- supabase-migrations.yml stays green because the diff never looks here.
--
-- Only `storage` qualifies. The diff turned out to track triggers on
-- `auth.users` perfectly well, so `on_auth_user_created` moved back into
-- supabase/schemas/16_new_user.sql where it belongs.
-- ---------------------------------------------------------------------------


-- 2. BUCKETS -----------------------------------------------------------------
--
-- Paths are `{user_id}/...` in both buckets. That is not a convention the
-- client is trusted to follow — it is what the policies below check, so an
-- upload outside your own folder is rejected by the database rather than by
-- good behaviour.
--
-- We store the PATH on `profiles.avatar_path` and `food_logs.photo_path`,
-- never a URL. Signed URLs expire, public URLs embed the project ref, and
-- SETUP.md §3 still has moving images to Cloudflare R2 as an open item. A
-- stored path makes that a change of base URL; a stored URL makes it a
-- migration over every row.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Public-read. An avatar is shown beside the user's own name on their own
  -- device today, but the filename is a uuid, so nothing is enumerable, and
  -- public read avoids re-signing a URL on every render of every screen that
  -- shows it.
  (
    'avatars', 'avatars', true,
    5 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  -- Private. A photo of a meal is a photo of where somebody was and when.
  -- Read goes through a signed URL with a short expiry.
  --
  -- HEIC is allowed because that is what an iPhone camera produces by
  -- default; the client downsizes to JPEG before upload, and the type is here
  -- so that a path which skips that step fails at the bucket rather than
  -- halfway through the scanning pipeline.
  (
    'meal-photos', 'meal-photos', false,
    10 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 3. OBJECT POLICIES ---------------------------------------------------------
--
-- `storage.objects` already has RLS enabled by the storage extension, and
-- ships with no policies, so it currently denies everything. Each policy below
-- keys on the first path segment: (storage.foldername(name))[1] is the folder,
-- and it must equal the caller's uid.

drop policy if exists "avatars: anyone may read" on storage.objects;
drop policy if exists "avatars: upload own" on storage.objects;
drop policy if exists "avatars: replace own" on storage.objects;
drop policy if exists "avatars: delete own" on storage.objects;
drop policy if exists "meal photos: read own" on storage.objects;
drop policy if exists "meal photos: upload own" on storage.objects;
drop policy if exists "meal photos: replace own" on storage.objects;
drop policy if exists "meal photos: delete own" on storage.objects;

-- Avatars ---------------------------------------------------------------
-- `to public` covers both anon and authenticated: the bucket is public, and a
-- policy narrower than the bucket setting would be a confusing half-measure.
create policy "avatars: anyone may read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "avatars: upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: replace own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Meal photos -----------------------------------------------------------
create policy "meal photos: read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meal photos: upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meal photos: replace own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meal photos: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
