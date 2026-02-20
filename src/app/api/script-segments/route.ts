import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// POST: Create script segments from paragraphs
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { project_id, paragraphs } = body ?? {}

  if (!project_id || !Array.isArray(paragraphs) || paragraphs.length === 0) {
    return NextResponse.json(
      { error: 'project_id and paragraphs array are required' },
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

  // First, delete existing segments for this project (replace mode)
  const { error: deleteError } = await supabase
    .from('script_segments')
    .delete()
    .eq('project_id', project_id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json(
      { error: 'Failed to clear existing segments' },
      { status: 500 }
    )
  }

  // Insert new segments
  const segmentsToInsert: Database['public']['Tables']['script_segments']['Insert'][] =
    paragraphs.map((content: string, index: number) => ({
      project_id,
      user_id: user.id,
      content: content.trim(),
      position: index,
    }))

  const { data, error } = await supabase
    .from('script_segments')
    .insert(segmentsToInsert)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Trigger matching via the worker (async, don't wait)
  // This is a fire-and-forget call to the worker
  fetch(`${process.env.WORKER_URL || 'http://localhost:3001'}/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WORKER_API_KEY || ''}`,
    },
    body: JSON.stringify({ project_id }),
  }).catch(() => {
    // Worker matching is best-effort; failures are logged but don't block
  })

  return NextResponse.json(data, { status: 201 })
}

// DELETE: Clear all script segments for a project
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const project_id = searchParams.get('project_id')

  if (!project_id) {
    return NextResponse.json(
      { error: 'project_id is required' },
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

  const { error } = await supabase
    .from('script_segments')
    .delete()
    .eq('project_id', project_id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
