'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ScriptPasteProps {
  projectId: string
  existingSegments?: { id: string; content: string; position: number }[]
}

export function ScriptPaste({ projectId, existingSegments = [] }: ScriptPasteProps) {
  const router = useRouter()
  const [scriptText, setScriptText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Parse script into paragraphs (non-empty lines)
  function parseScript(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const paragraphs = parseScript(scriptText)
    if (paragraphs.length === 0) {
      setError('Please enter at least one paragraph of text.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/script-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          paragraphs,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to save script segments')
        setIsSubmitting(false)
        return
      }

      setSuccess(true)
      setScriptText('')
      router.refresh()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError('An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  async function handleClear() {
    if (!confirm('Are you sure you want to clear all script segments? This cannot be undone.')) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/script-segments?project_id=${projectId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to clear segments')
        setIsSubmitting(false)
        return
      }

      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  const hasExistingSegments = existingSegments.length > 0

  return (
    <div className="space-y-4">
      {hasExistingSegments && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {existingSegments.length} segment{existingSegments.length !== 1 ? 's' : ''} saved
          </p>
          <button
            onClick={handleClear}
            disabled={isSubmitting}
            className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="script-text"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Paste your script
          </label>
          <textarea
            id="script-text"
            rows={12}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Paste your script here. Each paragraph will be treated as a separate segment for matching with B-roll clips."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-y font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">
            Text will be split into paragraphs. Empty lines separate segments.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 p-3">
            <p className="text-sm text-green-700">
              Script saved successfully! Matches will be generated.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting || !scriptText.trim()}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save script segments'}
          </button>
          {scriptText.trim() && (
            <button
              type="button"
              onClick={() => setScriptText('')}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
