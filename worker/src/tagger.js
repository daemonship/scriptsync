/**
 * ScriptSync worker — Claude vision tagging pipeline
 *
 * Takes extracted frames for a clip, sends a representative sample to
 * Claude claude-sonnet-4-6, and returns a natural-language description plus
 * keyword tags. Retries on transient errors with exponential backoff.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'fs'

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_FRAMES_PER_CALL = 20   // Claude handles up to 20 images well per call
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

const PROMPT = `These are frames sampled evenly from a video clip. Analyze the visual content and respond with a JSON object in this exact format (raw JSON only, no markdown fences):

{
  "description": "A 2-4 sentence natural-language description covering the subjects, setting, action, and mood of the clip.",
  "tags": ["tag1", "tag2", "tag3"]
}

For tags: provide 5-15 lowercase keywords (1-3 words each) covering subjects, actions, setting, lighting conditions, mood, camera angle, and any notable visual elements.`

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Select up to MAX_FRAMES_PER_CALL frames, evenly distributed across the clip.
 * Always includes the first and last frame for temporal coverage.
 */
function selectRepresentativeFrames(framesDir, frameCount) {
  if (frameCount === 0) return []

  const selected = []
  const step = Math.max(1, Math.floor(frameCount / MAX_FRAMES_PER_CALL))

  for (let i = 1; i <= frameCount && selected.length < MAX_FRAMES_PER_CALL; i += step) {
    const p = `${framesDir}/frame_${i.toString().padStart(4, '0')}.jpg`
    if (existsSync(p)) selected.push(p)
  }

  // Ensure last frame is included (gives Claude temporal context)
  const lastPath = `${framesDir}/frame_${frameCount.toString().padStart(4, '0')}.jpg`
  if (existsSync(lastPath) && !selected.includes(lastPath)) {
    selected.push(lastPath)
  }

  return selected
}

/**
 * Parse a JSON response from Claude, stripping any markdown fences if present.
 */
function parseTaggingResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Could not parse Claude response as JSON: ${text.slice(0, 300)}`)
  }

  const description = typeof parsed.description === 'string' ? parsed.description.trim() : null
  if (!description) {
    throw new Error('Claude returned an empty description')
  }

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter(t => typeof t === 'string')
        .map(t => t.toLowerCase().trim())
        .filter(Boolean)
    : []

  return { description, tags }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Tag a clip using Claude vision.
 *
 * @param {string} framesDir - Local directory containing extracted JPEG frames
 * @param {number} frameCount - Total number of frames extracted
 * @returns {{ description: string, tags: string[] }}
 */
export async function tagClip(framesDir, frameCount) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  const framePaths = selectRepresentativeFrames(framesDir, frameCount)
  if (framePaths.length === 0) {
    throw new Error('No frames available for tagging')
  }

  console.log(`[tagger] Sending ${framePaths.length}/${frameCount} frames to Claude for tagging`)

  const anthropic = new Anthropic({ apiKey })

  // Build image content blocks (base64 JPEG)
  const imageBlocks = framePaths.map(fp => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: readFileSync(fp).toString('base64'),
    },
  }))

  let lastError

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      })

      const text = response.content[0]?.text
      if (!text) throw new Error('Empty response from Claude API')

      const result = parseTaggingResponse(text)
      console.log(
        `[tagger] Tagged successfully: "${result.description.slice(0, 80)}..." ` +
        `tags: [${result.tags.join(', ')}]`
      )
      return result

    } catch (err) {
      lastError = err

      // Don't retry on auth/permission errors — they won't resolve
      const isAuthError =
        err.status === 401 ||
        err.status === 403 ||
        err.message?.includes('invalid_api_key') ||
        err.message?.includes('permission_error')

      if (isAuthError || attempt === MAX_RETRIES) {
        console.error(
          `[tagger] Attempt ${attempt}/${MAX_RETRIES} failed (not retrying): ${err.message}`
        )
        break
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
      console.warn(
        `[tagger] Attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms: ${err.message}`
      )
      await sleep(delay)
    }
  }

  throw lastError ?? new Error('Tagging failed after all retries')
}
