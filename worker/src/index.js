/**
 * ScriptSync worker — Fly.io Node.js service
 *
 * Responsibilities:
 *   Task 2: Video upload → FFmpeg frame extraction
 *   Task 3: Claude vision tagging pipeline
 *   Task 5: B-roll matching via embeddings
 */

import { createClient } from '@supabase/supabase-js'
import { processClip } from './processor.js'
import { processMatches } from './matcher.js'
import http from 'http'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '5000', 10)
const PORT = parseInt(process.env.PORT ?? '3001', 10)
const WORKER_API_KEY = process.env.WORKER_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[worker] ANTHROPIC_API_KEY is not set — Claude vision tagging will fail')
}

if (!process.env.OPENAI_API_KEY) {
  console.warn('[worker] OPENAI_API_KEY is not set — embedding generation will fail')
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

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Only allow POST /match endpoint
  if (req.url === '/match' && req.method === 'POST') {
    // Optional API key auth
    if (WORKER_API_KEY) {
      const authHeader = req.headers['authorization']
      if (authHeader !== `Bearer ${WORKER_API_KEY}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
    }

    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body)
        const { project_id } = data ?? {}
        
        if (!project_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'project_id is required' }))
          return
        }

        console.log(`[worker] Received match request for project ${project_id}`)
        
        // Process matches asynchronously (fire and forget)
        // We'll respond immediately and let the processing happen in background
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Matching started' }))
        
        // Actually process matches (with error handling)
        try {
          await processMatches(project_id)
        } catch (err) {
          console.error(`[worker] Match processing failed for project ${project_id}:`, err.message)
        }
        
      } catch (err) {
        console.error('[worker] Invalid request:', err.message)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────

console.log('[worker] ScriptSync worker started')
console.log(`[worker] Polling every ${POLL_INTERVAL_MS}ms`)
console.log(`[worker] HTTP server listening on port ${PORT}`)

// Verify Supabase connectivity on startup
const { error: pingError } = await supabase.from('clips').select('id').limit(1)
if (pingError) {
  console.error('[worker] Supabase connectivity check failed:', pingError.message)
  process.exit(1)
}
console.log('[worker] Supabase connection OK')

// Start HTTP server
server.listen(PORT, () => {
  console.log(`[worker] Ready for match requests at http://localhost:${PORT}/match`)
})

// Run immediately, then on interval
await poll()
setInterval(poll, POLL_INTERVAL_MS)
