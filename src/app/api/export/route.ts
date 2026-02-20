import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Export matches as CSV
export async function GET(request: Request) {
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
    .select('id, name')
    .eq('id', project_id)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Fetch all matches with their segments and clips
  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id,
      similarity_score,
      rank,
      segment_id,
      clip_id,
      script_segments!inner(
        id,
        content,
        position
      ),
      clips!inner(
        id,
        filename,
        description,
        tags
      )
    `)
    .eq('script_segments.project_id', project_id)
    .order('script_segments.position', { ascending: true })
    .order('rank', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV
  const headers = [
    'Segment Position',
    'Script Paragraph',
    'Clip Filename',
    'Clip Description',
    'Clip Tags',
    'Similarity Score',
    'Match Rank',
  ]

  const rows = (matches || []).map((match: any) => {
    const segment = match.script_segments
    const clip = match.clips

    return [
      segment.position + 1,
      // Escape quotes and wrap in quotes if contains comma or newline
      escapeCsvField(segment.content),
      escapeCsvField(clip.filename),
      escapeCsvField(clip.description || ''),
      // Tags as semicolon-separated list
      clip.tags ? clip.tags.join('; ') : '',
      match.similarity_score.toFixed(4),
      match.rank,
    ]
  })

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_matches.csv"`,
    },
  })
}

function escapeCsvField(field: string): string {
  if (!field) return ''
  // If the field contains commas, quotes, or newlines, wrap it in quotes
  if (/[",\n\r]/.test(field)) {
    // Escape quotes by doubling them
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}
