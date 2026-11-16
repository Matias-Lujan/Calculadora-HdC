export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
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
      foods: {
        Row: {
          archived_at: string | null
          brand: string | null
          carbs_per_100g: number
          cooking_factor: number | null
          created_at: string
          id: string
          label_transcription: Json | null
          name: string
          notes: string | null
          photo_path: string | null
          reference_code: string | null
          reference_db: string | null
          reference_description: string | null
          source: string
          state: string
          unit_label: string | null
          unit_weight_g: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          brand?: string | null
          carbs_per_100g: number
          cooking_factor?: number | null
          created_at?: string
          id?: string
          label_transcription?: Json | null
          name: string
          notes?: string | null
          photo_path?: string | null
          reference_code?: string | null
          reference_db?: string | null
          reference_description?: string | null
          source: string
          state: string
          unit_label?: string | null
          unit_weight_g?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          brand?: string | null
          carbs_per_100g?: number
          cooking_factor?: number | null
          created_at?: string
          id?: string
          label_transcription?: Json | null
          name?: string
          notes?: string | null
          photo_path?: string | null
          reference_code?: string | null
          reference_db?: string | null
          reference_description?: string | null
          source?: string
          state?: string
          unit_label?: string | null
          unit_weight_g?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_items: {
        Row: {
          carbs_g: number
          carbs_per_100g: number
          cooking_factor: number | null
          effective_carbs_per_100g: number
          food_brand: string | null
          food_id: string
          food_name: string
          food_source: string
          food_state: string
          grams: number
          id: string
          meal_id: string
          position: number
          quantity_mode: string
          unit_weight_g: number | null
          units: number | null
          user_id: string
        }
        Insert: {
          carbs_g: number
          carbs_per_100g: number
          cooking_factor?: number | null
          effective_carbs_per_100g: number
          food_brand?: string | null
          food_id: string
          food_name: string
          food_source: string
          food_state: string
          grams: number
          id?: string
          meal_id: string
          position: number
          quantity_mode: string
          unit_weight_g?: number | null
          units?: number | null
          user_id?: string
        }
        Update: {
          carbs_g?: number
          carbs_per_100g?: number
          cooking_factor?: number | null
          effective_carbs_per_100g?: number
          food_brand?: string | null
          food_id?: string
          food_name?: string
          food_source?: string
          food_state?: string
          grams?: number
          id?: string
          meal_id?: string
          position?: number
          quantity_mode?: string
          unit_weight_g?: number | null
          units?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_user_id_fkey"
            columns: ["food_id", "user_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_user_id_fkey"
            columns: ["meal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      meals: {
        Row: {
          applied_dose_units: number | null
          calc_version: string
          calculated_dose_units: number
          carb_ratio_g_per_unit: number
          created_at: string
          deleted_at: string | null
          eaten_at: string
          id: string
          notes: string | null
          total_carbs_g: number
          user_id: string
        }
        Insert: {
          applied_dose_units?: number | null
          calc_version: string
          calculated_dose_units: number
          carb_ratio_g_per_unit: number
          created_at?: string
          deleted_at?: string | null
          eaten_at: string
          id?: string
          notes?: string | null
          total_carbs_g: number
          user_id?: string
        }
        Update: {
          applied_dose_units?: number | null
          calc_version?: string
          calculated_dose_units?: number
          carb_ratio_g_per_unit?: number
          created_at?: string
          deleted_at?: string | null
          eaten_at?: string
          id?: string
          notes?: string | null
          total_carbs_g?: number
          user_id?: string
        }
        Relationships: []
      }
      reference_foods: {
        Row: {
          carbs_per_100g: number
          description_original: string
          fiber_per_100g: number
          id: string
          name_es: string
          reference_code: string
          reference_db: string
          state: string
          total_carbs_per_100g: number
        }
        Insert: {
          carbs_per_100g: number
          description_original: string
          fiber_per_100g: number
          id?: string
          name_es: string
          reference_code: string
          reference_db: string
          state: string
          total_carbs_per_100g: number
        }
        Update: {
          carbs_per_100g?: number
          description_original?: string
          fiber_per_100g?: number
          id?: string
          name_es?: string
          reference_code?: string
          reference_db?: string
          state?: string
          total_carbs_per_100g?: number
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          carb_ratio_g_per_unit: number
          max_dose_warning_units: number | null
          max_item_grams_warning: number
          updated_at: string
          user_id: string
        }
        Insert: {
          carb_ratio_g_per_unit?: number
          max_dose_warning_units?: number | null
          max_item_grams_warning?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          carb_ratio_g_per_unit?: number
          max_dose_warning_units?: number | null
          max_item_grams_warning?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vision_requests: {
        Row: {
          created_at: string
          id: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          status: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: never
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_meal: { Args: { payload: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
