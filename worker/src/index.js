/**
 * ScriptSync worker — Fly.io Node.js service
 *
 * Responsibilities (implemented in subsequent tasks):
 *   Task 2: Download video → FFmpeg frame extraction → upload frames
 *   Task 3: Claude vision tagging pipeline
 *
 * This skeleton establishes the Supabase connection and polling loop.
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

// ── Supabase client ───────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Job handlers (stubs — implemented in Task 2 & 3) ─────────────────────────

async function processClip(clip) {
  console.log(`[worker] Processing clip: ${clip.id} (${clip.filename})`)
  // TODO (Task 2): Download file from Supabase Storage → FFmpeg frame extraction
  // TODO (Task 3): Claude vision tagging
  throw new Error('Not implemented — see Task 2 and Task 3')
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll() {
  const { data: clips, error } = await supabase
    .from('clips')
    .select('*')
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

      await supabase
        .from('clips')
        .update({ status: 'error', error_message: err.message, updated_at: new Date().toISOString() })
        .eq('id', clip.id)
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
