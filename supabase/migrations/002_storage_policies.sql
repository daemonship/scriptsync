-- ScriptSync storage setup
-- Run this migration in your Supabase project's SQL editor

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Create 'clips' bucket for raw video uploads (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clips',
  'clips',
  false,
  2147483648, -- 2GB
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Create 'frames' bucket for extracted frames and thumbnails (public for thumbnails)
insert into storage.buckets (id, name, public)
values ('frames', 'frames', true)
on conflict (id) do update set public = true;

-- ============================================================
-- STORAGE POLICIES — clips bucket
-- ============================================================

-- Users can upload to their own folder: clips/{userId}/...
create policy "clips: users can upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'clips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own clips
create policy "clips: users can read own files"
  on storage.objects for select
  using (
    bucket_id = 'clips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own clips
create policy "clips: users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'clips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- STORAGE POLICIES — frames bucket
-- ============================================================

-- Anyone can read frames (public bucket for thumbnails)
create policy "frames: public read access"
  on storage.objects for select
  using (bucket_id = 'frames');

-- Note: frames are written by the worker using service role key,
-- which bypasses RLS. No insert policy needed for regular users.
