'use client'

import { useState } from 'react'

interface CsvExportProps {
  projectId: string
  projectName: string
}

export function CsvExport({ projectId, projectName }: CsvExportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setIsExporting(true)
    setError(null)

    try {
      const res = await fetch(`/api/export?project_id=${projectId}`, {
        method: 'GET',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to export CSV')
        setIsExporting(false)
        return
      }

      // Get the CSV content
      const csvContent = await res.text()

      // Create a blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_matches.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <svg
              className="animate-spin h-4 w-4 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export CSV
          </>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
