-- ScriptSync: Add video seconds RPC function
-- Run this migration in your Supabase project's SQL editor

-- Create function to safely add video seconds to a user's profile
create or replace function public.add_video_seconds(
  p_user_id uuid,
  p_seconds float
)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set total_video_seconds = total_video_seconds + p_seconds
  where id = p_user_id;
end;
$$;