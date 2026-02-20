-- ScriptSync: Add embedding column to clips table for B-roll matching
-- Run this migration in your Supabase project's SQL editor

-- Add embedding column to clips table (JSONB)
alter table public.clips
add column embedding jsonb;

-- Add index for embedding column (optional, but can speed up similarity searches)
create index if not exists clips_embedding_idx on public.clips using gin (embedding jsonb_path_ops);

-- Add index for script_segments embedding column (if not already exists)
create index if not exists script_segments_embedding_idx on public.script_segments using gin (embedding jsonb_path_ops);