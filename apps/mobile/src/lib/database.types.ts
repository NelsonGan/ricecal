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
      achievements: {
        Row: {
          created_at: string
          icon_name: string
          icon_set: Database['public']['Enums']['icon_set']
          key: string
          position: number
          tone: Database['public']['Enums']['badge_tone']
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_name: string
          icon_set?: Database['public']['Enums']['icon_set']
          key: string
          position?: number
          tone?: Database['public']['Enums']['badge_tone']
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_name?: string
          icon_set?: Database['public']['Enums']['icon_set']
          key?: string
          position?: number
          tone?: Database['public']['Enums']['badge_tone']
          updated_at?: string
        }
        Relationships: []
      }
      daily_activity: {
        Row: {
          created_at: string
          exercise_goal_minutes: number | null
          exercise_minutes: number
          log_date: string
          move_goal_kcal: number | null
          move_kcal: number
          source: Database['public']['Enums']['measurement_source']
          stand_goal_hours: number | null
          stand_hours: number
          steps: number
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_goal_minutes?: number | null
          exercise_minutes?: number
          log_date: string
          move_goal_kcal?: number | null
          move_kcal?: number
          source?: Database['public']['Enums']['measurement_source']
          stand_goal_hours?: number | null
          stand_hours?: number
          steps?: number
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_goal_minutes?: number | null
          exercise_minutes?: number
          log_date?: string
          move_goal_kcal?: number | null
          move_kcal?: number
          source?: Database['public']['Enums']['measurement_source']
          stand_goal_hours?: number | null
          stand_hours?: number
          steps?: number
          synced_at?: string
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
          steps: number
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
          steps?: number
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
          steps?: number
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
      food_logs: {
        Row: {
          created_at: string
          food_id: string
          id: string
          log_date: string
          logged_at: string
          meal: Database['public']['Enums']['meal']
          note: string | null
          photo_path: string | null
          quantity: number
          serving_id: string
          source: Database['public']['Enums']['entry_source']
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          log_date?: string
          logged_at?: string
          meal: Database['public']['Enums']['meal']
          note?: string | null
          photo_path?: string | null
          quantity?: number
          serving_id: string
          source?: Database['public']['Enums']['entry_source']
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          log_date?: string
          logged_at?: string
          meal?: Database['public']['Enums']['meal']
          note?: string | null
          photo_path?: string | null
          quantity?: number
          serving_id?: string
          source?: Database['public']['Enums']['entry_source']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'food_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'foods'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_logs_food_serving_fkey'
            columns: ['food_id', 'serving_id']
            isOneToOne: false
            referencedRelation: 'food_servings'
            referencedColumns: ['food_id', 'id']
          },
        ]
      }
      food_servings: {
        Row: {
          created_at: string
          factor: number
          food_id: string
          id: string
          is_default: boolean
          label: string
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          factor: number
          food_id: string
          id?: string
          is_default?: boolean
          label: string
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          factor?: number
          food_id?: string
          id?: string
          is_default?: boolean
          label?: string
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_servings_food_id_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'food_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_servings_food_id_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'foods'
            referencedColumns: ['id']
          },
        ]
      }
      foods: {
        Row: {
          brand: string | null
          carbs_g: number
          created_at: string
          fat_g: number
          fibre_g: number | null
          icon_name: string
          icon_set: Database['public']['Enums']['icon_set']
          id: string
          kcal: number
          name: string
          owner_id: string | null
          place: Database['public']['Enums']['food_place']
          protein_g: number
          slug: string | null
          sodium_mg: number | null
          source: string | null
          sugar_g: number | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          brand?: string | null
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fibre_g?: number | null
          icon_name: string
          icon_set?: Database['public']['Enums']['icon_set']
          id?: string
          kcal: number
          name: string
          owner_id?: string | null
          place?: Database['public']['Enums']['food_place']
          protein_g?: number
          slug?: string | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          brand?: string | null
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fibre_g?: number | null
          icon_name?: string
          icon_set?: Database['public']['Enums']['icon_set']
          id?: string
          kcal?: number
          name?: string
          owner_id?: string | null
          place?: Database['public']['Enums']['food_place']
          protein_g?: number
          slug?: string | null
          sodium_mg?: number | null
          source?: string | null
          sugar_g?: number | null
          updated_at?: string
          verified?: boolean
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
          weight_goal: Database['public']['Enums']['weight_goal']
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
          weight_goal?: Database['public']['Enums']['weight_goal']
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
          weight_goal?: Database['public']['Enums']['weight_goal']
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
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
      user_achievements: {
        Row: {
          achievement_key: string
          detail: string | null
          earned_at: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          detail?: string | null
          earned_at?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          detail?: string | null
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_achievements_achievement_key_fkey'
            columns: ['achievement_key']
            isOneToOne: false
            referencedRelation: 'achievements'
            referencedColumns: ['key']
          },
        ]
      }
      user_settings: {
        Row: {
          anonymous_food_data: boolean
          auto_sync: boolean
          connect_phone_health: boolean
          connect_running_app: boolean
          connect_smart_scale: boolean
          connect_watch: boolean
          created_at: string
          energy: Database['public']['Enums']['energy_unit']
          language: string
          notify_water: boolean
          notify_weekly_report: boolean
          notify_weigh_in: boolean
          quiet_from: string
          quiet_to: string
          share_with_family: boolean
          units: Database['public']['Enums']['unit_system']
          updated_at: string
          user_id: string
          wifi_only: boolean
        }
        Insert: {
          anonymous_food_data?: boolean
          auto_sync?: boolean
          connect_phone_health?: boolean
          connect_running_app?: boolean
          connect_smart_scale?: boolean
          connect_watch?: boolean
          created_at?: string
          energy?: Database['public']['Enums']['energy_unit']
          language?: string
          notify_water?: boolean
          notify_weekly_report?: boolean
          notify_weigh_in?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id: string
          wifi_only?: boolean
        }
        Update: {
          anonymous_food_data?: boolean
          auto_sync?: boolean
          connect_phone_health?: boolean
          connect_running_app?: boolean
          connect_smart_scale?: boolean
          connect_watch?: boolean
          created_at?: string
          energy?: Database['public']['Enums']['energy_unit']
          language?: string
          notify_water?: boolean
          notify_weekly_report?: boolean
          notify_weigh_in?: boolean
          quiet_from?: string
          quiet_to?: string
          share_with_family?: boolean
          units?: Database['public']['Enums']['unit_system']
          updated_at?: string
          user_id?: string
          wifi_only?: boolean
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          measured_on: string
          source: Database['public']['Enums']['measurement_source']
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          measured_on: string
          source?: Database['public']['Enums']['measurement_source']
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          body_fat_pct?: number | null
          created_at?: string
          measured_on?: string
          source?: Database['public']['Enums']['measurement_source']
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workouts: {
        Row: {
          avg_hr: number | null
          created_at: string
          distance_km: number | null
          duration_min: number
          elevation_m: number | null
          external_id: string | null
          id: string
          kcal: number
          kind: Database['public']['Enums']['session_kind']
          log_date: string
          source: Database['public']['Enums']['measurement_source']
          split_seconds: number[] | null
          started_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_hr?: number | null
          created_at?: string
          distance_km?: number | null
          duration_min: number
          elevation_m?: number | null
          external_id?: string | null
          id?: string
          kcal?: number
          kind?: Database['public']['Enums']['session_kind']
          log_date?: string
          source?: Database['public']['Enums']['measurement_source']
          split_seconds?: number[] | null
          started_at: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_hr?: number | null
          created_at?: string
          distance_km?: number | null
          duration_min?: number
          elevation_m?: number | null
          external_id?: string | null
          id?: string
          kcal?: number
          kind?: Database['public']['Enums']['session_kind']
          log_date?: string
          source?: Database['public']['Enums']['measurement_source']
          split_seconds?: number[] | null
          started_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
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
          steps: number | null
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
      food_details: {
        Row: {
          brand: string | null
          carbs_g: number | null
          default_serving_id: string | null
          fat_g: number | null
          fibre_g: number | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          kcal: number | null
          name: string | null
          owner_id: string | null
          place: Database['public']['Enums']['food_place'] | null
          protein_g: number | null
          serving_label: string | null
          servings: Json | null
          slug: string | null
          sodium_mg: number | null
          sugar_g: number | null
          verified: boolean | null
        }
        Relationships: []
      }
      food_log_details: {
        Row: {
          carbs_g: number | null
          fat_g: number | null
          fibre_g: number | null
          food_brand: string | null
          food_id: string | null
          food_name: string | null
          icon_name: string | null
          icon_set: Database['public']['Enums']['icon_set'] | null
          id: string | null
          kcal: number | null
          log_date: string | null
          logged_at: string | null
          meal: Database['public']['Enums']['meal'] | null
          note: string | null
          photo_path: string | null
          place: Database['public']['Enums']['food_place'] | null
          protein_g: number | null
          quantity: number | null
          serving_factor: number | null
          serving_id: string | null
          serving_label: string | null
          source: Database['public']['Enums']['entry_source'] | null
          sugar_g: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'food_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'foods'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_logs_food_serving_fkey'
            columns: ['food_id', 'serving_id']
            isOneToOne: false
            referencedRelation: 'food_servings'
            referencedColumns: ['food_id', 'id']
          },
        ]
      }
      user_food_stats: {
        Row: {
          food_id: string | null
          last_logged_at: string | null
          meals: Database['public']['Enums']['meal'][] | null
          times_logged: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'food_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_logs_food_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'foods'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      compute_targets: {
        Args: {
          p_activity: Database['public']['Enums']['activity_level']
          p_birth_date: string
          p_goal: Database['public']['Enums']['weight_goal']
          p_height_cm: number
          p_sex: Database['public']['Enums']['sex']
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
          steps: number
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
      local_today: { Args: { p_user_id?: string }; Returns: string }
      logging_streak: {
        Args: { p_user_id?: string }
        Returns: {
          best_days: number
          current_days: number
        }[]
      }
    }
    Enums: {
      activity_level: 'sedentary' | 'light' | 'on_feet' | 'very_active'
      badge_tone: 'pandan' | 'hibiscus' | 'water' | 'kaya'
      energy_unit: 'kcal' | 'kj'
      entry_source: 'search' | 'quick_add' | 'camera' | 'voice' | 'barcode' | 'import'
      food_place: 'mamak' | 'kopitiam' | 'hawker' | 'packaged' | 'home'
      icon_set: 'body' | 'dishes' | 'food' | 'system' | 'ui'
      meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
      measurement_source: 'manual' | 'healthkit' | 'health_connect' | 'smart_scale' | 'import'
      session_kind: 'run' | 'badminton' | 'gym' | 'walk' | 'cycle' | 'swim' | 'other'
      sex: 'female' | 'male'
      subscription_plan: 'monthly' | 'yearly'
      subscription_status: 'none' | 'trial' | 'active' | 'expired' | 'billing_retry'
      unit_system: 'metric' | 'imperial'
      weight_goal: 'lose' | 'maintain' | 'gain' | 'track'
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
      badge_tone: ['pandan', 'hibiscus', 'water', 'kaya'],
      energy_unit: ['kcal', 'kj'],
      entry_source: ['search', 'quick_add', 'camera', 'voice', 'barcode', 'import'],
      food_place: ['mamak', 'kopitiam', 'hawker', 'packaged', 'home'],
      icon_set: ['body', 'dishes', 'food', 'system', 'ui'],
      meal: ['breakfast', 'lunch', 'dinner', 'snack'],
      measurement_source: ['manual', 'healthkit', 'health_connect', 'smart_scale', 'import'],
      session_kind: ['run', 'badminton', 'gym', 'walk', 'cycle', 'swim', 'other'],
      sex: ['female', 'male'],
      subscription_plan: ['monthly', 'yearly'],
      subscription_status: ['none', 'trial', 'active', 'expired', 'billing_retry'],
      unit_system: ['metric', 'imperial'],
      weight_goal: ['lose', 'maintain', 'gain', 'track'],
    },
  },
} as const
