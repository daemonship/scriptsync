/**
 * ScriptSync worker — B-roll matching logic
 *
 * Responsibilities:
 *   Task 5: Generate embeddings for script segments and clips,
 *           compute cosine similarity, store top matches
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[matcher] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

if (!OPENAI_API_KEY) {
  console.error('[matcher] OPENAI_API_KEY is required for embedding generation')
  process.exit(1)
}

// ── Supabase client ───────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── OpenAI client ─────────────────────────────────────────────────────────────

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

// ── Embedding generation ──────────────────────────────────────────────────────

/**
 * Generate embedding for a text using OpenAI text-embedding-3-small
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    // Return zero vector for empty text? Better to skip.
    throw new Error('Cannot generate embedding for empty text')
  }
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })
  
  return response.data[0].embedding
}

/**
 * Combine clip description and tags into a single text for embedding
 * @param {string} description
 * @param {string[]} tags
 * @returns {string}
 */
export function clipTextForEmbedding(description, tags) {
  const tagString = tags ? tags.join(', ') : ''
  return `${description || ''} ${tagString}`.trim()
}

/**
 * Generate and store embedding for a clip if missing
 * @param {string} clipId
 * @returns {Promise<void>}
 */
export async function ensureClipEmbedding(clipId) {
  const { data: clip, error } = await supabase
    .from('clips')
    .select('id, description, tags, embedding')
    .eq('id', clipId)
    .single()
  
  if (error) {
    throw new Error(`Failed to fetch clip ${clipId}: ${error.message}`)
  }
  
  // If embedding already exists, skip
  if (clip.embedding) {
    return
  }
  
  const text = clipTextForEmbedding(clip.description, clip.tags)
  if (!text) {
    console.warn(`[matcher] Clip ${clipId} has no description/tags, skipping embedding`)
    // Store null embedding?
    return
  }
  
  console.log(`[matcher] Generating embedding for clip ${clipId}`)
  const embedding = await generateEmbedding(text)
  
  const { error: updateError } = await supabase
    .from('clips')
    .update({ embedding })
    .eq('id', clipId)
  
  if (updateError) {
    throw new Error(`Failed to store embedding for clip ${clipId}: ${updateError.message}`)
  }
  
  console.log(`[matcher] Embedding stored for clip ${clipId}`)
}

/**
 * Generate and store embedding for a script segment if missing
 * @param {string} segmentId
 * @returns {Promise<void>}
 */
export async function ensureSegmentEmbedding(segmentId) {
  const { data: segment, error } = await supabase
    .from('script_segments')
    .select('id, content, embedding')
    .eq('id', segmentId)
    .single()
  
  if (error) {
    throw new Error(`Failed to fetch segment ${segmentId}: ${error.message}`)
  }
  
  if (segment.embedding) {
    return
  }
  
  console.log(`[matcher] Generating embedding for segment ${segmentId}`)
  const embedding = await generateEmbedding(segment.content)
  
  const { error: updateError } = await supabase
    .from('script_segments')
    .update({ embedding })
    .eq('id', segmentId)
  
  if (updateError) {
    throw new Error(`Failed to store embedding for segment ${segmentId}: ${updateError.message}`)
  }
  
  console.log(`[matcher] Embedding stored for segment ${segmentId}`)
}

// ── Similarity computation ────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }
  
  let dot = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)
  
  if (normA === 0 || normB === 0) {
    return 0
  }
  
  return dot / (normA * normB)
}

/**
 * Compute matches for all segments in a project
 * @param {string} projectId
 * @param {number} topK - number of top matches to store per segment
 * @returns {Promise<void>}
 */
export async function computeMatches(projectId, topK = 5) {
  console.log(`[matcher] Computing matches for project ${projectId}`)
  
  // Fetch all script segments for this project
  const { data: segments, error: segError } = await supabase
    .from('script_segments')
    .select('id, embedding')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  
  if (segError) {
    throw new Error(`Failed to fetch segments: ${segError.message}`)
  }
  
  // Fetch all clips for this project that are ready
  const { data: clips, error: clipError } = await supabase
    .from('clips')
    .select('id, embedding')
    .eq('project_id', projectId)
    .eq('status', 'ready')
  
  if (clipError) {
    throw new Error(`Failed to fetch clips: ${clipError.message}`)
  }
  
  if (segments.length === 0 || clips.length === 0) {
    console.log(`[matcher] No segments or clips found, skipping matching`)
    return
  }
  
  // Ensure embeddings exist for all segments and clips
  for (const segment of segments) {
    if (!segment.embedding) {
      await ensureSegmentEmbedding(segment.id)
      // Refetch segment with updated embedding
      const { data: updated } = await supabase
        .from('script_segments')
        .select('embedding')
        .eq('id', segment.id)
        .single()
      segment.embedding = updated.embedding
    }
  }
  
  for (const clip of clips) {
    if (!clip.embedding) {
      await ensureClipEmbedding(clip.id)
      const { data: updated } = await supabase
        .from('clips')
        .select('embedding')
        .eq('id', clip.id)
        .single()
      clip.embedding = updated.embedding
    }
  }
  
  // Filter out any segments/clips that still have null embeddings
  const validSegments = segments.filter(s => s.embedding)
  const validClips = clips.filter(c => c.embedding)
  
  console.log(`[matcher] Computing similarities for ${validSegments.length} segments × ${validClips.length} clips`)
  
  // Delete existing matches for this project's segments
  const segmentIds = validSegments.map(s => s.id)
  if (segmentIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('matches')
      .delete()
      .in('segment_id', segmentIds)
    
    if (deleteError) {
      throw new Error(`Failed to clear existing matches: ${deleteError.message}`)
    }
  }
  
  // For each segment, compute similarities and store top matches
  for (const segment of validSegments) {
    const similarities = []
    
    for (const clip of validClips) {
      const score = cosineSimilarity(segment.embedding, clip.embedding)
      similarities.push({
        clipId: clip.id,
        score,
      })
    }
    
    // Sort descending by score
    similarities.sort((a, b) => b.score - a.score)
    
    // Take top K
    const topMatches = similarities.slice(0, topK)
    
    // Insert matches
    const matchesToInsert = topMatches.map((match, index) => ({
      segment_id: segment.id,
      clip_id: match.clipId,
      similarity_score: match.score,
      rank: index + 1,
    }))
    
    if (matchesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('matches')
        .insert(matchesToInsert)
      
      if (insertError) {
        throw new Error(`Failed to insert matches for segment ${segment.id}: ${insertError.message}`)
      }
    }
  }
  
  console.log(`[matcher] Match computation completed for project ${projectId}`)
}

/**
 * Main entry point for match processing
 * @param {string} projectId
 */
export async function processMatches(projectId) {
  try {
    await computeMatches(projectId)
  } catch (err) {
    console.error(`[matcher] Failed to process matches for project ${projectId}:`, err.message)
    // Propagate error
    throw err
  }
}