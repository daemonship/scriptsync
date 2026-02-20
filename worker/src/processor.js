/**
 * ScriptSync worker — Video processing logic
 *
 * Responsibilities:
 *   Task 2: Download video → FFmpeg frame extraction → upload frames/thumbnail
 *   Task 3: Claude vision tagging → store description + tags → mark ready
 */

import { createClient } from '@supabase/supabase-js'
import { createWriteStream, existsSync, mkdirSync, rmSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { promisify } from 'util'
import { exec } from 'child_process'
import { tmpdir } from 'os'
import { tagClip } from './tagger.js'

const execAsync = promisify(exec)

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VIDEO_SECONDS_CAP = 5 * 60 * 60 // 5 hours

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

// ── Supabase client ───────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function tempDir() {
  const dir = join(tmpdir(), `scriptsync-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(inputPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
  const { stdout } = await execAsync(cmd)
  const duration = parseFloat(stdout.trim())
  if (isNaN(duration)) {
    throw new Error('Could not determine video duration')
  }
  return duration
}

/**
 * Extract frames from video:
 * - 1 frame every 2 seconds
 * - Single thumbnail at 10% of video
 */
async function extractFrames(inputPath, outputDir, duration) {
  // Extract frames at 1 per 2 seconds
  const frameInterval = 2
  const numFrames = Math.ceil(duration / frameInterval)
  
  // Extract frames using FFmpeg
  // -vf select=not(mod(n\,2)):select one frame every 2 seconds
  const framesCmd = `ffmpeg -y -i "${inputPath}" -vf "fps=1/${frameInterval}" -q:v 2 "${outputDir}/frame_%04d.jpg" 2>&1`
  
  try {
    await execAsync(framesCmd)
  } catch (err) {
    console.error('[worker] FFmpeg frame extraction error:', err)
    throw new Error('Failed to extract frames')
  }

  // Count actual frames created
  let frameCount = 0
  for (let i = 1; i <= numFrames + 10; i++) {
    const framePath = `${outputDir}/frame_${i.toString().padStart(4, '0')}.jpg`
    if (existsSync(framePath)) {
      frameCount++
    }
  }

  return frameCount
}

/**
 * Extract single thumbnail at 10% of video duration
 */
async function extractThumbnail(inputPath, outputPath, duration) {
  const seekTime = Math.max(0, duration * 0.1)
  const cmd = `ffmpeg -y -ss ${seekTime} -i "${inputPath}" -vframes 1 -q:v 2 "${outputPath}" 2>&1`
  
  try {
    await execAsync(cmd)
    if (!existsSync(outputPath)) {
      throw new Error('Thumbnail not created')
    }
  } catch (err) {
    console.error('[worker] FFmpeg thumbnail extraction error:', err)
    throw new Error('Failed to extract thumbnail')
  }
}

/**
 * Download file from Supabase Storage
 */
async function downloadFile(bucket, path, outputPath) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path)

  if (error) {
    throw new Error(`Failed to download ${path}: ${error.message}`)
  }

  // Write the file
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const { WriteStream } = await import('fs')
  const stream = createWriteStream(outputPath)
  
  await new Promise((resolve, reject) => {
    // @ts-expect-error - Node.js streams
    const readable = data.stream()
    readable.on('error', reject)
    stream.on('error', reject)
    stream.on('finish', resolve)
    readable.pipe(stream)
  })
}

/**
 * Upload file to Supabase Storage
 */
async function uploadFile(bucket, path, filePath, contentType) {
  const fileBuffer = readFileSync(filePath)
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false,
    })

  if (error) {
    throw new Error(`Failed to upload ${path}: ${error.message}`)
  }

  return data.path
}

/**
 * Check if adding more seconds would exceed the cap
 */
async function checkDurationCap(userId, additionalSeconds) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('total_video_seconds')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    console.warn('[worker] Could not fetch profile, allowing upload:', error?.message)
    return true // Allow if we can't check
  }

  return (profile.total_video_seconds + additionalSeconds) <= VIDEO_SECONDS_CAP
}

/**
 * Update user's total video seconds
 */
async function addVideoSeconds(userId, seconds) {
  const { error } = await supabase.rpc('add_video_seconds', {
    p_user_id: userId,
    p_seconds: seconds,
  })

  if (error) {
    console.error('[worker] Failed to update video seconds:', error.message)
    // Don't fail the whole job for this - log and continue
  }
}

// ── Main processing function ─────────────────────────────────────────────────

export async function processClip(clip) {
  const workDir = tempDir()
  
  try {
    console.log(`[worker] Processing clip: ${clip.id} (${clip.filename})`)

    // 1. Download video file
    const videoPath = join(workDir, 'video')
    console.log(`[worker] Downloading video from ${clip.storage_path}...`)
    await downloadFile('clips', clip.storage_path, videoPath)
    console.log(`[worker] Download complete`)

    // 2. Get video duration
    console.log(`[worker] Getting video duration...`)
    const duration = await getVideoDuration(videoPath)
    console.log(`[worker] Video duration: ${duration.toFixed(2)}s`)

    // 3. Check duration cap
    const withinCap = await checkDurationCap(clip.user_id, duration)
    if (!withinCap) {
      throw new Error('Video would exceed 5-hour duration cap')
    }

    // 4. Extract frames (1 per 2 seconds)
    const framesDir = join(workDir, 'frames')
    mkdirSync(framesDir, { recursive: true })
    console.log(`[worker] Extracting frames (1 per 2 seconds)...`)
    const frameCount = await extractFrames(videoPath, framesDir, duration)
    console.log(`[worker] Extracted ${frameCount} frames`)

    // 5. Extract thumbnail
    const thumbnailPath = join(workDir, 'thumbnail.jpg')
    console.log(`[worker] Extracting thumbnail...`)
    await extractThumbnail(videoPath, thumbnailPath, duration)
    console.log(`[worker] Thumbnail extracted`)

    // 6. Upload frames to storage
    console.log(`[worker] Uploading frames to storage...`)
    const framePaths = []
    
    for (let i = 1; i <= frameCount; i++) {
      const frameFile = `${framesDir}/frame_${i.toString().padStart(4, '0')}.jpg`
      if (existsSync(frameFile)) {
        const storagePath = `${clip.user_id}/${clip.project_id}/${clip.id}/frames/frame_${i.toString().padStart(4, '0')}.jpg`
        await uploadFile('frames', storagePath, frameFile, 'image/jpeg')
        framePaths.push(storagePath)
      }
    }
    console.log(`[worker] Uploaded ${framePaths.length} frames`)

    // 7. Upload thumbnail to storage
    console.log(`[worker] Uploading thumbnail to storage...`)
    const thumbnailStoragePath = `${clip.user_id}/${clip.project_id}/${clip.id}/thumbnail.jpg`
    await uploadFile('frames', thumbnailStoragePath, thumbnailPath, 'image/jpeg')
    console.log(`[worker] Thumbnail uploaded`)

    // 8. Tag clip with Claude vision (frames still on disk for efficiency)
    console.log(`[worker] Running Claude vision tagging...`)
    let description = null
    let tags = []

    try {
      const taggingResult = await tagClip(framesDir, frameCount)
      description = taggingResult.description
      tags = taggingResult.tags
    } catch (taggingErr) {
      // Tagging failure is non-fatal for frame extraction; we surface it in
      // the error_message field but still mark the clip ready with no description.
      // This way users can at least browse and re-trigger tagging in a future feature.
      console.error(`[worker] Tagging failed for clip ${clip.id}:`, taggingErr.message)
      // We will propagate this as a clip error so the user is informed
      throw taggingErr
    }

    // 9. Update clip record with frames, thumbnail, AI description and tags
    console.log(`[worker] Updating clip record...`)
    const { error: updateError } = await supabase
      .from('clips')
      .update({
        status: 'ready',
        duration_seconds: duration,
        frames_extracted: frameCount,
        thumbnail_path: thumbnailStoragePath,
        description,
        tags,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clip.id)

    if (updateError) {
      throw new Error(`Failed to update clip: ${updateError.message}`)
    }

    // 10. Update user's total video seconds
    await addVideoSeconds(clip.user_id, duration)

    console.log(`[worker] Clip ${clip.id} processed successfully`)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[worker] Failed to process clip ${clip.id}:`, message)
    
    // Update clip status to error
    await supabase
      .from('clips')
      .update({
        status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clip.id)
    
    throw err
  } finally {
    // Cleanup
    cleanupDir(workDir)
  }
}
