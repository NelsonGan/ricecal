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
      custom_exercises: {
        Row: {
          category: string
          created_at: string
          equipment: string
          id: string
          muscles: Json
          name: string
          tracking: Database['public']['Enums']['exercise_tracking']
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          equipment?: string
          id?: string
          muscles?: Json
          name: string
          tracking?: Database['public']['Enums']['exercise_tracking']
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          equipment?: string
          id?: string
          muscles?: Json
          name?: string
          tracking?: Database['public']['Enums']['exercise_tracking']
          updated_at?: string
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
          board_meal: Database['public']['Enums']['group_meal'] | null
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
          plate_quantity: number
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
          board_meal?: Database['public']['Enums']['group_meal'] | null
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
          plate_quantity?: number
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
          board_meal?: Database['public']['Enums']['group_meal'] | null
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
          plate_quantity?: number
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
      group_invites: {
        Row: {
          by_email: boolean
          created_at: string
          group_id: string
          id: string
          invitee_id: string
          inviter_id: string
          pushed_at: string | null
        }
        Insert: {
          by_email?: boolean
          created_at?: string
          group_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          pushed_at?: string | null
        }
        Update: {
          by_email?: boolean
          created_at?: string
          group_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          pushed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'group_invites_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_invites_invitee_id_fkey'
            columns: ['invitee_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_invites_invitee_id_fkey'
            columns: ['invitee_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_invites_invitee_id_fkey'
            columns: ['invitee_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_invites_inviter_id_fkey'
            columns: ['inviter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_invites_inviter_id_fkey'
            columns: ['inviter_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_invites_inviter_id_fkey'
            columns: ['inviter_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_members: {
        Row: {
          board_order: string[]
          chat_read_at: string
          group_id: string
          joined_at: string
          notify: boolean
          user_id: string
        }
        Insert: {
          board_order?: string[]
          chat_read_at?: string
          group_id: string
          joined_at?: string
          notify?: boolean
          user_id: string
        }
        Update: {
          board_order?: string[]
          chat_read_at?: string
          group_id?: string
          joined_at?: string
          notify?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_message_reactions_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'group_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_message_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_message_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_message_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_message_reports: {
        Row: {
          created_at: string
          message_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_message_reports_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'group_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_message_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_message_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_message_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_messages: {
        Row: {
          activity_id: string | null
          author_id: string
          body: string
          created_at: string
          group_id: string
          id: string
          post_id: string | null
          pushed_at: string | null
          quarantined: boolean
          reply_to_id: string | null
          request_id: string
          workout_id: string | null
        }
        Insert: {
          activity_id?: string | null
          author_id: string
          body: string
          created_at?: string
          group_id: string
          id?: string
          post_id?: string | null
          pushed_at?: string | null
          quarantined?: boolean
          reply_to_id?: string | null
          request_id: string
          workout_id?: string | null
        }
        Update: {
          activity_id?: string | null
          author_id?: string
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          post_id?: string | null
          pushed_at?: string | null
          quarantined?: boolean
          reply_to_id?: string | null
          request_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'group_messages_activity_id_fkey'
            columns: ['activity_id']
            isOneToOne: false
            referencedRelation: 'activity_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_messages_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_post_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_post_id_fkey'
            columns: ['post_id']
            isOneToOne: false
            referencedRelation: 'social_posts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_reply_to_id_fkey'
            columns: ['reply_to_id']
            isOneToOne: false
            referencedRelation: 'group_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_workout_id_fkey'
            columns: ['workout_id']
            isOneToOne: false
            referencedRelation: 'workout_summaries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_messages_workout_id_fkey'
            columns: ['workout_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id']
          },
        ]
      }
      group_nudges: {
        Row: {
          created_at: string
          day: string
          group_id: string
          id: string
          meal: Database['public']['Enums']['group_meal']
          nudger_id: string
          pushed_at: string | null
          target_id: string
        }
        Insert: {
          created_at?: string
          day: string
          group_id: string
          id?: string
          meal: Database['public']['Enums']['group_meal']
          nudger_id: string
          pushed_at?: string | null
          target_id: string
        }
        Update: {
          created_at?: string
          day?: string
          group_id?: string
          id?: string
          meal?: Database['public']['Enums']['group_meal']
          nudger_id?: string
          pushed_at?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_nudges_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_nudges_nudger_id_fkey'
            columns: ['nudger_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_nudges_nudger_id_fkey'
            columns: ['nudger_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_nudges_nudger_id_fkey'
            columns: ['nudger_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_nudges_target_id_fkey'
            columns: ['target_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_nudges_target_id_fkey'
            columns: ['target_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_nudges_target_id_fkey'
            columns: ['target_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_reactions: {
        Row: {
          entry_id: string
          user_id: string
          value: number
        }
        Insert: {
          entry_id: string
          user_id: string
          value: number
        }
        Update: {
          entry_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'group_reactions_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'food_log_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_reactions_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'food_logs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_reactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      group_reports: {
        Row: {
          created_at: string
          group_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_reports_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'group_reports_reporter_id_fkey'
            columns: ['reporter_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          icon_name: string
          icon_path: string | null
          id: string
          is_public: boolean
          leader_id: string | null
          member_count: number
          name: string
          quarantined: boolean
        }
        Insert: {
          created_at?: string
          icon_name?: string
          icon_path?: string | null
          id?: string
          is_public?: boolean
          leader_id?: string | null
          member_count?: number
          name: string
          quarantined?: boolean
        }
        Update: {
          created_at?: string
          icon_name?: string
          icon_path?: string | null
          id?: string
          is_public?: boolean
          leader_id?: string | null
          member_count?: number
          name?: string
          quarantined?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'groups_leader_id_fkey'
            columns: ['leader_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'groups_leader_id_fkey'
            columns: ['leader_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'groups_leader_id_fkey'
            columns: ['leader_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
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
      photo_removal_warnings: {
        Row: {
          user_id: string
          warned_at: string
        }
        Insert: {
          user_id: string
          warned_at?: string
        }
        Update: {
          user_id?: string
          warned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'photo_removal_warnings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'photo_removal_warnings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'photo_removal_warnings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      profiles: {
        Row: {
          activity_level: Database['public']['Enums']['activity_level']
          auto_post_foods: boolean
          auto_post_workouts: boolean
          avatar_path: string | null
          bio: string
          birth_date: string | null
          created_at: string
          display_name: string
          food_styles: string[]
          handle: string | null
          height_cm: number | null
          id: string
          is_private: boolean
          onboarded_at: string | null
          photo_etag: string | null
          quarantined: boolean
          referral_source: string | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          seen_announcements: string[]
          sex: Database['public']['Enums']['sex'] | null
          social_joined_at: string | null
          target_weight_kg: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          activity_level?: Database['public']['Enums']['activity_level']
          auto_post_foods?: boolean
          auto_post_workouts?: boolean
          avatar_path?: string | null
          bio?: string
          birth_date?: string | null
          created_at?: string
          display_name?: string
          food_styles?: string[]
          handle?: string | null
          height_cm?: number | null
          id: string
          is_private?: boolean
          onboarded_at?: string | null
          photo_etag?: string | null
          quarantined?: boolean
          referral_source?: string | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          seen_announcements?: string[]
          sex?: Database['public']['Enums']['sex'] | null
          social_joined_at?: string | null
          target_weight_kg?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          activity_level?: Database['public']['Enums']['activity_level']
          auto_post_foods?: boolean
          auto_post_workouts?: boolean
          avatar_path?: string | null
          bio?: string
          birth_date?: string | null
          created_at?: string
          display_name?: string
          food_styles?: string[]
          handle?: string | null
          height_cm?: number | null
          id?: string
          is_private?: boolean
          onboarded_at?: string | null
          photo_etag?: string | null
          quarantined?: boolean
          referral_source?: string | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          seen_announcements?: string[]
          sex?: Database['public']['Enums']['sex'] | null
          social_joined_at?: string | null
          target_weight_kg?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profile_details'
            referencedColumns: ['user_id']
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'social_profiles'
            referencedColumns: ['user_id']
          },
        ]
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
            referencedRelation: 'profiles'
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
            referencedRelation: 'profiles'
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
          carbs_g: number | null
          created_at: string
          fat_g: number | null
          food_name: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string
          kcal: number | null
          kind: Database['public']['Enums']['social_post_kind']
          photo_etag: string | null
          photo_path: string | null
          protein_g: number | null
          published_at: string | null
          quarantined: boolean
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          source_entry_id: string | null
          source_workout_id: string | null
          updated_at: string
          workout_records: number | null
        }
        Insert: {
          audience?: Database['public']['Enums']['social_audience']
          author_id: string
          caption?: string
          carbs_g?: number | null
          created_at?: string
          fat_g?: number | null
          food_name?: string | null
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          kcal?: number | null
          kind?: Database['public']['Enums']['social_post_kind']
          photo_etag?: string | null
          photo_path?: string | null
          protein_g?: number | null
          published_at?: string | null
          quarantined?: boolean
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          source_entry_id?: string | null
          source_workout_id?: string | null
          updated_at?: string
          workout_records?: number | null
        }
        Update: {
          audience?: Database['public']['Enums']['social_audience']
          author_id?: string
          caption?: string
          carbs_g?: number | null
          created_at?: string
          fat_g?: number | null
          food_name?: string | null
          icon_name?: string | null
          icon_set?: Database['public']['Enums']['icon_set'] | null
          id?: string
          kcal?: number | null
          kind?: Database['public']['Enums']['social_post_kind']
          photo_etag?: string | null
          photo_path?: string | null
          protein_g?: number | null
          published_at?: string | null
          quarantined?: boolean
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review']
          revision?: number
          source_entry_id?: string | null
          source_workout_id?: string | null
          updated_at?: string
          workout_records?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
          {
            foreignKeyName: 'social_posts_workout_owned'
            columns: ['source_workout_id', 'author_id']
            isOneToOne: false
            referencedRelation: 'workout_summaries'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'social_posts_workout_owned'
            columns: ['source_workout_id', 'author_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id', 'user_id']
          },
        ]
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
          photo_note_prompt: boolean
          quiet_from: string
          quiet_to: string
          share_with_family: boolean
          step_goal: number
          units: Database['public']['Enums']['unit_system']
          updated_at: string
          user_id: string
          workout_reminder_at: string
          workout_reminder_days: number[]
          workout_rest_s: number
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
          photo_note_prompt?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          step_goal?: number
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id: string
          workout_reminder_at?: string
          workout_reminder_days?: number[]
          workout_rest_s?: number
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
          photo_note_prompt?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          step_goal?: number
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id?: string
          workout_reminder_at?: string
          workout_reminder_days?: number[]
          workout_rest_s?: number
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
      workout_exercises: {
        Row: {
          exercise_id: string
          exercise_name: string
          id: string
          notes: string | null
          position: number
          rest_s: number | null
          superset: number | null
          tracking: Database['public']['Enums']['exercise_tracking']
          user_id: string
          workout_id: string
        }
        Insert: {
          exercise_id: string
          exercise_name: string
          id?: string
          notes?: string | null
          position: number
          rest_s?: number | null
          superset?: number | null
          tracking: Database['public']['Enums']['exercise_tracking']
          user_id: string
          workout_id: string
        }
        Update: {
          exercise_id?: string
          exercise_name?: string
          id?: string
          notes?: string | null
          position?: number
          rest_s?: number | null
          superset?: number | null
          tracking?: Database['public']['Enums']['exercise_tracking']
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_fkey'
            columns: ['workout_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_summaries'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'workout_exercises_workout_fkey'
            columns: ['workout_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_heart_rates: {
        Row: {
          active_kcal: number | null
          avg_bpm: number | null
          bpm: number[]
          created_at: string
          interval_s: number
          max_bpm: number | null
          min_bpm: number | null
          source: string
          started_at: string
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          active_kcal?: number | null
          avg_bpm?: number | null
          bpm: number[]
          created_at?: string
          interval_s: number
          max_bpm?: number | null
          min_bpm?: number | null
          source?: string
          started_at: string
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          active_kcal?: number | null
          avg_bpm?: number | null
          bpm?: number[]
          created_at?: string
          interval_s?: number
          max_bpm?: number | null
          min_bpm?: number | null
          source?: string
          started_at?: string
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_heart_rates_workout_fkey'
            columns: ['workout_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_summaries'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'workout_heart_rates_workout_fkey'
            columns: ['workout_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_routines: {
        Row: {
          created_at: string
          exercises: Json
          id: string
          last_used_at: string | null
          name: string
          notes: string | null
          position: number
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercises?: Json
          id?: string
          last_used_at?: string | null
          name: string
          notes?: string | null
          position?: number
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercises?: Json
          id?: string
          last_used_at?: string | null
          name?: string
          notes?: string | null
          position?: number
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_sets: {
        Row: {
          distance_m: number | null
          duration_s: number | null
          id: string
          kind: Database['public']['Enums']['workout_set_kind']
          position: number
          reps: number | null
          rpe: number | null
          user_id: string
          weight_kg: number | null
          workout_exercise_id: string
        }
        Insert: {
          distance_m?: number | null
          duration_s?: number | null
          id?: string
          kind?: Database['public']['Enums']['workout_set_kind']
          position: number
          reps?: number | null
          rpe?: number | null
          user_id: string
          weight_kg?: number | null
          workout_exercise_id: string
        }
        Update: {
          distance_m?: number | null
          duration_s?: number | null
          id?: string
          kind?: Database['public']['Enums']['workout_set_kind']
          position?: number
          reps?: number | null
          rpe?: number | null
          user_id?: string
          weight_kg?: number | null
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_sets_exercise_fkey'
            columns: ['workout_exercise_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          duration_s: number | null
          ended_at: string
          health_workout_id: string | null
          id: string
          kcal: number | null
          log_date: string
          name: string
          notes: string | null
          routine_id: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          ended_at: string
          health_workout_id?: string | null
          id: string
          kcal?: number | null
          log_date: string
          name: string
          notes?: string | null
          routine_id?: string | null
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          ended_at?: string
          health_workout_id?: string | null
          id?: string
          kcal?: number | null
          log_date?: string
          name?: string
          notes?: string | null
          routine_id?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workouts_routine_fkey'
            columns: ['routine_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_routines'
            referencedColumns: ['id', 'user_id']
          },
        ]
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
          ingredient_count: number | null
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
          plate_quantity: number | null
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
          author_is_pro: boolean | null
          avatar_path: string | null
          caption: string | null
          carbs_g: number | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          fat_g: number | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          kcal: number | null
          kind: Database['public']['Enums']['social_post_kind'] | null
          like_count: number | null
          photo_path: string | null
          protein_g: number | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          workout_duration_s: number | null
          workout_exercises: Json | null
          workout_name: string | null
          workout_records: number | null
          workout_sets: number | null
          workout_started_at: string | null
          workout_volume_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'social_posts_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
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
          is_pro: boolean | null
          post_count: number | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          user_id: string | null
        }
        Insert: {
          avatar_path?: never
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: never
          following_count?: never
          handle?: never
          is_followed_by?: never
          is_following?: never
          is_pro?: never
          post_count?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          user_id?: string | null
        }
        Update: {
          avatar_path?: never
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: never
          following_count?: never
          handle?: never
          is_followed_by?: never
          is_following?: never
          is_pro?: never
          post_count?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      social_profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          is_private: boolean | null
          photo_etag: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_path?: never
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: never
          is_private?: boolean | null
          photo_etag?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_path?: never
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: never
          is_private?: boolean | null
          photo_etag?: never
          quarantined?: boolean | null
          review_reason?: string | null
          review_status?: Database['public']['Enums']['recipe_review'] | null
          revision?: number | null
          updated_at?: string | null
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
      workout_set_details: {
        Row: {
          distance_m: number | null
          duration_s: number | null
          e1rm_kg: number | null
          exercise_id: string | null
          exercise_position: number | null
          id: string | null
          is_distance_pr: boolean | null
          is_duration_pr: boolean | null
          is_e1rm_pr: boolean | null
          is_reps_pr: boolean | null
          is_volume_pr: boolean | null
          is_weight_pr: boolean | null
          kind: Database['public']['Enums']['workout_set_kind'] | null
          position: number | null
          reps: number | null
          rpe: number | null
          started_at: string | null
          user_id: string | null
          volume_kg: number | null
          weight_kg: number | null
          workout_exercise_id: string | null
          workout_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'workout_sets_exercise_fkey'
            columns: ['workout_exercise_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_set_values: {
        Row: {
          counts: boolean | null
          distance_m: number | null
          duration_s: number | null
          e1rm_kg: number | null
          exercise_id: string | null
          exercise_name: string | null
          exercise_position: number | null
          id: string | null
          kind: Database['public']['Enums']['workout_set_kind'] | null
          load_kg: number | null
          log_date: string | null
          position: number | null
          reps: number | null
          rpe: number | null
          started_at: string | null
          tracking: Database['public']['Enums']['exercise_tracking'] | null
          user_id: string | null
          volume_kg: number | null
          weight_counts: boolean | null
          weight_kg: number | null
          workout_exercise_id: string | null
          workout_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'workout_sets_exercise_fkey'
            columns: ['workout_exercise_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      workout_summaries: {
        Row: {
          created_at: string | null
          duration_s: number | null
          ended_at: string | null
          exercises: Json | null
          health_workout_id: string | null
          id: string | null
          kcal: number | null
          log_date: string | null
          name: string | null
          notes: string | null
          pr_count: number | null
          routine_id: string | null
          set_count: number | null
          started_at: string | null
          updated_at: string | null
          user_id: string | null
          volume_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'workouts_routine_fkey'
            columns: ['routine_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'workout_routines'
            referencedColumns: ['id', 'user_id']
          },
        ]
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
      create_group: {
        Args: {
          p_icon_name: string
          p_icon_path?: string
          p_is_public: boolean
          p_name: string
        }
        Returns: string
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
        }
        Returns: string
      }
      create_social_workout_post: {
        Args: {
          p_audience: Database['public']['Enums']['social_audience']
          p_caption: string
          p_workout_id: string
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
      delete_group_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      delete_social_comment: { Args: { p_id: string }; Returns: undefined }
      delete_social_post: { Args: { p_id: string }; Returns: undefined }
      exercise_bests: {
        Args: { p_exercise_id?: string }
        Returns: {
          best_distance_m: number
          best_duration_s: number
          best_e1rm_kg: number
          best_reps: number
          best_session_volume_kg: number
          best_set_volume_kg: number
          best_weight_kg: number
          best_weight_reps: number
          exercise_id: string
          exercise_name: string
          last_at: string
          total_volume_kg: number
          tracking: Database['public']['Enums']['exercise_tracking']
          workouts: number
        }[]
      }
      exercise_history: {
        Args: { p_exercise_id: string; p_limit?: number }
        Returns: {
          best_e1rm_kg: number
          best_weight_kg: number
          distance_m: number
          duration_s: number
          sets: Json
          started_at: string
          volume_kg: number
          workout_id: string
          workout_name: string
        }[]
      }
      exercise_last_sets: {
        Args: { p_exercise_ids: string[] }
        Returns: {
          distance_m: number
          duration_s: number
          exercise_id: string
          kind: Database['public']['Enums']['workout_set_kind']
          reps: number
          weight_kg: number
        }[]
      }
      exercise_rep_bests: {
        Args: { p_exercise_id: string }
        Returns: {
          reps: number
          started_at: string
          weight_kg: number
        }[]
      }
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
      fold_plate_quantity: {
        Args: { p_food_log_id: string }
        Returns: undefined
      }
      forget_push_tokens: { Args: { p_tokens: string[] }; Returns: undefined }
      free_daily_scans: { Args: never; Returns: number }
      free_group_icons: { Args: never; Returns: string[] }
      free_group_limit: { Args: never; Returns: number }
      free_photo_retention_days: { Args: never; Returns: number }
      free_recipe_limit: { Args: never; Returns: number }
      free_routine_limit: { Args: never; Returns: number }
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
      group_board: {
        Args: { p_day: string; p_group_id: string }
        Returns: Json
      }
      group_chat_summary: { Args: { p_group_id: string }; Returns: Json }
      group_details: { Args: { p_group_id: string }; Returns: Json }
      group_invite_count: { Args: never; Returns: number }
      group_invite_suggestions: {
        Args: { p_group_id: string; p_limit?: number }
        Returns: Json
      }
      group_message_push_targets: {
        Args: { p_caller: string; p_id: string }
        Returns: {
          actor_name: string
          body: string
          group_id: string
          group_name: string
          language: string
          token: string
        }[]
      }
      group_messages: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_group_id: string
          p_limit?: number
        }
        Returns: Json
      }
      group_push_targets: {
        Args: { p_caller: string; p_id: string; p_kind: string }
        Returns: {
          actor_name: string
          day: string
          group_id: string
          group_name: string
          language: string
          meal: Database['public']['Enums']['group_meal']
          token: string
        }[]
      }
      group_workout_detail: {
        Args: { p_group_id: string; p_id: string; p_source: string }
        Returns: Json
      }
      gtin14: { Args: { code: string }; Returns: string }
      has_account_password: { Args: never; Returns: boolean }
      invite_to_group: {
        Args: { p_group_id: string; p_target: string }
        Returns: string
      }
      is_entitled: { Args: { p_user: string }; Returns: boolean }
      join_group: { Args: { p_group_id: string }; Returns: undefined }
      lapsed_photo_grace_days: { Args: never; Returns: number }
      leave_group: {
        Args: { p_group_id: string; p_new_leader?: string }
        Returns: undefined
      }
      local_today: { Args: { p_user_id?: string }; Returns: string }
      logging_streak: {
        Args: { p_user_id?: string }
        Returns: {
          best_days: number
          current_days: number
        }[]
      }
      mark_group_chat_read: { Args: { p_group_id: string }; Returns: undefined }
      mark_social_notifications_read: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      mark_social_notifications_seen: {
        Args: { p_through: string }
        Returns: undefined
      }
      my_group_invites: { Args: never; Returns: Json }
      my_groups: { Args: never; Returns: Json }
      nudge_group_member: {
        Args: {
          p_day: string
          p_group_id: string
          p_meal: Database['public']['Enums']['group_meal']
          p_target_id: string
        }
        Returns: string
      }
      photo_removal_push_targets: {
        Args: { p_after?: string; p_days?: number; p_limit?: number }
        Returns: {
          language: string
          photo_count: number
          removes_by: string
          timezone: string
          token: string
          user_id: string
        }[]
      }
      photo_removal_schedule: {
        Args: { p_until: string; p_user: string }
        Returns: {
          id: string
          item_name: string
          log_date: string
          photo_path: string
          removes_at: string
        }[]
      }
      pro_daily_scans: { Args: never; Returns: number }
      prune_activity_hours: {
        Args: { p_asof?: string; p_limit?: number }
        Returns: Json
      }
      public_groups: {
        Args: { p_limit?: number; p_query?: string }
        Returns: Json
      }
      recipe_mark_for_review: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      recipe_review_hourly_limit: { Args: never; Returns: number }
      record_social_photo_etags: { Args: { p_etags: Json }; Returns: number }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      remove_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_ingredient: {
        Args: { p_ingredient_id: string }
        Returns: undefined
      }
      remove_social_follower: {
        Args: { p_follower_id: string }
        Returns: undefined
      }
      replace_activity_hours: {
        Args: {
          p_from: string
          p_hours?: Json
          p_to: string
          p_user_id?: string
        }
        Returns: number
      }
      report_group: { Args: { p_group_id: string }; Returns: undefined }
      report_group_message: {
        Args: { p_message_id: string }
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
      respond_to_group_invite: {
        Args: { p_accept: boolean; p_group_id: string }
        Returns: string
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
      save_workout: { Args: { p_workout: Json }; Returns: string }
      save_workout_heart_rate: { Args: { p_trace: Json }; Returns: string }
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
      see_announcements: {
        Args: { p_auto_post_foods?: boolean; p_ids: string[] }
        Returns: {
          activity_level: Database['public']['Enums']['activity_level']
          auto_post_foods: boolean
          auto_post_workouts: boolean
          avatar_path: string | null
          bio: string
          birth_date: string | null
          created_at: string
          display_name: string
          food_styles: string[]
          handle: string | null
          height_cm: number | null
          id: string
          is_private: boolean
          onboarded_at: string | null
          photo_etag: string | null
          quarantined: boolean
          referral_source: string | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review']
          revision: number
          seen_announcements: string[]
          sex: Database['public']['Enums']['sex'] | null
          social_joined_at: string | null
          target_weight_kg: number | null
          timezone: string
          updated_at: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'profiles'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send_group_message: {
        Args: {
          p_activity_id?: string
          p_body: string
          p_group_id: string
          p_post_id?: string
          p_reply_to?: string
          p_request_id: string
          p_workout_id?: string
        }
        Returns: string
      }
      set_entry_board_meal: {
        Args: {
          p_entry_id: string
          p_meal: Database['public']['Enums']['group_meal']
        }
        Returns: undefined
      }
      set_group_message_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: undefined
      }
      set_group_preferences: {
        Args: { p_board_order: string[]; p_group_id: string; p_notify: boolean }
        Returns: undefined
      }
      set_group_reaction: {
        Args: { p_entry_id: string; p_value: number }
        Returns: undefined
      }
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
          p_kinds?: Database['public']['Enums']['social_post_kind'][]
          p_limit?: number
          p_mode?: string
        }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          author_is_pro: boolean | null
          avatar_path: string | null
          caption: string | null
          carbs_g: number | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          fat_g: number | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          kcal: number | null
          kind: Database['public']['Enums']['social_post_kind'] | null
          like_count: number | null
          photo_path: string | null
          protein_g: number | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          workout_duration_s: number | null
          workout_exercises: Json | null
          workout_name: string | null
          workout_records: number | null
          workout_sets: number | null
          workout_started_at: string | null
          workout_volume_kg: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'social_post_details'
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
        Args: {
          p_id: string
          p_kinds?: Database['public']['Enums']['social_post_kind'][]
        }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          author_is_pro: boolean | null
          avatar_path: string | null
          caption: string | null
          carbs_g: number | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          fat_g: number | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          kcal: number | null
          kind: Database['public']['Enums']['social_post_kind'] | null
          like_count: number | null
          photo_path: string | null
          protein_g: number | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          workout_duration_s: number | null
          workout_exercises: Json | null
          workout_name: string | null
          workout_records: number | null
          workout_sets: number | null
          workout_started_at: string | null
          workout_volume_kg: number | null
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
          is_pro: boolean | null
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
          p_kinds?: Database['public']['Enums']['social_post_kind'][]
          p_limit?: number
          p_user_id: string
        }
        Returns: {
          audience: Database['public']['Enums']['social_audience'] | null
          author_id: string | null
          author_is_pro: boolean | null
          avatar_path: string | null
          caption: string | null
          carbs_g: number | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          fat_g: number | null
          food_name: string | null
          handle: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          is_following: boolean | null
          is_liked: boolean | null
          kcal: number | null
          kind: Database['public']['Enums']['social_post_kind'] | null
          like_count: number | null
          photo_path: string | null
          protein_g: number | null
          published_at: string | null
          quarantined: boolean | null
          review_reason: string | null
          review_status: Database['public']['Enums']['recipe_review'] | null
          revision: number | null
          workout_duration_s: number | null
          workout_exercises: Json | null
          workout_name: string | null
          workout_records: number | null
          workout_sets: number | null
          workout_started_at: string | null
          workout_volume_kg: number | null
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
          is_pro: boolean | null
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
          is_pro: boolean | null
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
      social_workout_count: { Args: { p_user_id: string }; Returns: number }
      social_workout_post: { Args: { p_workout_id: string }; Returns: string }
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
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      upcoming_photo_removals: {
        Args: { p_days?: number }
        Returns: {
          id: string
          item_name: string
          log_date: string
          photo_path: string
          removes_at: string
        }[]
      }
      update_group: {
        Args: {
          p_group_id: string
          p_icon_name: string
          p_icon_path?: string
          p_is_public: boolean
          p_name: string
        }
        Returns: undefined
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
      workout_exercise_totals: {
        Args: { p_from: string; p_to: string }
        Returns: {
          exercise_id: string
          sets: number
        }[]
      }
      workout_history: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          created_at: string | null
          duration_s: number | null
          ended_at: string | null
          exercises: Json | null
          health_workout_id: string | null
          id: string | null
          kcal: number | null
          log_date: string | null
          name: string | null
          notes: string | null
          pr_count: number | null
          routine_id: string | null
          set_count: number | null
          started_at: string | null
          updated_at: string | null
          user_id: string | null
          volume_kg: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'workout_summaries'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workout_months: {
        Args: { p_months?: number }
        Returns: {
          duration_s: number
          month: string
          sets: number
          volume_kg: number
          workouts: number
        }[]
      }
      workout_overview: {
        Args: never
        Returns: {
          this_week_seconds: number
          this_week_volume_kg: number
          this_week_workouts: number
          total_workouts: number
          week_streak: number
        }[]
      }
      workout_weeks: {
        Args: { p_weeks?: number }
        Returns: {
          duration_s: number
          sets: number
          volume_kg: number
          week: string
          workouts: number
        }[]
      }
    }
    Enums: {
      activity_level: 'sedentary' | 'light' | 'on_feet' | 'very_active'
      energy_unit: 'kcal' | 'kj'
      entry_source: 'search' | 'quick_add' | 'camera' | 'voice' | 'import' | 'text'
      exercise_tracking:
        | 'weight_reps'
        | 'reps'
        | 'weighted_reps'
        | 'assisted_reps'
        | 'duration'
        | 'distance_duration'
        | 'weight_distance'
      food_place: 'mamak' | 'kopitiam' | 'hawker' | 'packaged' | 'home'
      group_meal: 'breakfast' | 'lunch' | 'dinner'
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
      social_post_kind: 'food' | 'workout'
      subscription_plan: 'monthly' | 'yearly' | 'lifetime'
      subscription_status: 'none' | 'trial' | 'active' | 'expired' | 'billing_retry'
      unit_system: 'metric' | 'imperial'
      workout_set_kind: 'normal' | 'warmup' | 'drop' | 'failure'
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
      exercise_tracking: [
        'weight_reps',
        'reps',
        'weighted_reps',
        'assisted_reps',
        'duration',
        'distance_duration',
        'weight_distance',
      ],
      food_place: ['mamak', 'kopitiam', 'hawker', 'packaged', 'home'],
      group_meal: ['breakfast', 'lunch', 'dinner'],
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
      social_post_kind: ['food', 'workout'],
      subscription_plan: ['monthly', 'yearly', 'lifetime'],
      subscription_status: ['none', 'trial', 'active', 'expired', 'billing_retry'],
      unit_system: ['metric', 'imperial'],
      workout_set_kind: ['normal', 'warmup', 'drop', 'failure'],
    },
  },
} as const
