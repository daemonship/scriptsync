-- ScriptSync initial schema
-- Run this migration in your Supabase project's SQL editor

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  total_video_seconds float not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PROJECTS
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CLIPS
-- ============================================================
create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  storage_path text not null,
  thumbnail_path text,
  duration_seconds float,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'error')),
  description text,
  tags text[] not null default '{}',
  frames_extracted integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SCRIPT SEGMENTS
-- ============================================================
create table if not exists public.script_segments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  position integer not null,
  embedding jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MATCHES
-- ============================================================
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid references public.script_segments(id) on delete cascade not null,
  clip_id uuid references public.clips(id) on delete cascade not null,
  similarity_score float not null,
  rank integer not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Profiles: users can only read/update their own
alter table public.profiles enable row level security;
create policy "profiles: own row" on public.profiles
  using (auth.uid() = id);

-- Projects: users own their projects
alter table public.projects enable row level security;
create policy "projects: own rows" on public.projects
  using (auth.uid() = user_id);

-- Clips: users own their clips
alter table public.clips enable row level security;
create policy "clips: own rows" on public.clips
  using (auth.uid() = user_id);

-- Script segments: users own their segments
alter table public.script_segments enable row level security;
create policy "script_segments: own rows" on public.script_segments
  using (auth.uid() = user_id);

-- Matches: users can read matches for their own segments
alter table public.matches enable row level security;
create policy "matches: own via segment" on public.matches
  using (
    segment_id in (
      select id from public.script_segments where user_id = auth.uid()
    )
  );

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Create these buckets in Supabase Storage dashboard or via API:
--   "clips"   — stores raw uploaded video files (private)
--   "frames"  — stores extracted frames (private)
-- Storage policies should match auth.uid() = owner

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists clips_project_id_idx on public.clips(project_id);
create index if not exists clips_status_idx on public.clips(status);
create index if not exists script_segments_project_id_idx on public.script_segments(project_id);
create index if not exists matches_segment_id_idx on public.matches(segment_id);
create index if not exists matches_clip_id_idx on public.matches(clip_id);
