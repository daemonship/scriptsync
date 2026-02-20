'use client'

import { useState } from 'react'
import Image from 'next/image'
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

interface MatchViewProps {
  segments: SegmentWithMatches[]
  supabaseUrl: string
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SimilarityBadge({ score }: { score: number }) {
  // Score is typically between -1 and 1 for cosine similarity
  // Higher is better, normalize to percentage for display
  const percentage = Math.round(((score + 1) / 2) * 100)

  let colorClass = 'bg-gray-100 text-gray-600'
  if (percentage >= 80) colorClass = 'bg-green-100 text-green-700'
  else if (percentage >= 60) colorClass = 'bg-blue-100 text-blue-700'
  else if (percentage >= 40) colorClass = 'bg-yellow-100 text-yellow-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {percentage}% match
    </span>
  )
}

export function MatchView({ segments, supabaseUrl }: MatchViewProps) {
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set())
  const [showAllMatches, setShowAllMatches] = useState<Set<string>>(new Set())

  const toggleExpanded = (segmentId: string) => {
    const newSet = new Set(expandedSegments)
    if (newSet.has(segmentId)) {
      newSet.delete(segmentId)
    } else {
      newSet.add(segmentId)
    }
    setExpandedSegments(newSet)
  }

  const toggleShowAll = (segmentId: string) => {
    const newSet = new Set(showAllMatches)
    if (newSet.has(segmentId)) {
      newSet.delete(segmentId)
    } else {
      newSet.add(segmentId)
    }
    setShowAllMatches(newSet)
  }

  if (segments.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-500">No script segments yet.</p>
        <p className="mt-1 text-sm text-gray-400">
          Paste your script to see B-roll match suggestions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {segments.map(({ segment, matches }) => {
        const isExpanded = expandedSegments.has(segment.id)
        const showAll = showAllMatches.has(segment.id)
        const displayMatches = showAll ? matches : matches.slice(0, 3)
        const hasMore = matches.length > 3

        return (
          <div
            key={segment.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            {/* Segment header */}
            <button
              onClick={() => toggleExpanded(segment.id)}
              className="w-full px-4 py-3 flex items-start justify-between hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex-1 pr-4">
                <span className="text-xs text-gray-400 font-mono">#{segment.position + 1}</span>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {segment.content.length > 200 && !isExpanded
                    ? segment.content.slice(0, 200) + '...'
                    : segment.content}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {matches.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {matches.length} clip{matches.length !== 1 ? 's' : ''}
                  </span>
                )}
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>

            {/* Matches grid */}
            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                {displayMatches.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    No matching clips found for this segment.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {displayMatches.map((match) => (
                        <div
                          key={match.id}
                          className="bg-white rounded-md border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow"
                        >
                          {/* Thumbnail */}
                          <div className="aspect-video bg-gray-100 relative">
                            {match.clips.thumbnail_path ? (
                              <Image
                                src={`${supabaseUrl}/storage/v1/object/public/frames/${match.clips.thumbnail_path}`}
                                alt={match.clips.filename}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <svg
                                  className="h-8 w-8 text-gray-300"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              </div>
                            )}
                            {match.clips.duration_seconds && (
                              <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 text-white text-[10px] rounded">
                                {formatDuration(match.clips.duration_seconds)}
                              </div>
                            )}
                          </div>

                          {/* Clip info */}
                          <div className="p-2">
                            <div className="flex items-start justify-between gap-2">
                              <h4
                                className="text-xs font-medium text-gray-900 truncate flex-1"
                                title={match.clips.filename}
                              >
                                {match.clips.filename}
                              </h4>
                              <SimilarityBadge score={match.similarity_score} />
                            </div>
                            {match.clips.description && (
                              <p className="mt-1 text-[11px] text-gray-600 line-clamp-2">
                                {match.clips.description}
                              </p>
                            )}
                            {match.clips.tags && match.clips.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                {match.clips.tags.slice(0, 3).map((tag: string) => (
                                  <span
                                    key={tag}
                                    className="inline-block px-1 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {hasMore && (
                      <button
                        onClick={() => toggleShowAll(segment.id)}
                        className="text-xs text-gray-600 hover:text-gray-900 underline"
                      >
                        {showAll ? 'Show fewer matches' : `Show all ${matches.length} matches`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
