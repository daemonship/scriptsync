/**
 * ScriptSync worker — Fly.io Node.js service
 *
 * Responsibilities:
 *   Task 2: Video upload → FFmpeg frame extraction
 *   Task 3: Claude vision tagging pipeline
 */

import { createClient } from '@supabase/supabase-js'
import { processClip } from './processor.js'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[worker] ANTHROPIC_API_KEY is not set — Claude vision tagging will fail')
}

// ── Supabase client ───────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll() {
  const { data: clips, error } = await supabase
    .from('clips')
    .select('id, user_id, project_id, filename, storage_path')
    .eq('status', 'processing')
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    console.error('[worker] Poll error:', error.message)
    return
  }

  if (!clips || clips.length === 0) {
    return
  }

  console.log(`[worker] Found ${clips.length} clip(s) to process`)

  for (const clip of clips) {
    try {
      await processClip(clip)
    } catch (err) {
      console.error(`[worker] Failed to process clip ${clip.id}:`, err.message)
      // Error already handled in processClip - clip status updated to 'error'
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

console.log('[worker] ScriptSync worker started')
console.log(`[worker] Polling every ${POLL_INTERVAL_MS}ms`)

// Verify Supabase connectivity on startup
const { error: pingError } = await supabase.from('clips').select('id').limit(1)
if (pingError) {
  console.error('[worker] Supabase connectivity check failed:', pingError.message)
  process.exit(1)
}
console.log('[worker] Supabase connection OK')

// Run immediately, then on interval
await poll()
setInterval(poll, POLL_INTERVAL_MS)
