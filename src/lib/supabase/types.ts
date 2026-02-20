export type ClipStatus = 'uploading' | 'processing' | 'ready' | 'error'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          total_video_seconds: number
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          total_video_seconds?: number
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          total_video_seconds?: number
          created_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          updated_at?: string
        }
      }
      clips: {
        Row: {
          id: string
          project_id: string
          user_id: string
          filename: string
          storage_path: string
          thumbnail_path: string | null
          duration_seconds: number | null
          status: ClipStatus
          description: string | null
          tags: string[]
          frames_extracted: number
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          filename: string
          storage_path: string
          thumbnail_path?: string | null
          duration_seconds?: number | null
          status?: ClipStatus
          description?: string | null
          tags?: string[]
          frames_extracted?: number
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          filename?: string
          storage_path?: string
          thumbnail_path?: string | null
          duration_seconds?: number | null
          status?: ClipStatus
          description?: string | null
          tags?: string[]
          frames_extracted?: number
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      script_segments: {
        Row: {
          id: string
          project_id: string
          user_id: string
          content: string
          position: number
          embedding: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          content: string
          position: number
          embedding?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          content?: string
          position?: number
          embedding?: Json | null
          created_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          segment_id: string
          clip_id: string
          similarity_score: number
          rank: number
          created_at: string
        }
        Insert: {
          id?: string
          segment_id: string
          clip_id: string
          similarity_score: number
          rank: number
          created_at?: string
        }
        Update: {
          id?: string
          segment_id?: string
          clip_id?: string
          similarity_score?: number
          rank?: number
          created_at?: string
        }
      }
    }
    Views: {}
    Functions: {
      add_video_seconds: {
        Args: {
          p_user_id: string
          p_seconds: number
        }
        Returns: undefined
      }
    }
  }
}
