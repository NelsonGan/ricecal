/**
 * GENERATED FILE — do not edit.
 *
 *   pnpm db:types
 *
 * which runs `supabase gen types typescript --local` against the local stack,
 * so the local database must be up to date: `pnpm db:reset` first if you have
 * just pulled a migration. Nothing in CI checks this file against the schema,
 * so a stale copy shows up as a type error on a column that plainly exists.
 *
 * Postgres enums arrive as string-literal unions, which is the reason the
 * schema uses enums for its closed domains — `Database['public']['Enums']['meal']`
 * is exactly the `Meal` union the screens already speak.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
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
      archetypes: {
        Row: {
          carbs_g: number
          fat_g: number
          id: string
          kcal: number
          name: string
          protein_g: number
          slug: string
        }
        Insert: {
          carbs_g: number
          fat_g: number
          id?: string
          kcal: number
          name: string
          protein_g: number
          slug: string
        }
        Update: {
          carbs_g?: number
          fat_g?: number
          id?: string
          kcal?: number
          name?: string
          protein_g?: number
          slug?: string
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
          water_glasses: number
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
          water_glasses?: number
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
          water_glasses?: number
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
          water_glasses: number
        }
        Insert: {
          created_at?: string
          log_date: string
          note?: string | null
          updated_at?: string
          user_id: string
          water_glasses?: number
        }
        Update: {
          created_at?: string
          log_date?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          water_glasses?: number
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
          water_glasses: number | null
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
      barcode_hourly_limit: { Args: never; Returns: number }
      claim_barcode_scan: {
        Args: { p_user: string }
        Returns: {
          allowed: boolean
          hourly_limit: number
          used: number
        }[]
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
      expired_meal_photos: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          photo_path: string
        }[]
      }
      free_daily_scans: { Args: never; Returns: number }
      free_photo_retention_days: { Args: never; Returns: number }
      free_recipe_limit: { Args: never; Returns: number }
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
          water_glasses: number
        }
        SetofOptions: {
          from: '*'
          to: 'daily_goals'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gtin14: { Args: { code: string }; Returns: string }
      is_entitled: { Args: { p_user: string }; Returns: boolean }
      local_today: { Args: { p_user_id?: string }; Returns: string }
      logging_streak: {
        Args: { p_user_id?: string }
        Returns: {
          best_days: number
          current_days: number
        }[]
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
          water_glasses: number
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
      seed_archetype_foods: { Args: never; Returns: undefined }
      set_ingredient_quantity: {
        Args: { p_ingredient_id: string; p_quantity: number }
        Returns: undefined
      }
      set_recipe_public: {
        Args: { p_public: boolean; p_recipe_id: string }
        Returns: Database['public']['Enums']['recipe_review']
      }
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
          water_glasses: number
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
      sex: 'female' | 'male'
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
      sex: ['female', 'male'],
      subscription_plan: ['monthly', 'yearly', 'lifetime'],
      subscription_status: ['none', 'trial', 'active', 'expired', 'billing_retry'],
      unit_system: ['metric', 'imperial'],
    },
  },
} as const
