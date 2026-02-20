'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB
const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime'])
const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov'])

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function UploadClip({ projectId }: { projectId: string }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)

  function cancel() {
    xhrRef.current?.abort()
    setUploading(false)
    setProgress(0)
    setCurrentFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await upload(file)
    // Reset input so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function upload(file: File) {
    setError(null)

    // Validate type by MIME and extension (quicktime is .mov, some browsers report differently)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
      setError('Only MP4 and MOV files are supported.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File is too large (${formatBytes(file.size)}). Maximum is 2 GB.`)
      return
    }

    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setError('Session expired — please refresh and try again.')
      return
    }

    const timestamp = Date.now()
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : 'mp4'
    const storagePath = `${session.user.id}/${projectId}/${timestamp}.${safeExt}`
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const uploadUrl = `${supabaseUrl}/storage/v1/object/clips/${storagePath}`

    setUploading(true)
    setCurrentFile(file.name)
    setProgress(0)

    // Upload directly to Supabase Storage via XHR for progress tracking
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr

        xhr.open('POST', uploadUrl)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'false')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            let msg = `Upload failed (${xhr.status})`
            try {
              const body = JSON.parse(xhr.responseText)
              if (body.error) msg = body.error
            } catch {}
            reject(new Error(msg))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.onabort = () => reject(new Error('Upload cancelled'))

        xhr.send(file)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      if (msg !== 'Upload cancelled') setError(msg)
      setUploading(false)
      setProgress(0)
      setCurrentFile(null)
      return
    }

    // Register the clip record — this triggers worker processing
    const res = await fetch('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        filename: file.name,
        storage_path: storagePath,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to register clip — please try again.')
      setUploading(false)
      setProgress(0)
      setCurrentFile(null)
      return
    }

    setUploading(false)
    setProgress(0)
    setCurrentFile(null)
    // Refresh the server component to show the new clip
    router.refresh()
  }

  if (uploading) {
    return (
      <div className="w-72">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span className="truncate max-w-[200px]">{currentFile}</span>
          <span className="ml-2 shrink-0">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gray-900 h-2 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          onClick={cancel}
          className="mt-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,video/mp4,video/quicktime"
        onChange={handleFileChange}
        className="sr-only"
        id="clip-upload"
      />
      <label
        htmlFor="clip-upload"
        className="cursor-pointer inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
      >
        Upload clip
      </label>
      {error && (
        <p className="mt-2 text-xs text-red-600 max-w-xs">{error}</p>
      )}
      <p className="mt-1 text-xs text-gray-400">MP4 or MOV, up to 2 GB</p>
    </div>
  )
}
