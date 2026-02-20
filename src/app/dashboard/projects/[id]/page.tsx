import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { UploadClip } from '@/components/upload-clip'
import type { Database } from '@/lib/supabase/types'

type Clip = Database['public']['Tables']['clips']['Row']

const STATUS_LABELS: Record<Clip['status'], string> = {
  uploading: 'Uploading…',
  processing: 'Processing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLORS: Record<Clip['status'], string> = {
  uploading: 'text-blue-600 bg-blue-50',
  processing: 'text-yellow-700 bg-yellow-50',
  ready: 'text-green-700 bg-green-50',
  error: 'text-red-700 bg-red-50',
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

  const [{ data: project }, { data: clips }, { data: profile }] = await Promise.all([
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
  ])

  if (!project) notFound()

  const totalSeconds = profile?.total_video_seconds ?? 0
  const atCap = totalSeconds >= 5 * 3600

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

        {!atCap && (
          <UploadClip projectId={id} />
        )}
        {atCap && (
          <p className="text-sm text-red-600 font-medium">
            5-hour cap reached — upgrade to upload more
          </p>
        )}
      </div>

      {/* Clips list */}
      {!clips || clips.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">No clips yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Upload a video file to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Filename</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">AI Description</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Duration</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clips.map((clip) => (
                <tr key={clip.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px]">
                    <span className="block truncate" title={clip.filename}>{clip.filename}</span>
                    {clip.frames_extracted > 0 && (
                      <span className="text-xs text-gray-400">{clip.frames_extracted} frames</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-sm">
                    {clip.description ? (
                      <>
                        <p className="text-gray-700 line-clamp-2 text-xs">{clip.description}</p>
                        {clip.tags && clip.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {clip.tags.slice(0, 8).map((tag: string) => (
                              <span
                                key={tag}
                                className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                            {clip.tags.length > 8 && (
                              <span className="text-xs text-gray-400">+{clip.tags.length - 8} more</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">
                        {clip.status === 'ready' ? 'No description' : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDuration(clip.duration_seconds)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[clip.status as Clip['status']]}`}
                    >
                      {STATUS_LABELS[clip.status as Clip['status']]}
                    </span>
                    {clip.status === 'error' && clip.error_message && (
                      <p className="mt-0.5 text-xs text-red-500 max-w-[200px]">{clip.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(clip.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
