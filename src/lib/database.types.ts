/**
 * Tipos de la base de datos Desafío Fenner.
 * Escritos a mano para reflejar las migraciones en supabase/migrations.
 * Se pueden regenerar con:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type UserRole =
  | "administrador"
  | "profesor"
  | "convivencia"
  | "inspectoria"
  | "residencia"
  | "direccion"

export type ScoreEventType =
  | "evaluacion"
  | "bonus"
  | "penalizacion"
  | "reciclaje"
  | "canje"
  | "ajuste"

export type RewardTier = "basico" | "medio" | "avanzado" | "alto"
export type IndicatorFrequency = "clase" | "semanal"
export type IndicatorGroup = "profesores" | "convivencia"
export type RedemptionStatus =
  | "pendiente"
  | "aprobado"
  | "rechazado"
  | "entregado"

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string | null
          role: UserRole
          photo_url: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string
          email?: string | null
          role?: UserRole
          photo_url?: string | null
          active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
      semesters: {
        Row: {
          id: string
          name: string
          year: number
          start_date: string
          end_date: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          year: number
          start_date: string
          end_date: string
          active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["semesters"]["Insert"]>
        Relationships: []
      }
      courses: {
        Row: {
          id: string
          name: string
          level: string
          letter: string | null
          head_teacher_id: string | null
          photo_url: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          level?: string
          letter?: string | null
          head_teacher_id?: string | null
          photo_url?: string | null
          active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>
        Relationships: []
      }
      areas: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          order_index: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          order_index?: number
        }
        Update: Partial<Database["public"]["Tables"]["areas"]["Insert"]>
        Relationships: []
      }
      indicators: {
        Row: {
          id: string
          area_id: string
          name: string
          description: string | null
          level_0_desc: string | null
          level_1_desc: string | null
          level_2_desc: string | null
          level_3_desc: string | null
          allowed_roles: UserRole[]
          frequency: IndicatorFrequency
          assigned_group: IndicatorGroup
          order_index: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          area_id: string
          name: string
          description?: string | null
          level_0_desc?: string | null
          level_1_desc?: string | null
          level_2_desc?: string | null
          level_3_desc?: string | null
          allowed_roles?: UserRole[]
          frequency?: IndicatorFrequency
          assigned_group?: IndicatorGroup
          order_index?: number
          active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["indicators"]["Insert"]>
        Relationships: []
      }
      evaluations: {
        Row: {
          id: string
          course_id: string
          area_id: string
          semester_id: string
          week_number: number
          week_start: string
          evaluator_id: string | null
          note: string | null
          total_points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          area_id: string
          semester_id: string
          week_number: number
          week_start: string
          evaluator_id?: string | null
          note?: string | null
          total_points?: number
        }
        Update: Partial<Database["public"]["Tables"]["evaluations"]["Insert"]>
        Relationships: []
      }
      evaluation_scores: {
        Row: {
          id: string
          evaluation_id: string
          indicator_id: string
          level: number
          points: number
        }
        Insert: {
          id?: string
          evaluation_id: string
          indicator_id: string
          level: number
          points?: number
        }
        Update: Partial<
          Database["public"]["Tables"]["evaluation_scores"]["Insert"]
        >
        Relationships: []
      }
      score_events: {
        Row: {
          id: string
          course_id: string
          semester_id: string
          type: ScoreEventType
          general_delta: number
          xp_delta: number
          description: string | null
          reference_table: string | null
          reference_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester_id: string
          type: ScoreEventType
          general_delta?: number
          xp_delta?: number
          description?: string | null
          reference_table?: string | null
          reference_id?: string | null
          created_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["score_events"]["Insert"]>
        Relationships: []
      }
      course_standings: {
        Row: {
          course_id: string
          semester_id: string
          general_total: number
          xp_earned: number
          xp_spent: number
          xp_available: number
          updated_at: string
        }
        Insert: {
          course_id: string
          semester_id: string
          general_total?: number
          xp_earned?: number
          xp_spent?: number
          xp_available?: number
        }
        Update: Partial<
          Database["public"]["Tables"]["course_standings"]["Insert"]
        >
        Relationships: []
      }
      rewards: {
        Row: {
          id: string
          name: string
          description: string | null
          tier: RewardTier
          xp_cost: number
          monthly_limit: number | null
          image_url: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          tier: RewardTier
          xp_cost: number
          monthly_limit?: number | null
          image_url?: string | null
          active?: boolean
        }
        Update: Partial<Database["public"]["Tables"]["rewards"]["Insert"]>
        Relationships: []
      }
      redemptions: {
        Row: {
          id: string
          course_id: string
          reward_id: string
          semester_id: string
          xp_spent: number
          status: RedemptionStatus
          period_month: string
          requested_by: string | null
          approved_by: string | null
          note: string | null
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          course_id: string
          reward_id: string
          semester_id: string
          xp_spent: number
          status?: RedemptionStatus
          period_month: string
          requested_by?: string | null
          approved_by?: string | null
          note?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["redemptions"]["Insert"]>
        Relationships: []
      }
      penalty_catalog: {
        Row: {
          id: string
          name: string
          description: string | null
          points: number
          min_points: number | null
          max_points: number | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          points: number
          min_points?: number | null
          max_points?: number | null
          active?: boolean
        }
        Update: Partial<
          Database["public"]["Tables"]["penalty_catalog"]["Insert"]
        >
        Relationships: []
      }
      penalties: {
        Row: {
          id: string
          course_id: string
          semester_id: string
          catalog_id: string | null
          points: number
          student_name: string | null
          description: string | null
          applied_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester_id: string
          catalog_id?: string | null
          points: number
          student_name?: string | null
          description?: string | null
          applied_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["penalties"]["Insert"]>
        Relationships: []
      }
      bonuses: {
        Row: {
          id: string
          course_id: string
          semester_id: string
          kind: string
          points: number
          description: string | null
          applied_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester_id: string
          kind: string
          points: number
          description?: string | null
          applied_by?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["bonuses"]["Insert"]>
        Relationships: []
      }
      class_evaluations: {
        Row: {
          id: string
          course_id: string
          semester_id: string
          evaluator_id: string
          class_date: string
          block: number | null
          subject: string | null
          week_number: number
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester_id: string
          evaluator_id: string
          class_date?: string
          block?: number | null
          subject?: string | null
          week_number: number
          note?: string | null
        }
        Update: Partial<
          Database["public"]["Tables"]["class_evaluations"]["Insert"]
        >
        Relationships: []
      }
      class_evaluation_scores: {
        Row: {
          id: string
          class_evaluation_id: string
          indicator_id: string
          level: number
        }
        Insert: {
          id?: string
          class_evaluation_id: string
          indicator_id: string
          level: number
        }
        Update: Partial<
          Database["public"]["Tables"]["class_evaluation_scores"]["Insert"]
        >
        Relationships: []
      }
      class_week_totals: {
        Row: {
          course_id: string
          semester_id: string
          week_number: number
          total_points: number
          updated_at: string
        }
        Insert: {
          course_id: string
          semester_id: string
          week_number: number
          total_points?: number
        }
        Update: Partial<
          Database["public"]["Tables"]["class_week_totals"]["Insert"]
        >
        Relationships: []
      }
      ranking_snapshots: {
        Row: {
          id: string
          semester_id: string
          week_number: number
          published_at: string
          published_by: string | null
        }
        Insert: {
          id?: string
          semester_id: string
          week_number: number
          published_by?: string | null
        }
        Update: Partial<
          Database["public"]["Tables"]["ranking_snapshots"]["Insert"]
        >
        Relationships: []
      }
      ranking_snapshot_rows: {
        Row: {
          id: string
          snapshot_id: string
          course_id: string
          general_total: number
          xp_earned: number
          xp_spent: number
          xp_available: number
          position: number
        }
        Insert: {
          id?: string
          snapshot_id: string
          course_id: string
          general_total?: number
          xp_earned?: number
          xp_spent?: number
          xp_available?: number
          position: number
        }
        Update: Partial<
          Database["public"]["Tables"]["ranking_snapshot_rows"]["Insert"]
        >
        Relationships: []
      }
      recycling_records: {
        Row: {
          id: string
          course_id: string
          semester_id: string
          week_number: number
          record_date: string
          material: string
          kilos: number
          points: number
          valid: boolean
          registered_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          semester_id: string
          week_number: number
          record_date?: string
          material: string
          kilos: number
          points?: number
          valid?: boolean
          registered_by?: string | null
        }
        Update: Partial<
          Database["public"]["Tables"]["recycling_records"]["Insert"]
        >
        Relationships: []
      }
    }
    Views: {
      v_ranking: {
        Row: {
          course_id: string
          course_name: string
          course_photo: string | null
          semester_id: string | null
          general_total: number
          xp_earned: number
          xp_spent: number
          xp_available: number
          position: number
          updated_at: string | null
        }
        Relationships: []
      }
      v_course_area_breakdown: {
        Row: {
          course_id: string | null
          semester_id: string | null
          area_id: string
          area_name: string
          area_slug: string
          evaluations_count: number
          area_points: number
        }
        Relationships: []
      }
    }
    Functions: {
      submit_evaluation: {
        Args: {
          p_course_id: string
          p_area_id: string
          p_semester_id: string
          p_week_number: number
          p_week_start: string
          p_scores: Json
          p_note?: string | null
        }
        Returns: string
      }
      submit_class_evaluation: {
        Args: {
          p_course_id: string
          p_class_date: string
          p_scores: Json
          p_block?: number | null
          p_subject?: string | null
          p_note?: string | null
        }
        Returns: string
      }
      semester_week_number: {
        Args: { p_start: string; p_date: string }
        Returns: number
      }
      publish_ranking: {
        Args: Record<string, never>
        Returns: string
      }
      try_scheduled_publish: {
        Args: Record<string, never>
        Returns: undefined
      }
      request_redemption: {
        Args: { p_course_id: string; p_reward_id: string; p_note?: string | null }
        Returns: string
      }
      decide_redemption: {
        Args: { p_redemption_id: string; p_approve: boolean }
        Returns: undefined
      }
      current_role_name: { Args: Record<string, never>; Returns: UserRole }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      active_semester_id: { Args: Record<string, never>; Returns: string }
    }
    Enums: {
      user_role: UserRole
      score_event_type: ScoreEventType
      reward_tier: RewardTier
      redemption_status: RedemptionStatus
      indicator_frequency: IndicatorFrequency
      indicator_group: IndicatorGroup
    }
    CompositeTypes: Record<string, never>
  }
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Alias de conveniencia
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
