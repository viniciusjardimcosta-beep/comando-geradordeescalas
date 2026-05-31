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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      billing_events: {
        Row: {
          created_at: string
          customer_email: string | null
          error_message: string | null
          event_id: string | null
          event_type: string | null
          external_id: string | null
          headers: Json
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          signature: string | null
          source_ip: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string | null
          external_id?: string | null
          headers?: Json
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          signature?: string | null
          source_ip?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string | null
          external_id?: string | null
          headers?: Json
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          signature?: string | null
          source_ip?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      escala_ordinaria_membros: {
        Row: {
          created_at: string
          escala_id: string
          id: string
          militar_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          escala_id: string
          id?: string
          militar_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          escala_id?: string
          id?: string
          militar_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_ordinaria_membros_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas_ordinarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_ordinaria_membros_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_geradas: {
        Row: {
          alertas: Json
          ano: number
          arquivo_nome: string | null
          arquivo_saida_path: string | null
          created_at: string
          diretrizes: string | null
          exportacoes: Json
          id: string
          mes: number
          observacoes_texto: string | null
          parametros: Json
          status: string
          user_id: string
        }
        Insert: {
          alertas?: Json
          ano: number
          arquivo_nome?: string | null
          arquivo_saida_path?: string | null
          created_at?: string
          diretrizes?: string | null
          exportacoes?: Json
          id?: string
          mes: number
          observacoes_texto?: string | null
          parametros?: Json
          status?: string
          user_id: string
        }
        Update: {
          alertas?: Json
          ano?: number
          arquivo_nome?: string | null
          arquivo_saida_path?: string | null
          created_at?: string
          diretrizes?: string | null
          exportacoes?: Json
          id?: string
          mes?: number
          observacoes_texto?: string | null
          parametros?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      escalas_ordinarias: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          nome: string
          ordem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          nome?: string
          ordem: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ferias_militares: {
        Row: {
          ano: number
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          militar_id: string
          periodo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano: number
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          militar_id: string
          periodo: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: number
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          militar_id?: string
          periodo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_militares_militar_id_fkey"
            columns: ["militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      militares: {
        Row: {
          ativo: boolean
          created_at: string
          funcao: Database["public"]["Enums"]["funcao_militar"] | null
          id: string
          is_adm: boolean
          is_cg: boolean
          is_cov: boolean
          matricula: string | null
          matricula_norm: string | null
          nome: string
          observacoes: string | null
          posto_graduacao: string | null
          tipo_escala: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          funcao?: Database["public"]["Enums"]["funcao_militar"] | null
          id?: string
          is_adm?: boolean
          is_cg?: boolean
          is_cov?: boolean
          matricula?: string | null
          matricula_norm?: string | null
          nome: string
          observacoes?: string | null
          posto_graduacao?: string | null
          tipo_escala?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          funcao?: Database["public"]["Enums"]["funcao_militar"] | null
          id?: string
          is_adm?: boolean
          is_cg?: boolean
          is_cov?: boolean
          matricula?: string | null
          matricula_norm?: string | null
          nome?: string
          observacoes?: string | null
          posto_graduacao?: string | null
          tipo_escala?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nexano_subscriptions: {
        Row: {
          created_at: string
          customer_cpf: string | null
          customer_email: string
          customer_name: string | null
          customer_phone: string | null
          end_at: string | null
          id: string
          interval_count: number | null
          interval_type: string | null
          last_billing_event_id: string | null
          last_event_type: string | null
          last_transaction_id: string | null
          last_transaction_identifier: string | null
          offer_code: string | null
          product_external_id: string | null
          product_id: string | null
          product_name: string | null
          start_at: string | null
          subscription_external_id: string | null
          subscription_identifier: string
          subscription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_cpf?: string | null
          customer_email: string
          customer_name?: string | null
          customer_phone?: string | null
          end_at?: string | null
          id?: string
          interval_count?: number | null
          interval_type?: string | null
          last_billing_event_id?: string | null
          last_event_type?: string | null
          last_transaction_id?: string | null
          last_transaction_identifier?: string | null
          offer_code?: string | null
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string | null
          start_at?: string | null
          subscription_external_id?: string | null
          subscription_identifier: string
          subscription_status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string
          customer_name?: string | null
          customer_phone?: string | null
          end_at?: string | null
          id?: string
          interval_count?: number | null
          interval_type?: string | null
          last_billing_event_id?: string | null
          last_event_type?: string | null
          last_transaction_id?: string | null
          last_transaction_identifier?: string | null
          offer_code?: string | null
          product_external_id?: string | null
          product_id?: string | null
          product_name?: string | null
          start_at?: string | null
          subscription_external_id?: string | null
          subscription_identifier?: string
          subscription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          id: string
          nome: string | null
          password_temporary: boolean
          plan_type: Database["public"]["Enums"]["plan_type"]
          plano_nome: string | null
          status: Database["public"]["Enums"]["user_status"]
          subscription_end_date: string | null
          subscription_identifier: string | null
          subscription_provider: string | null
          subscription_start_date: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          telefone: string | null
          trial_end_date: string | null
          trial_start_date: string | null
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          id: string
          nome?: string | null
          password_temporary?: boolean
          plan_type?: Database["public"]["Enums"]["plan_type"]
          plano_nome?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          subscription_end_date?: string | null
          subscription_identifier?: string | null
          subscription_provider?: string | null
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          telefone?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          password_temporary?: boolean
          plan_type?: Database["public"]["Enums"]["plan_type"]
          plano_nome?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          subscription_end_date?: string | null
          subscription_identifier?: string | null
          subscription_provider?: string | null
          subscription_start_date?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          telefone?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_status: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["user_status"]
      }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      funcao_militar: "COV" | "CG"
      plan_type: "trial" | "mensal" | "semestral" | "anual"
      subscription_status:
        | "trial"
        | "active"
        | "expired"
        | "canceled"
        | "refunded"
      user_status: "pendente" | "aprovado" | "bloqueado"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      funcao_militar: ["COV", "CG"],
      plan_type: ["trial", "mensal", "semestral", "anual"],
      subscription_status: [
        "trial",
        "active",
        "expired",
        "canceled",
        "refunded",
      ],
      user_status: ["pendente", "aprovado", "bloqueado"],
    },
  },
} as const
