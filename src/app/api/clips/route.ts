import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

const VIDEO_SECONDS_CAP = 5 * 60 * 60 // 5 hours

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { project_id, filename, storage_path } = body ?? {}

  if (!project_id || !filename || !storage_path) {
    return NextResponse.json(
      { error: 'project_id, filename, and storage_path are required' },
      { status: 400 }
    )
  }

  // Verify the project belongs to this user
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Soft cap check — authoritative check happens in the worker after ffprobe
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_video_seconds')
    .eq('id', user.id)
    .single()

  if (profile && (profile.total_video_seconds ?? 0) >= VIDEO_SECONDS_CAP) {
    return NextResponse.json(
      { error: 'Video duration cap reached (5-hour total limit)' },
      { status: 429 }
    )
  }

  const clipData: Database['public']['Tables']['clips']['Insert'] = {
    project_id,
    user_id: user.id,
    filename,
    storage_path,
    status: 'processing',
  }

  const { data, error } = await supabase
    .from('clips')
    .insert(clipData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
