import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { UploadClip } from '@/components/upload-clip'
import { ClipGrid } from '@/components/clip-grid'
import { ScriptPaste } from '@/components/script-paste'
import { MatchView } from '@/components/match-view'
import { CsvExport } from '@/components/csv-export'
import type { Database } from '@/lib/supabase/types'

type Clip = Database['public']['Tables']['clips']['Row']
type ScriptSegment = Database['public']['Tables']['script_segments']['Row']
type Match = Database['public']['Tables']['matches']['Row']

interface MatchWithClip extends Match {
  clips: Clip
}

interface SegmentWithMatches {
  segment: ScriptSegment
  matches: MatchWithClip[]
}

function formatUsage(seconds: number): string {
  const hours = seconds / 3600
  const cap = 5
  const pct = Math.min(100, Math.round((hours / cap) * 100))
  const hFormatted = hours < 1
    ? `${Math.round(seconds / 60)}m`
    : `${hours.toFixed(1)}h`
  return `${hFormatted} / 5h (${pct}%)`
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  // Fetch project, clips, profile, and script segments with matches
  const [
    { data: project },
    { data: clips },
    { data: profile },
    { data: segments },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('clips')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('total_video_seconds').eq('id', user.id).single(),
    supabase
      .from('script_segments')
      .select('*')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .order('position', { ascending: true }),
  ])

  if (!project) notFound()

  // Fetch matches for all segments
  let segmentsWithMatches: SegmentWithMatches[] = []
  if (segments && segments.length > 0) {
    const segmentIds = segments.map((s) => s.id)
    const { data: matches } = await supabase
      .from('matches')
      .select(`
        *,
        clips(*)
      `)
      .in('segment_id', segmentIds)
      .order('rank', { ascending: true })

    // Group matches by segment
    const matchesBySegment = new Map<string, MatchWithClip[]>()
    for (const match of matches || []) {
      const existing = matchesBySegment.get(match.segment_id) || []
      existing.push(match as MatchWithClip)
      matchesBySegment.set(match.segment_id, existing)
    }

    segmentsWithMatches = segments.map((segment) => ({
      segment,
      matches: matchesBySegment.get(segment.id) || [],
    }))
  }

  const totalSeconds = profile?.total_video_seconds ?? 0
  const atCap = totalSeconds >= 5 * 3600
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Projects
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-gray-500">{project.description}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Usage: {formatUsage(totalSeconds)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CsvExport projectId={id} projectName={project.name} />
          {!atCap ? (
            <UploadClip projectId={id} />
          ) : (
            <p className="text-sm text-red-600 font-medium">
              5-hour cap reached
            </p>
          )}
        </div>
      </div>

      {/* Main content tabs */}
      <div className="space-y-8">
        {/* Clips Section */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clips</h2>
          <ClipGrid clips={clips || []} supabaseUrl={supabaseUrl} />
        </section>

        {/* Script & Matches Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Script Paste */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Script</h2>
            <ScriptPaste
              projectId={id}
              existingSegments={segments?.map((s) => ({
                id: s.id,
                content: s.content,
                position: s.position,
              }))}
            />
          </div>

          {/* Match View */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">B-Roll Matches</h2>
            <MatchView segments={segmentsWithMatches} supabaseUrl={supabaseUrl} />
          </div>
        </section>
      </div>
    </div>
  )
}
