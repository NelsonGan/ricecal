/**
 * Generated file, do not edit.
 *
 *   pnpm db:types
 *
 * runs `supabase gen types typescript --local` against the local stack, so the
 * local database must be up to date: `pnpm db:reset` first if you have just
 * pulled a migration. Nothing in CI checks this file against the schema, so a
 * stale copy shows up as a type error on a column that plainly exists.
 *
 * Postgres enums arrive as string-literal unions, which is why the schema uses
 * enums for its closed domains: `Database['public']['Enums']['meal']` is the
 * `Meal` union the screens already speak.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_days: {
        Row: {
          active_kcal: number | null
          created_at: string
          distance_m: number | null
          exercise_goal_min: number | null
          exercise_minutes: number | null
          flights: number | null
          log_date: string
          move_goal_kcal: number | null
          provider: Database['public']['Enums']['health_provider']
          resting_kcal: number | null
          stand_goal_hr: number | null
          stand_hours: number | null
          steps: number
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_kcal?: number | null
          created_at?: string
          distance_m?: number | null
          exercise_goal_min?: number | null
          exercise_minutes?: number | null
          flights?: number | null
          log_date: string
          move_goal_kcal?: number | null
          provider: Database['public']['Enums']['health_provider']
          resting_kcal?: number | null
          stand_goal_hr?: number | null
          stand_hours?: number | null
          steps?: number
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_kcal?: number | null
          created_at?: string
          distance_m?: number | null
          exercise_goal_min?: number | null
          exercise_minutes?: number | null
          flights?: number | null
          log_date?: string
          move_goal_kcal?: number | null
          provider?: Database['public']['Enums']['health_provider']
          resting_kcal?: number | null
          stand_goal_hr?: number | null
          stand_hours?: number | null
          steps?: number
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_hours: {
        Row: {
          active_kcal: number
          created_at: string
          distance_m: number | null
          hour: number
          log_date: string
          steps: number
          user_id: string
        }
        Insert: {
          active_kcal?: number
          created_at?: string
          distance_m?: number | null
          hour: number
          log_date: string
          steps?: number
          user_id: string
        }
        Update: {
          active_kcal?: number
          created_at?: string
          distance_m?: number | null
          hour?: number
          log_date?: string
          steps?: number
          user_id?: string
        }
        Relationships: []
      }
      activity_sessions: {
        Row: {
          active_kcal: number
          avg_hr: number | null
          created_at: string
          distance_m: number | null
          duration_s: number
          elevation_m: number | null
          ended_at: string
          external_id: string
          hr_zones: Json | null
          id: string
          kind: string
          kind_label: string | null
          log_date: string
          max_hr: number | null
          provider: Database['public']['Enums']['health_provider']
          source_name: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_kcal?: number
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s: number
          elevation_m?: number | null
          ended_at: string
          external_id: string
          hr_zones?: Json | null
          id?: string
          kind: string
          kind_label?: string | null
          log_date: string
          max_hr?: number | null
          provider: Database['public']['Enums']['health_provider']
          source_name?: string | null
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_kcal?: number
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number
          elevation_m?: number | null
          ended_at?: string
          external_id?: string
          hr_zones?: Json | null
          id?: string
          kind?: string
          kind_label?: string | null
          log_date?: string
          max_hr?: number | null
          provider?: Database['public']['Enums']['health_provider']
          source_name?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      barcode_misses: {
        Row: {
          code: string
          created_at: string
          found: boolean
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          found?: boolean
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          found?: boolean
          id?: string
        }
        Relationships: []
      }
      barcode_scan_usage: {
        Row: {
          created_at: string
          scans: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          scans?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          created_at?: string
          scans?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      blocked_authors: {
        Row: {
          author_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_goals: {
        Row: {
          carbs_g: number
          created_at: string
          effective_from: string
          fat_g: number
          is_custom: boolean
          kcal: number
          protein_g: number
          updated_at: string
          user_id: string
          water_ml: number
        }
        Insert: {
          carbs_g: number
          created_at?: string
          effective_from: string
          fat_g: number
          is_custom?: boolean
          kcal: number
          protein_g: number
          updated_at?: string
          user_id: string
          water_ml?: number
        }
        Update: {
          carbs_g?: number
          created_at?: string
          effective_from?: string
          fat_g?: number
          is_custom?: boolean
          kcal?: number
          protein_g?: number
          updated_at?: string
          user_id?: string
          water_ml?: number
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          created_at: string
          log_date: string
          note: string | null
          updated_at: string
          user_id: string
          water_ml: number
        }
        Insert: {
          created_at?: string
          log_date: string
          note?: string | null
          updated_at?: string
          user_id: string
          water_ml?: number
        }
        Update: {
          created_at?: string
          log_date?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          water_ml?: number
        }
        Relationships: []
      }
      food_log_ingredients: {
        Row: {
          base_carbs_g: number
          base_fat_g: number
          base_kcal: number
          base_protein_g: number
          created_at: string
          display_label: string | null
          food_id: string | null
          food_log_id: string
          grams: number | null
          id: string
          item_name: string
          position: number
          quantity: number
          serving_factor: number
          serving_id: string | null
          serving_label: string | null
        }
        Insert: {
          base_carbs_g: number
          base_fat_g: number
          base_kcal: number
          base_protein_g: number
          created_at?: string
          display_label?: string | null
          food_id?: string | null
          food_log_id: string
          grams?: number | null
          id?: string
          item_name: string
          position?: number
          quantity?: number
          serving_factor: number
          serving_id?: string | null
          serving_label?: string | null
        }
        Update: {
          base_carbs_g?: number
          base_fat_g?: number
          base_kcal?: number
          base_protein_g?: number
          created_at?: string
          display_label?: string | null
          food_id?: string | null
          food_log_id?: string
          grams?: number | null
          id?: string
          item_name?: string
          position?: number
          quantity?: number
          serving_factor?: number
          serving_id?: string | null
          serving_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'food_log_ingredients_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_log_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_log_ingredients_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_logs'
            referencedColumns: ['id']
          },
        ]
      }
      food_logs: {
        Row: {
          base_carbs_g: number
          base_fat_g: number
          base_fibre_g: number | null
          base_kcal: number
          base_protein_g: number
          base_sodium_mg: number | null
          base_sugar_g: number | null
          created_at: string
          display_label: string | null
          food_id: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string
          item_brand: string | null
          item_icon_name: string | null
          item_icon_set: Database['public']['Enums']['icon_set'] | null
          item_name: string
          item_place: Database['public']['Enums']['food_place'] | null
          log_date: string
          logged_at: string
          note: string | null
          override_carbs_g: number | null
          override_fat_g: number | null
          override_kcal: number | null
          override_protein_g: number | null
          photo_path: string | null
          quantity: number
          recipe_id: string | null
          scan_id: string | null
          serving_factor: number
          serving_grams: number | null
          serving_id: string | null
          serving_label: string
          source: Database['public']['Enums']['entry_source']
          suggested_edits: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_carbs_g: number
          base_fat_g: number
          base_fibre_g?: number | null
          base_kcal: number
          base_protein_g: number
          base_sodium_mg?: number | null
          base_sugar_g?: number | null
          created_at?: string
          display_label?: string | null
          food_id?: string | null
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          item_brand?: string | null
          item_icon_name?: string | null
          item_icon_set?: Database['public']['Enums']['icon_set'] | null
          item_name: string
          item_place?: Database['public']['Enums']['food_place'] | null
          log_date?: string
          logged_at?: string
          note?: string | null
          override_carbs_g?: number | null
          override_fat_g?: number | null
          override_kcal?: number | null
          override_protein_g?: number | null
          photo_path?: string | null
          quantity?: number
          recipe_id?: string | null
          scan_id?: string | null
          serving_factor: number
          serving_grams?: number | null
          serving_id?: string | null
          serving_label: string
          source?: Database['public']['Enums']['entry_source']
          suggested_edits?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_carbs_g?: number
          base_fat_g?: number
          base_fibre_g?: number | null
          base_kcal?: number
          base_protein_g?: number
          base_sodium_mg?: number | null
          base_sugar_g?: number | null
          created_at?: string
          display_label?: string | null
          food_id?: string | null
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          item_brand?: string | null
          item_icon_name?: string | null
          item_icon_set?: Database['public']['Enums']['icon_set'] | null
          item_name?: string
          item_place?: Database['public']['Enums']['food_place'] | null
          log_date?: string
          logged_at?: string
          note?: string | null
          override_carbs_g?: number | null
          override_fat_g?: number | null
          override_kcal?: number | null
          override_protein_g?: number | null
          photo_path?: string | null
          quantity?: number
          recipe_id?: string | null
          scan_id?: string | null
          serving_factor?: number
          serving_grams?: number | null
          serving_id?: string | null
          serving_label?: string
          source?: Database['public']['Enums']['entry_source']
          suggested_edits?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      food_scan_items: {
        Row: {
          catalogue_kcal: number | null
          components: Json | null
          confidence: number | null
          created_at: string
          described_text: string | null
          food_log_id: string | null
          generic_query: string | null
          id: string
          item_index: number
          llm_kcal_high: number | null
          llm_kcal_low: number | null
          quantity: number | null
          refine_instruction: string | null
          resolved_food_id: string | null
          resolved_tier: number | null
          scan_id: string
          scene: string | null
          serving_hint: string | null
          specific_query: string | null
          user_id: string
        }
        Insert: {
          catalogue_kcal?: number | null
          components?: Json | null
          confidence?: number | null
          created_at?: string
          described_text?: string | null
          food_log_id?: string | null
          generic_query?: string | null
          id?: string
          item_index?: number
          llm_kcal_high?: number | null
          llm_kcal_low?: number | null
          quantity?: number | null
          refine_instruction?: string | null
          resolved_food_id?: string | null
          resolved_tier?: number | null
          scan_id: string
          scene?: string | null
          serving_hint?: string | null
          specific_query?: string | null
          user_id: string
        }
        Update: {
          catalogue_kcal?: number | null
          components?: Json | null
          confidence?: number | null
          created_at?: string
          described_text?: string | null
          food_log_id?: string | null
          generic_query?: string | null
          id?: string
          item_index?: number
          llm_kcal_high?: number | null
          llm_kcal_low?: number | null
          quantity?: number | null
          refine_instruction?: string | null
          resolved_food_id?: string | null
          resolved_tier?: number | null
          scan_id?: string
          scene?: string | null
          serving_hint?: string | null
          specific_query?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_scan_items_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_log_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_scan_items_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_logs'
            referencedColumns: ['id']
          },
        ]
      }
      food_scan_misses: {
        Row: {
          created_at: string
          id: string
          place: Database['public']['Enums']['food_place'] | null
          query: string
          scan_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          place?: Database['public']['Enums']['food_place'] | null
          query: string
          scan_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          place?: Database['public']['Enums']['food_place'] | null
          query?: string
          scan_id?: string | null
        }
        Relationships: []
      }
      health_connections: {
        Row: {
          backfilled_from: string | null
          connected: boolean
          created_at: string
          device_name: string | null
          last_synced_at: string | null
          permissions: string[]
          provider: Database['public']['Enums']['health_provider']
          updated_at: string
          user_id: string
        }
        Insert: {
          backfilled_from?: string | null
          connected?: boolean
          created_at?: string
          device_name?: string | null
          last_synced_at?: string | null
          permissions?: string[]
          provider: Database['public']['Enums']['health_provider']
          updated_at?: string
          user_id: string
        }
        Update: {
          backfilled_from?: string | null
          connected?: boolean
          created_at?: string
          device_name?: string | null
          last_synced_at?: string | null
          permissions?: string[]
          provider?: Database['public']['Enums']['health_provider']
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          detail: Json | null
          error: string | null
          finished_at: string | null
          id: number
          job: string
          ok: boolean | null
          started_at: string
        }
        Insert: {
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: never
          job: string
          ok?: boolean | null
          started_at?: string
        }
        Update: {
          detail?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: never
          job?: string
          ok?: boolean | null
          started_at?: string
        }
        Relationships: []
      }
      meal_times: {
        Row: {
          at: string
          created_at: string
          meal: Database['public']['Enums']['meal']
          reminder_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          at: string
          created_at?: string
          meal: Database['public']['Enums']['meal']
          reminder_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          at?: string
          created_at?: string
          meal?: Database['public']['Enums']['meal']
          reminder_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: Database['public']['Enums']['activity_level']
          avatar_path: string | null
          birth_date: string | null
          created_at: string
          display_name: string
          food_styles: string[]
          height_cm: number | null
          id: string
          onboarded_at: string | null
          referral_source: string | null
          sex: Database['public']['Enums']['sex'] | null
          target_weight_kg: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          activity_level?: Database['public']['Enums']['activity_level']
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string
          food_styles?: string[]
          height_cm?: number | null
          id: string
          onboarded_at?: string | null
          referral_source?: string | null
          sex?: Database['public']['Enums']['sex'] | null
          target_weight_kg?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          activity_level?: Database['public']['Enums']['activity_level']
          avatar_path?: string | null
          birth_date?: string | null
          created_at?: string
          display_name?: string
          food_styles?: string[]
          height_cm?: number | null
          id?: string
          onboarded_at?: string | null
          referral_source?: string | null
          sex?: Database['public']['Enums']['sex'] | null
          target_weight_kg?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          amount: number
          carbs_g_per_unit: number
          created_at: string
          fat_g_per_unit: number
          food_id: string | null
          id: string
          kcal_per_unit: number
          name: string
          position: number
          protein_g_per_unit: number
          recipe_id: string
          unit: Database['public']['Enums']['recipe_unit']
          updated_at: string
        }
        Insert: {
          amount: number
          carbs_g_per_unit?: number
          created_at?: string
          fat_g_per_unit?: number
          food_id?: string | null
          id?: string
          kcal_per_unit: number
          name: string
          position?: number
          protein_g_per_unit?: number
          recipe_id: string
          unit?: Database['public']['Enums']['recipe_unit']
          updated_at?: string
        }
        Update: {
          amount?: number
          carbs_g_per_unit?: number
          created_at?: string
          fat_g_per_unit?: number
          food_id?: string | null
          id?: string
          kcal_per_unit?: number
          name?: string
          position?: number
          protein_g_per_unit?: number
          recipe_id?: string
          unit?: Database['public']['Enums']['recipe_unit']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_reports: {
        Row: {
          created_at: string
          reason: Database['public']['Enums']['report_reason']
          recipe_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          reason: Database['public']['Enums']['report_reason']
          recipe_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          reason?: Database['public']['Enums']['report_reason']
          recipe_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_reports_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_reports_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_review_usage: {
        Row: {
          created_at: string
          reviews: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          reviews?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          created_at?: string
          reviews?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      recipe_saves: {
        Row: {
          recipe_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          recipe_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          recipe_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_saves_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_saves_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      recipes: {
        Row: {
          author_name: string
          created_at: string
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string
          is_public: boolean
          name: string
          owner_id: string | null
          photo_path: string | null
          review_note: string | null
          review_status: Database['public']['Enums']['recipe_review']
          saved_count: number
          servings: number
          share_slug: string
          source_recipe_id: string | null
          steps: string | null
          updated_at: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          is_public?: boolean
          name: string
          owner_id?: string | null
          photo_path?: string | null
          review_note?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          saved_count?: number
          servings?: number
          share_slug: string
          source_recipe_id?: string | null
          steps?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string
          created_at?: string
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string | null
          photo_path?: string | null
          review_note?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          saved_count?: number
          servings?: number
          share_slug?: string
          source_recipe_id?: string | null
          steps?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipes_source_recipe_id_fkey'
            columns: ['source_recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipes_source_recipe_id_fkey'
            columns: ['source_recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      scan_usage: {
        Row: {
          created_at: string
          scans: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          scans?: number
          updated_at?: string
          usage_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          scans?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      social_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          quarantined: boolean
          request_id: string
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          quarantined?: boolean
          request_id: string
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          quarantined?: boolean
          request_id?: string
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'social_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
        ]
      }
      social_counters: {
        Row: {
          entity_id: string
          metric: Database['public']['Enums']['social_counter_metric']
          shard: number
          value: number
        }
        Insert: {
          entity_id: string
          metric: Database['public']['Enums']['social_counter_metric']
          shard: number
          value?: number
        }
        Update: {
          entity_id?: string
          metric?: Database['public']['Enums']['social_counter_metric']
          shard?: number
          value?: number
        }
        Relationships: []
      }
      social_follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'social_follows_followed_id_fkey'
            columns: ['followed_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_follows_followed_id_fkey'
            columns: ['followed_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_follows_follower_id_fkey'
            columns: ['follower_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_follows_follower_id_fkey'
            columns: ['follower_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      social_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'social_likes_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_likes_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_likes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_likes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      social_notifications: {
        Row: {
          actor_id: string
          comment_id: string | null
          created_at: string
          id: string
          kind: Database['public']['Enums']['social_activity_kind']
          post_id: string | null
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: Database['public']['Enums']['social_activity_kind']
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['social_activity_kind']
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'social_notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_notifications_comment_id_fkey'
            columns: ['comment_id']
            isOneToOne: false
            referencedRelation: 'social_comment_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_comment_id_fkey'
            columns: ['comment_id']
            isOneToOne: false
            referencedRelation: 'social_comments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_notifications_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      social_posts: {
        Row: {
          audience: Database['public']['Enums']['social_audience']
          author_id: string
          caption: string
          created_at: string
          food_name: string
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string
          photo_etag: string | null
          photo_path: string | null
          published_at: string | null
          quarantined: boolean
          request_id: string
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          source_entry_id: string
          updated_at: string
        }
        Insert: {
          audience?: Database['public']['Enums']['social_audience']
          author_id: string
          caption?: string
          created_at?: string
          food_name: string
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          photo_etag?: string | null
          photo_path?: string | null
          published_at?: string | null
          quarantined?: boolean
          request_id: string
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          source_entry_id: string
          updated_at?: string
        }
        Update: {
          audience?: Database['public']['Enums']['social_audience']
          author_id?: string
          caption?: string
          created_at?: string
          food_name?: string
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          photo_etag?: string | null
          photo_path?: string | null
          published_at?: string | null
          quarantined?: boolean
          request_id?: string
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          source_entry_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_posts_source_entry_id_fkey'
            columns: ['source_entry_id']
            isOneToOne: true
            referencedRelation: 'food_log_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_posts_source_entry_id_fkey'
            columns: ['source_entry_id']
            isOneToOne: true
            referencedRelation: 'food_logs'
            referencedColumns: ['id']
          },
        ]
      }
      social_profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          created_at: string
          display_name: string
          handle: string
          photo_etag: string | null
          quarantined: boolean
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          display_name: string
          handle: string
          photo_etag?: string | null
          quarantined?: boolean
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          handle?: string
          photo_etag?: string | null
          quarantined?: boolean
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_rate_limits: {
        Row: {
          action: string
          bucket: string
          used: number
          user_id: string
        }
        Insert: {
          action: string
          bucket: string
          used: number
          user_id: string
        }
        Update: {
          action?: string
          bucket?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      social_reports: {
        Row: {
          content_id: string
          content_revision: number
          created_at: string
          kind: Database['public']['Enums']['social_content_kind']
          reason: Database['public']['Enums']['report_reason']
          reporter_id: string
          resolved_at: string | null
        }
        Insert: {
          content_id: string
          content_revision: number
          created_at?: string
          kind: Database['public']['Enums']['social_content_kind']
          reason: Database['public']['Enums']['report_reason']
          reporter_id: string
          resolved_at?: string | null
        }
        Update: {
          content_id?: string
          content_revision?: number
          created_at?: string
          kind?: Database['public']['Enums']['social_content_kind']
          reason?: Database['public']['Enums']['report_reason']
          reporter_id?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          last_event_at: string | null
          plan: Database['public']['Enums']['subscription_plan'] | null
          product_id: string | null
          rc_app_user_id: string | null
          status: Database['public']['Enums']['subscription_status']
          store: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          last_event_at?: string | null
          plan?: Database['public']['Enums']['subscription_plan'] | null
          product_id?: string | null
          rc_app_user_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          store?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          last_event_at?: string | null
          plan?: Database['public']['Enums']['subscription_plan'] | null
          product_id?: string | null
          rc_app_user_id?: string | null
          status?: Database['public']['Enums']['subscription_status']
          store?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          activity_extends_budget: boolean
          anonymous_food_data: boolean
          created_at: string
          energy: Database['public']['Enums']['energy_unit']
          language: string
          notify_monthly_report: boolean
          notify_water: boolean
          notify_weekly_report: boolean
          notify_weigh_in: boolean
          quiet_from: string
          quiet_to: string
          share_with_family: boolean
          step_goal: number
          units: Database['public']['Enums']['unit_system']
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_extends_budget?: boolean
          anonymous_food_data?: boolean
          created_at?: string
          energy?: Database['public']['Enums']['energy_unit']
          language?: string
          notify_monthly_report?: boolean
          notify_water?: boolean
          notify_weekly_report?: boolean
          notify_weigh_in?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          step_goal?: number
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_extends_budget?: boolean
          anonymous_food_data?: boolean
          created_at?: string
          energy?: Database['public']['Enums']['energy_unit']
          language?: string
          notify_monthly_report?: boolean
          notify_water?: boolean
          notify_weekly_report?: boolean
          notify_weigh_in?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          step_goal?: number
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          measured_on: string
          provider: Database['public']['Enums']['health_provider'] | null
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          measured_on: string
          provider?: Database['public']['Enums']['health_provider'] | null
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          body_fat_pct?: number | null
          created_at?: string
          measured_on?: string
          provider?: Database['public']['Enums']['health_provider'] | null
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      current_daily_goals: {
        Row: {
          carbs_g: number | null
          effective_from: string | null
          fat_g: number | null
          is_custom: boolean | null
          kcal: number | null
          protein_g: number | null
          user_id: string | null
          water_ml: number | null
        }
        Relationships: []
      }
      daily_nutrition: {
        Row: {
          carbs_g: number | null
          entry_count: number | null
          fat_g: number | null
          fibre_g: number | null
          kcal: number | null
          log_date: string | null
          protein_g: number | null
          sugar_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
      food_log_details: {
        Row: {
          base_carbs_g: number | null
          base_fat_g: number | null
          base_fibre_g: number | null
          base_kcal: number | null
          base_protein_g: number | null
          base_serving_grams: number | null
          base_sodium_mg: number | null
          base_sugar_g: number | null
          carbs_g: number | null
          fat_g: number | null
          fibre_g: number | null
          food_brand: string | null
          food_id: string | null
          food_name: string | null
          grams: number | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          item_brand: string | null
          item_name: string | null
          kcal: number | null
          log_date: string | null
          logged_at: string | null
          note: string | null
          override_carbs_g: number | null
          override_fat_g: number | null
          override_kcal: number | null
          override_protein_g: number | null
          photo_path: string | null
          place: Database['public']['Enums']['food_place'] | null
          protein_g: number | null
          quantity: number | null
          recipe_id: string | null
          scan_id: string | null
          serving_factor: number | null
          serving_id: string | null
          serving_label: string | null
          sodium_mg: number | null
          source: Database['public']['Enums']['entry_source'] | null
          sugar_g: number | null
          suggested_edits: Json | null
          user_id: string | null
        }
        Insert: {
          base_carbs_g?: number | null
          base_fat_g?: number | null
          base_fibre_g?: number | null
          base_kcal?: number | null
          base_protein_g?: number | null
          base_serving_grams?: number | null
          base_sodium_mg?: number | null
          base_sugar_g?: number | null
          carbs_g?: never
          fat_g?: never
          fibre_g?: never
          food_brand?: string | null
          food_id?: string | null
          food_name?: never
          grams?: never
          icon_name?: never
          icon_set?: never
          id?: string | null
          item_brand?: string | null
          item_name?: string | null
          kcal?: never
          log_date?: string | null
          logged_at?: string | null
          note?: string | null
          override_carbs_g?: number | null
          override_fat_g?: number | null
          override_kcal?: number | null
          override_protein_g?: number | null
          photo_path?: string | null
          place?: Database['public']['Enums']['food_place'] | null
          protein_g?: never
          quantity?: number | null
          recipe_id?: string | null
          scan_id?: string | null
          serving_factor?: number | null
          serving_id?: string | null
          serving_label?: string | null
          sodium_mg?: never
          source?: Database['public']['Enums']['entry_source'] | null
          sugar_g?: never
          suggested_edits?: Json | null
          user_id?: string | null
        }
        Update: {
          base_carbs_g?: number | null
          base_fat_g?: number | null
          base_fibre_g?: number | null
          base_kcal?: number | null
          base_protein_g?: number | null
          base_serving_grams?: number | null
          base_sodium_mg?: number | null
          base_sugar_g?: number | null
          carbs_g?: never
          fat_g?: never
          fibre_g?: never
          food_brand?: string | null
          food_id?: string | null
          food_name?: never
          grams?: never
          icon_name?: never
          icon_set?: never
          id?: string | null
          item_brand?: string | null
          item_name?: string | null
          kcal?: never
          log_date?: string | null
          logged_at?: string | null
          note?: string | null
          override_carbs_g?: number | null
          override_fat_g?: number | null
          override_kcal?: number | null
          override_protein_g?: number | null
          photo_path?: string | null
          place?: Database['public']['Enums']['food_place'] | null
          protein_g?: never
          quantity?: number | null
          recipe_id?: string | null
          scan_id?: string | null
          serving_factor?: number | null
          serving_id?: string | null
          serving_label?: string | null
          sodium_mg?: never
          source?: Database['public']['Enums']['entry_source'] | null
          sugar_g?: never
          suggested_edits?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      food_log_ingredient_details: {
        Row: {
          carbs_g: number | null
          fat_g: number | null
          food_id: string | null
          food_log_id: string | null
          grams: number | null
          id: string | null
          kcal: number | null
          name: string | null
          position: number | null
          protein_g: number | null
          quantity: number | null
          serving_label: string | null
        }
        Insert: {
          carbs_g?: never
          fat_g?: never
          food_id?: string | null
          food_log_id?: string | null
          grams?: never
          id?: string | null
          kcal?: never
          name?: never
          position?: number | null
          protein_g?: never
          quantity?: number | null
          serving_label?: string | null
        }
        Update: {
          carbs_g?: never
          fat_g?: never
          food_id?: string | null
          food_log_id?: string | null
          grams?: never
          id?: string | null
          kcal?: never
          name?: never
          position?: number | null
          protein_g?: never
          quantity?: number | null
          serving_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'food_log_ingredients_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_log_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_log_ingredients_food_log_id_fkey'
            columns: ['food_log_id']
            isOneToOne: false
            referencedRelation: 'food_logs'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_details: {
        Row: {
          author_name: string | null
          created_at: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          ingredient_count: number | null
          is_mine: boolean | null
          is_official: boolean | null
          is_public: boolean | null
          name: string | null
          owner_id: string | null
          photo_path: string | null
          review_note: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          saved_count: number | null
          serving_carbs_g: number | null
          serving_fat_g: number | null
          serving_kcal: number | null
          serving_protein_g: number | null
          servings: number | null
          share_slug: string | null
          source_recipe_id: string | null
          steps: string | null
          total_carbs_g: number | null
          total_fat_g: number | null
          total_kcal: number | null
          total_protein_g: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'recipes_source_recipe_id_fkey'
            columns: ['source_recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipes_source_recipe_id_fkey'
            columns: ['source_recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_ingredient_details: {
        Row: {
          amount: number | null
          carbs_g: number | null
          carbs_g_per_unit: number | null
          fat_g: number | null
          fat_g_per_unit: number | null
          food_id: string | null
          id: string | null
          kcal: number | null
          kcal_per_unit: number | null
          name: string | null
          position: number | null
          protein_g: number | null
          protein_g_per_unit: number | null
          recipe_id: string | null
          unit: Database['public']['Enums']['recipe_unit'] | null
        }
        Insert: {
          amount?: number | null
          carbs_g?: never
          carbs_g_per_unit?: number | null
          fat_g?: never
          fat_g_per_unit?: number | null
          food_id?: string | null
          id?: string | null
          kcal?: never
          kcal_per_unit?: number | null
          name?: string | null
          position?: number | null
          protein_g?: never
          protein_g_per_unit?: number | null
          recipe_id?: string | null
          unit?: Database['public']['Enums']['recipe_unit'] | null
        }
        Update: {
          amount?: number | null
          carbs_g?: never
          carbs_g_per_unit?: number | null
          fat_g?: never
          fat_g_per_unit?: number | null
          food_id?: string | null
          id?: string | null
          kcal?: never
          kcal_per_unit?: number | null
          name?: string | null
          position?: number | null
          protein_g?: never
          protein_g_per_unit?: number | null
          recipe_id?: string | null
          unit?: Database['public']['Enums']['recipe_unit'] | null
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipe_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      social_comment_details: {
        Row: {
          author_id: string | null
          avatar_path: string | null
          body: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string | null
          post_id: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'social_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_comments_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
        ]
      }
      social_notification_details: {
        Row: {
          actor_avatar_path: string | null
          actor_display_name: string | null
          actor_handle: string | null
          actor_id: string | null
          comment_id: string | null
          created_at: string | null
          id: string | null
          kind: Database['public']['Enums']['social_activity_kind'] | null
          post_id: string | null
          read_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'social_notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_notifications_comment_id_fkey'
            columns: ['comment_id']
            isOneToOne: false
            referencedRelation: 'social_comment_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_comment_id_fkey'
            columns: ['comment_id']
            isOneToOne: false
            referencedRelation: 'social_comments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'social_notifications_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
        ]
      }
      social_post_details: {
        Row: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          avatar_path: string | null
          caption: string | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          like_count: number | null
          photo_path: string | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      social_profile_details: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          handle: string | null
          is_followed_by: boolean | null
          is_following: boolean | null
          post_count: number | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          user_id: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: never
          following_count?: never
          handle?: string | null
          is_followed_by?: never
          is_following?: never
          post_count?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          user_id?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: never
          following_count?: never
          handle?: string | null
          is_followed_by?: never
          is_following?: never
          post_count?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_food_stats: {
        Row: {
          food_id: string | null
          last_logged_at: string | null
          name: string | null
          times_logged: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activity_days_range: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          active_kcal: number
          at: string
          bucket: string
          distance_m: number
          eaten_kcal: number
          exercise_goal_min: number
          exercise_minutes: number
          goal_kcal: number
          has_data: boolean
          move_goal_kcal: number
          resting_kcal: number
          session_kcal: number
          session_seconds: number
          sessions: number
          stand_goal_hr: number
          stand_hours: number
          step_goal: number
          steps: number
        }[]
      }
      activity_series: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          active_days: number
          active_kcal_avg: number
          active_kcal_total: number
          balance_avg: number
          bucket_end: string
          bucket_start: string
          burn_avg: number
          days: number
          distance_total_m: number
          eaten_avg: number
          exercise_min_avg: number
          resting_kcal_avg: number
          session_kcal: number
          session_minutes: number
          sessions: number
          stand_hours_avg: number
          step_goal: number
          step_goal_days: number
          steps_avg: number
          steps_best: number
          steps_total: number
        }[]
      }
      activity_summary: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          active_days: number
          active_kcal_avg: number
          active_kcal_total: number
          balance_avg: number
          balance_days: number
          burn_avg: number
          days: number
          distance_total_m: number
          eaten_avg: number
          eaten_total: number
          exercise_min_avg: number
          exercise_min_total: number
          from_date: string
          resting_kcal_avg: number
          resting_kcal_total: number
          session_kcal: number
          session_minutes: number
          sessions: number
          stand_hours_avg: number
          step_goal: number
          step_goal_days: number
          steps_avg: number
          steps_best: number
          steps_total: number
          to_date: string
          walking_kcal: number
        }[]
      }
      add_ingredient: {
        Args: {
          p_carbs_g: number
          p_fat_g: number
          p_food_id?: string
          p_food_log_id: string
          p_grams?: number
          p_kcal: number
          p_name: string
          p_position?: number
          p_protein_g: number
          p_quantity?: number
          p_serving_id?: string
          p_serving_label?: string
        }
        Returns: string
      }
      add_water: { Args: { p_date?: string; p_ml: number }; Returns: number }
      barcode_hourly_limit: { Args: never; Returns: number }
      claim_barcode_scan: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          hourly_limit: number
          used: number
        }[]
      }
      claim_job_run: {
        Args: { p_job: string; p_lease_seconds?: number }
        Returns: number
      }
      claim_recipe_review: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          hourly_limit: number
          used: number
        }[]
      }
      claim_scan: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          daily_limit: number
          entitled: boolean
          used: number
        }[]
      }
      claim_social_review: { Args: { p_user: string }; Returns: boolean }
      clear_meal_photos: { Args: { p_rows: Json }; Returns: number }
      compute_targets: {
        Args: {
          p_activity: Database['public']['Enums']['activity_level']
          p_birth_date: string
          p_height_cm: number
          p_sex: Database['public']['Enums']['sex']
          p_target_weight_kg?: number
          p_weight_kg: number
        }
        Returns: {
          carbs_g: number
          fat_g: number
          kcal: number
          protein_g: number
        }[]
      }
      create_social_comment: {
        Args: { p_body: string; p_post_id: string; p_request_id: string }
        Returns: string
      }
      create_social_post: {
        Args: {
          p_audience: Database['public']['Enums']['social_audience']
          p_caption: string
          p_entry_id: string
          p_request_id: string
        }
        Returns: string
      }
      current_weight_kg: { Args: { p_user_id?: string }; Returns: number }
      day_marks: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          active_kcal: number
          at: string
          entry_count: number
          goal_kcal: number
          kcal: number
        }[]
      }
      day_plates: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          at: string
          food_name: string
          icon_name: string
          icon_set: Database['public']['Enums']['icon_set']
          photo_path: string
        }[]
      }
      delete_social_comment: { Args: { p_id: string }; Returns: undefined }
      delete_social_post: { Args: { p_id: string }; Returns: undefined }
      expired_meal_photos: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          item_name: string
          photo_path: string
        }[]
      }
      finish_job_run: {
        Args: { p_detail?: Json; p_error?: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      free_daily_scans: { Args: never; Returns: number }
      free_photo_retention_days: { Args: never; Returns: number }
      free_recipe_limit: { Args: never; Returns: number }
      get_shared_recipe: {
        Args: { p_share_slug: string }
        Returns: {
          author_name: string | null
          created_at: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          ingredient_count: number | null
          is_mine: boolean | null
          is_official: boolean | null
          is_public: boolean | null
          name: string | null
          owner_id: string | null
          photo_path: string | null
          review_note: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          saved_count: number | null
          serving_carbs_g: number | null
          serving_fat_g: number | null
          serving_kcal: number | null
          serving_protein_g: number | null
          servings: number | null
          share_slug: string | null
          source_recipe_id: string | null
          steps: string | null
          total_carbs_g: number | null
          total_fat_g: number | null
          total_kcal: number | null
          total_protein_g: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'recipe_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_recipe_ingredients: {
        Args: { p_share_slug: string }
        Returns: {
          amount: number | null
          carbs_g: number | null
          carbs_g_per_unit: number | null
          fat_g: number | null
          fat_g_per_unit: number | null
          food_id: string | null
          id: string | null
          kcal: number | null
          kcal_per_unit: number | null
          name: string | null
          position: number | null
          protein_g: number | null
          protein_g_per_unit: number | null
          recipe_id: string | null
          unit: Database['public']['Enums']['recipe_unit'] | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'recipe_ingredient_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      goals_on: {
        Args: { p_date: string; p_user_id?: string }
        Returns: {
          carbs_g: number
          created_at: string
          effective_from: string
          fat_g: number
          is_custom: boolean
          kcal: number
          protein_g: number
          updated_at: string
          user_id: string
          water_ml: number
        }
        SetofOptions: {
          from: '*'
          to: 'daily_goals'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gtin14: { Args: { code: string }; Returns: string }
      has_account_password: { Args: never; Returns: boolean }
      is_entitled: { Args: { p_user: string }; Returns: boolean }
      lapsed_photo_grace_days: { Args: never; Returns: number }
      local_today: { Args: { p_user_id?: string }; Returns: string }
      logging_streak: {
        Args: { p_user_id?: string }
        Returns: {
          best_days: number
          current_days: number
        }[]
      }
      mark_social_notifications_read: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      pro_daily_scans: { Args: never; Returns: number }
      recipe_mark_for_review: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      recipe_review_hourly_limit: { Args: never; Returns: number }
      remove_ingredient: {
        Args: { p_ingredient_id: string }
        Returns: undefined
      }
      remove_social_follower: {
        Args: { p_follower_id: string }
        Returns: undefined
      }
      report_social_content: {
        Args: {
          p_id: string
          p_kind: Database['public']['Enums']['social_content_kind']
          p_reason: Database['public']['Enums']['report_reason']
        }
        Returns: undefined
      }
      report_threshold: { Args: never; Returns: number }
      resolve_social_report: {
        Args: {
          p_id: string
          p_kind: Database['public']['Enums']['social_content_kind']
          p_photo_etag?: string
          p_reason?: string
          p_revision?: number
          p_status: Database['public']['Enums']['recipe_review']
        }
        Returns: boolean
      }
      review_days: {
        Args: { p_from: string; p_to: string; p_user_id?: string }
        Returns: {
          active_kcal: number
          at: string
          carbs_g: number
          distance_m: number
          entry_count: number
          exercise_minutes: number
          fat_g: number
          goal_kcal: number
          goal_water: number
          has_activity: boolean
          kcal: number
          protein_g: number
          resting_kcal: number
          session_kcal: number
          session_seconds: number
          sessions: number
          step_goal: number
          steps: number
          water_ml: number
          weight_kg: number
        }[]
      }
      review_end: { Args: { p_kind: string; p_start: string }; Returns: string }
      review_meals: {
        Args: {
          p_kind: string
          p_limit?: number
          p_start: string
          p_user_id?: string
        }
        Returns: {
          carbs_g_avg: number
          fat_g_avg: number
          icon_name: string
          icon_set: Database['public']['Enums']['icon_set']
          kcal_avg: number
          name: string
          photo_path: string
          protein_g_avg: number
        }[]
      }
      review_periods: {
        Args: { p_kind: string; p_user_id?: string }
        Returns: {
          days: number
          days_logged: number
          ends_on: string
          kcal_avg: number
          kind: string
          marks: number[]
          starts_on: string
          weight_change: number
        }[]
      }
      review_series: {
        Args: { p_kind: string; p_start: string; p_user_id?: string }
        Returns: {
          bucket_start: string
          carbs_g_avg: number
          days_logged: number
          fat_g_avg: number
          kcal_avg: number
          protein_g_avg: number
          steps_avg: number
          weight_last: number
        }[]
      }
      review_social_content: {
        Args: {
          p_id: string
          p_kind: Database['public']['Enums']['social_content_kind']
          p_photo_etag?: string
          p_reason?: string
          p_revision: number
          p_status: Database['public']['Enums']['recipe_review']
        }
        Returns: boolean
      }
      review_summary: {
        Args: { p_kind: string; p_start: string; p_user_id?: string }
        Returns: {
          active_days: number
          active_kcal_avg: number
          carbs_g_avg: number
          days: number
          days_logged: number
          days_under_goal: number
          distance_total_m: number
          ends_on: string
          exercise_min_total: number
          fat_g_avg: number
          heaviest_kcal: number
          heaviest_on: string
          kcal_avg: number
          kcal_goal: number
          kind: string
          lightest_kcal: number
          lightest_on: string
          protein_g_avg: number
          sessions: number
          starts_on: string
          step_goal: number
          step_goal_days: number
          steps_avg: number
          streak_days: number
          water_avg: number
          water_goal_days: number
          weigh_ins: number
          weight_change: number
          weight_last: number
        }[]
      }
      save_recipe_copy: { Args: { p_recipe_id: string }; Returns: string }
      save_shared_recipe_copy: {
        Args: { p_share_slug: string }
        Returns: string
      }
      scan_daily_limit: { Args: { p_user: string }; Returns: number }
      scan_usage_today: {
        Args: never
        Returns: {
          daily_limit: number
          entitled: boolean
          remaining: number
          used: number
        }[]
      }
      search_normalize: { Args: { txt: string }; Returns: string }
      set_ingredient_quantity: {
        Args: { p_ingredient_id: string; p_quantity: number }
        Returns: undefined
      }
      set_recipe_public: {
        Args: { p_public: boolean; p_recipe_id: string }
        Returns: Database['public']['Enums']['recipe_review']
      }
      set_social_follow: {
        Args: { p_following: boolean; p_target_id: string }
        Returns: undefined
      }
      set_social_like: {
        Args: { p_liked: boolean; p_post_id: string }
        Returns: undefined
      }
      set_social_profile: {
        Args: {
          p_avatar_path?: string
          p_bio?: string
          p_display_name: string
          p_handle: string
        }
        Returns: string
      }
      social_blocked_profiles: {
        Args: { p_before_at?: string; p_before_id?: string; p_limit?: number }
        Returns: {
          avatar_path: string
          bio: string
          connection_created_at: string
          created_at: string
          display_name: string
          follower_count: number
          following_count: number
          handle: string
          is_followed_by: boolean
          is_following: boolean
          post_count: number
          quarantined: boolean
          review_reason: string
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          user_id: string
        }[]
      }
      social_comments: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_limit?: number
          p_post_id: string
        }
        Returns: {
          author_id: string | null
          avatar_path: string | null
          body: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string | null
          post_id: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_comment_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_connections: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_direction?: string
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          avatar_path: string
          bio: string
          connection_created_at: string
          created_at: string
          display_name: string
          follower_count: number
          following_count: number
          handle: string
          is_followed_by: boolean
          is_following: boolean
          post_count: number
          quarantined: boolean
          review_reason: string
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          user_id: string
        }[]
      }
      social_entry_post: { Args: { p_entry_id: string }; Returns: string }
      social_feed: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_limit?: number
          p_mode?: string
        }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          avatar_path: string | null
          caption: string | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          like_count: number | null
          photo_path: string | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_post_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_has_unread_notifications: { Args: never; Returns: boolean }
      social_notifications: {
        Args: { p_before_at?: string; p_before_id?: string; p_limit?: number }
        Returns: {
          actor_avatar_path: string | null
          actor_display_name: string | null
          actor_handle: string | null
          actor_id: string | null
          comment_id: string | null
          created_at: string | null
          id: string | null
          kind: Database['public']['Enums']['social_activity_kind'] | null
          post_id: string | null
          read_at: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_notification_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_photo_claims: {
        Args: { p_keys: string[] }
        Returns: {
          kind: string
          owner_id: string
          photo_etag: string
          photo_path: string
        }[]
      }
      social_post: {
        Args: { p_id: string }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          avatar_path: string | null
          caption: string | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          like_count: number | null
          photo_path: string | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_post_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatar_path: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          handle: string | null
          is_followed_by: boolean | null
          is_following: boolean | null
          post_count: number | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_profile_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_profile_posts: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          avatar_path: string | null
          caption: string | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          like_count: number | null
          photo_path: string | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_post_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_search_profiles: {
        Args: { p_after_handle?: string; p_limit?: number; p_query: string }
        Returns: {
          avatar_path: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          handle: string | null
          is_followed_by: boolean | null
          is_following: boolean | null
          post_count: number | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_profile_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_suggestions: {
        Args: { p_limit?: number }
        Returns: {
          avatar_path: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          handle: string | null
          is_followed_by: boolean | null
          is_following: boolean | null
          post_count: number | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_profile_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      social_unread_notification_count: { Args: never; Returns: number }
      sync_weight_readings: {
        Args: {
          p_provider: Database['public']['Enums']['health_provider']
          p_readings: Json
        }
        Returns: number
      }
      trend_days: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          at: string
          bucket: string
          carbs_g: number
          entry_count: number
          fat_g: number
          goal_kcal: number
          goal_water: number
          kcal: number
          protein_g: number
          water_ml: number
          weight_kg: number
        }[]
      }
      trend_series: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          bucket_end: string
          bucket_start: string
          carbs_g_avg: number
          days: number
          days_logged: number
          days_under_goal: number
          fat_g_avg: number
          kcal_avg: number
          kcal_goal: number
          protein_g_avg: number
          water_avg: number
          water_best: number
          water_goal: number
          water_goal_days: number
          water_habit_days: number
          water_logged_days: number
          water_total: number
          weigh_ins: number
          weight_avg: number
          weight_last: number
          weight_min: number
        }[]
      }
      trend_summary: {
        Args: { p_range: string; p_user_id?: string }
        Returns: {
          carbs_g_avg: number
          days: number
          days_logged: number
          days_under_goal: number
          fat_g_avg: number
          from_date: string
          kcal_avg: number
          kcal_goal: number
          protein_g_avg: number
          to_date: string
          water_avg: number
          water_best: number
          water_goal: number
          water_goal_days: number
          water_habit_days: number
          water_logged_days: number
          water_total: number
          weigh_ins: number
          weight_avg: number
          weight_before: number
          weight_first: number
          weight_last: number
          weight_peak: number
          weight_peak_on: string
        }[]
      }
      update_social_comment: {
        Args: { p_body: string; p_id: string }
        Returns: string
      }
      update_social_post: {
        Args: {
          p_audience: Database['public']['Enums']['social_audience']
          p_caption: string
          p_id: string
        }
        Returns: string
      }
    }
    Enums: {
      activity_level: 'sedentary' | 'light' | 'on_feet' | 'very_active'
      energy_unit: 'kcal' | 'kj'
      entry_source: 'search' | 'quick_add' | 'camera' | 'voice' | 'import' | 'text'
      food_place: 'mamak' | 'kopitiam' | 'hawker' | 'packaged' | 'home'
      health_provider: 'apple_health' | 'health_connect' | 'demo'
      icon_set: 'body' | 'dishes' | 'food' | 'system' | 'ui'
      meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
      recipe_review: 'pending' | 'approved' | 'rejected'
      recipe_unit: 'g' | 'ml' | 'piece'
      report_reason: 'inappropriate' | 'spam' | 'dangerous' | 'stolen'
      sex: 'female' | 'male'
      social_activity_kind: 'follow' | 'like' | 'comment'
      social_audience: 'public' | 'followers'
      social_content_kind: 'profile' | 'post' | 'comment'
      social_counter_metric: 'followers' | 'following' | 'posts' | 'likes' | 'comments'
      subscription_plan: 'monthly' | 'yearly' | 'lifetime'
      subscription_status: 'none' | 'trial' | 'active' | 'expired' | 'billing_retry'
      unit_system: 'metric' | 'imperial'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_level: ['sedentary', 'light', 'on_feet', 'very_active'],
      energy_unit: ['kcal', 'kj'],
      entry_source: ['search', 'quick_add', 'camera', 'voice', 'import', 'text'],
      food_place: ['mamak', 'kopitiam', 'hawker', 'packaged', 'home'],
      health_provider: ['apple_health', 'health_connect', 'demo'],
      icon_set: ['body', 'dishes', 'food', 'system', 'ui'],
      meal: ['breakfast', 'lunch', 'dinner', 'snack'],
      recipe_review: ['pending', 'approved', 'rejected'],
      recipe_unit: ['g', 'ml', 'piece'],
      report_reason: ['inappropriate', 'spam', 'dangerous', 'stolen'],
      sex: ['female', 'male'],
      social_activity_kind: ['follow', 'like', 'comment'],
      social_audience: ['public', 'followers'],
      social_content_kind: ['profile', 'post', 'comment'],
      social_counter_metric: ['followers', 'following', 'posts', 'likes', 'comments'],
      subscription_plan: ['monthly', 'yearly', 'lifetime'],
      subscription_status: ['none', 'trial', 'active', 'expired', 'billing_retry'],
      unit_system: ['metric', 'imperial'],
    },
  },
} as const
