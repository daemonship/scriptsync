'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { Database } from '@/lib/supabase/types'

type Clip = Database['public']['Tables']['clips']['Row']

interface ClipGridProps {
  clips: Clip[]
  supabaseUrl: string
}

const STATUS_LABELS: Record<Clip['status'], string> = {
  uploading: 'Uploading…',
  processing: 'Processing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLORS: Record<Clip['status'], string> = {
  uploading: 'text-blue-600 bg-blue-50 border-blue-100',
  processing: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  ready: 'text-green-700 bg-green-50 border-green-100',
  error: 'text-red-700 bg-red-50 border-red-100',
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ClipGrid({ clips, supabaseUrl }: ClipGridProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredClips = clips.filter((clip) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const descriptionMatch = clip.description?.toLowerCase().includes(query) ?? false
    const tagsMatch = clip.tags?.some((tag: string) => tag.toLowerCase().includes(query)) ?? false
    const filenameMatch = clip.filename.toLowerCase().includes(query)
    return descriptionMatch || tagsMatch || filenameMatch
  })

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clips by description, tags, or filename..."
            className="w-full rounded-md border border-gray-300 pl-10 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {filteredClips.length} clip{filteredClips.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      </div>

      {/* Clip grid */}
      {filteredClips.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">
            {searchQuery ? 'No clips match your search.' : 'No clips yet.'}
          </p>
          {!searchQuery && (
            <p className="mt-1 text-sm text-gray-400">
              Upload a video file to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClips.map((clip) => (
            <div
              key={clip.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-gray-100 relative">
                {clip.thumbnail_path ? (
                  <Image
                    src={`${supabaseUrl}/storage/v1/object/public/frames/${clip.thumbnail_path}`}
                    alt={clip.filename}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="h-12 w-12 text-gray-300"
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
                {/* Duration badge */}
                {clip.duration_seconds && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                    {formatDuration(clip.duration_seconds)}
                  </div>
                )}
                {/* Status badge */}
                <div
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[clip.status as Clip['status']]}`}
                >
                  {STATUS_LABELS[clip.status as Clip['status']]}
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3
                  className="font-medium text-gray-900 text-sm truncate"
                  title={clip.filename}
                >
                  {clip.filename}
                </h3>

                {clip.description ? (
                  <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                    {clip.description}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400 italic">
                    {clip.status === 'ready' ? 'No description available' : 'Processing...'}
                  </p>
                )}

                {clip.tags && clip.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {clip.tags.slice(0, 5).map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                    {clip.tags.length > 5 && (
                      <span className="text-[10px] text-gray-400">
                        +{clip.tags.length - 5}
                      </span>
                    )}
                  </div>
                )}

                {clip.status === 'error' && clip.error_message && (
                  <p className="mt-2 text-xs text-red-600 line-clamp-2">
                    {clip.error_message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
