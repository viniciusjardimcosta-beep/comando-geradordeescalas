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
      asaas_subscriptions: {
        Row: {
          billing_type: string | null
          created_at: string
          customer_id: string | null
          cycle: string | null
          id: string
          next_due_date: string | null
          payment_id: string | null
          plan_type: string | null
          raw_payload: Json
          status: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string | null
          value: number | null
        }
        Insert: {
          billing_type?: string | null
          created_at?: string
          customer_id?: string | null
          cycle?: string | null
          id?: string
          next_due_date?: string | null
          payment_id?: string | null
          plan_type?: string | null
          raw_payload?: Json
          status?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
          value?: number | null
        }
        Update: {
          billing_type?: string | null
          created_at?: string
          customer_id?: string | null
          cycle?: string | null
          id?: string
          next_due_date?: string | null
          payment_id?: string | null
          plan_type?: string | null
          raw_payload?: Json
          status?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
          value?: number | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          customer_email: string | null
          dedupe_key: string | null
          error_message: string | null
          event_id: string | null
          event_timestamp: string | null
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
          subject_key: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          dedupe_key?: string | null
          error_message?: string | null
          event_id?: string | null
          event_timestamp?: string | null
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
          subject_key?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          dedupe_key?: string | null
          error_message?: string | null
          event_id?: string | null
          event_timestamp?: string | null
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
          subject_key?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      billing_subject_state: {
        Row: {
          created_at: string
          id: string
          last_event_at: string | null
          last_event_id: string | null
          last_event_type: string | null
          provider: string
          subject_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          last_event_type?: string | null
          provider: string
          subject_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_event_at?: string | null
          last_event_id?: string | null
          last_event_type?: string | null
          provider?: string
          subject_key?: string
          updated_at?: string
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
          furos: Json
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
          furos?: Json
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
          furos?: Json
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
          batalhao_nbi: string | null
          cidade_nbi: string | null
          companhia_nbi: string | null
          created_at: string
          distribuicao_interna_nbi: string | null
          funcao: Database["public"]["Enums"]["funcao_militar"] | null
          funcao_administrativa_nbi: string | null
          funcao_atual: string | null
          funcao_documental_nbi: string | null
          gbm_nbi: string | null
          genero_gramatical: string | null
          id: string
          is_adm: boolean
          is_cg: boolean
          is_cov: boolean
          lotacao_nbi: string | null
          matricula: string | null
          matricula_norm: string | null
          nome: string
          nome_guerra: string | null
          observacoes: string | null
          pelotao_nbi: string | null
          posto_graduacao: string | null
          quadro: string | null
          secao_nbi: string | null
          setor_nbi: string | null
          subsecao_nbi: string | null
          tipo_escala: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          batalhao_nbi?: string | null
          cidade_nbi?: string | null
          companhia_nbi?: string | null
          created_at?: string
          distribuicao_interna_nbi?: string | null
          funcao?: Database["public"]["Enums"]["funcao_militar"] | null
          funcao_administrativa_nbi?: string | null
          funcao_atual?: string | null
          funcao_documental_nbi?: string | null
          gbm_nbi?: string | null
          genero_gramatical?: string | null
          id?: string
          is_adm?: boolean
          is_cg?: boolean
          is_cov?: boolean
          lotacao_nbi?: string | null
          matricula?: string | null
          matricula_norm?: string | null
          nome: string
          nome_guerra?: string | null
          observacoes?: string | null
          pelotao_nbi?: string | null
          posto_graduacao?: string | null
          quadro?: string | null
          secao_nbi?: string | null
          setor_nbi?: string | null
          subsecao_nbi?: string | null
          tipo_escala?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          batalhao_nbi?: string | null
          cidade_nbi?: string | null
          companhia_nbi?: string | null
          created_at?: string
          distribuicao_interna_nbi?: string | null
          funcao?: Database["public"]["Enums"]["funcao_militar"] | null
          funcao_administrativa_nbi?: string | null
          funcao_atual?: string | null
          funcao_documental_nbi?: string | null
          gbm_nbi?: string | null
          genero_gramatical?: string | null
          id?: string
          is_adm?: boolean
          is_cg?: boolean
          is_cov?: boolean
          lotacao_nbi?: string | null
          matricula?: string | null
          matricula_norm?: string | null
          nome?: string
          nome_guerra?: string | null
          observacoes?: string | null
          pelotao_nbi?: string | null
          posto_graduacao?: string | null
          quadro?: string | null
          secao_nbi?: string | null
          setor_nbi?: string | null
          subsecao_nbi?: string | null
          tipo_escala?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_auditoria: {
        Row: {
          acao: string
          created_at: string
          detalhe: Json | null
          documento_id: string
          id: string
          user_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhe?: Json | null
          documento_id: string
          id?: string
          user_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhe?: Json | null
          documento_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nbi_auditoria_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "nbi_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nbi_documents: {
        Row: {
          ano: number | null
          assuntos: Json
          cancel_reason: string | null
          canceled_at: string | null
          created_at: string
          data_documento: string
          generated_at: string | null
          id: string
          numero: string | null
          numero_ano_local: number | null
          numero_int: number | null
          reserved_at: string | null
          responsaveis: Json
          snapshot: Json
          status: string
          storage_path: string | null
          titulo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ano?: number | null
          assuntos?: Json
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          data_documento?: string
          generated_at?: string | null
          id?: string
          numero?: string | null
          numero_ano_local?: number | null
          numero_int?: number | null
          reserved_at?: string | null
          responsaveis?: Json
          snapshot?: Json
          status?: string
          storage_path?: string | null
          titulo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: number | null
          assuntos?: Json
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          data_documento?: string
          generated_at?: string | null
          id?: string
          numero?: string | null
          numero_ano_local?: number | null
          numero_int?: number | null
          reserved_at?: string | null
          responsaveis?: Json
          snapshot?: Json
          status?: string
          storage_path?: string | null
          titulo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_fundamentos: {
        Row: {
          ativo: boolean
          codigo_assunto: string
          created_at: string
          id: string
          padrao: boolean
          texto_oficial: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          codigo_assunto: string
          created_at?: string
          id?: string
          padrao?: boolean
          texto_oficial: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          codigo_assunto?: string
          created_at?: string
          id?: string
          padrao?: boolean
          texto_oficial?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_numeracao: {
        Row: {
          ano_vigente: number
          created_at: string
          id: string
          prefixo: string | null
          reiniciar_anualmente: boolean
          ultima_nota: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano_vigente?: number
          created_at?: string
          id?: string
          prefixo?: string | null
          reiniciar_anualmente?: boolean
          ultima_nota?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano_vigente?: number
          created_at?: string
          id?: string
          prefixo?: string | null
          reiniciar_anualmente?: boolean
          ultima_nota?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_numeracao_log: {
        Row: {
          acao: string
          antes: Json | null
          created_at: string
          depois: Json | null
          detalhe: string | null
          id: string
          user_id: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          detalhe?: string | null
          id?: string
          user_id: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          detalhe?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_settings: {
        Row: {
          autoridade_funcao: string | null
          autoridade_lotacao: string | null
          autoridade_militar_id: string | null
          autoridade_nome: string | null
          autoridade_posto_quadro: string | null
          boletim_nome: string | null
          boletim_sigla: string | null
          cabecalho_batalhao: string | null
          cabecalho_cidade: string | null
          cabecalho_corporacao: string | null
          cabecalho_estado: string | null
          cabecalho_secretaria: string | null
          cabecalho_subunidade: string | null
          comandante_funcao: string | null
          comandante_lotacao: string | null
          comandante_militar_id: string | null
          comandante_nome: string | null
          comandante_posto_quadro: string | null
          created_at: string
          digitador_funcao: string | null
          digitador_lotacao: string | null
          digitador_militar_id: string | null
          digitador_nome: string | null
          digitador_posto_quadro: string | null
          id: string
          unidade_nome: string | null
          unidade_sigla: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autoridade_funcao?: string | null
          autoridade_lotacao?: string | null
          autoridade_militar_id?: string | null
          autoridade_nome?: string | null
          autoridade_posto_quadro?: string | null
          boletim_nome?: string | null
          boletim_sigla?: string | null
          cabecalho_batalhao?: string | null
          cabecalho_cidade?: string | null
          cabecalho_corporacao?: string | null
          cabecalho_estado?: string | null
          cabecalho_secretaria?: string | null
          cabecalho_subunidade?: string | null
          comandante_funcao?: string | null
          comandante_lotacao?: string | null
          comandante_militar_id?: string | null
          comandante_nome?: string | null
          comandante_posto_quadro?: string | null
          created_at?: string
          digitador_funcao?: string | null
          digitador_lotacao?: string | null
          digitador_militar_id?: string | null
          digitador_nome?: string | null
          digitador_posto_quadro?: string | null
          id?: string
          unidade_nome?: string | null
          unidade_sigla?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autoridade_funcao?: string | null
          autoridade_lotacao?: string | null
          autoridade_militar_id?: string | null
          autoridade_nome?: string | null
          autoridade_posto_quadro?: string | null
          boletim_nome?: string | null
          boletim_sigla?: string | null
          cabecalho_batalhao?: string | null
          cabecalho_cidade?: string | null
          cabecalho_corporacao?: string | null
          cabecalho_estado?: string | null
          cabecalho_secretaria?: string | null
          cabecalho_subunidade?: string | null
          comandante_funcao?: string | null
          comandante_lotacao?: string | null
          comandante_militar_id?: string | null
          comandante_nome?: string | null
          comandante_posto_quadro?: string | null
          created_at?: string
          digitador_funcao?: string | null
          digitador_lotacao?: string | null
          digitador_militar_id?: string | null
          digitador_nome?: string | null
          digitador_posto_quadro?: string | null
          id?: string
          unidade_nome?: string | null
          unidade_sigla?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nbi_settings_autoridade_militar_id_fkey"
            columns: ["autoridade_militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nbi_settings_comandante_militar_id_fkey"
            columns: ["comandante_militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nbi_settings_digitador_militar_id_fkey"
            columns: ["digitador_militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      nbi_siglas_institucionais: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          descricao_oficial: string
          forma_documental: string | null
          id: string
          modo: string
          sigla: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao_oficial: string
          forma_documental?: string | null
          id?: string
          modo?: string
          sigla: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao_oficial?: string
          forma_documental?: string | null
          id?: string
          modo?: string
          sigla?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nbi_substituicoes: {
        Row: {
          assuncao_documento_id: string | null
          created_at: string
          data_fim_efetiva: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          dispensa_documento_id: string | null
          funcao: string | null
          id: string
          motivo: string | null
          snapshot: Json
          status: string
          substituto_militar_id: string | null
          titular_militar_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assuncao_documento_id?: string | null
          created_at?: string
          data_fim_efetiva?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          dispensa_documento_id?: string | null
          funcao?: string | null
          id?: string
          motivo?: string | null
          snapshot?: Json
          status?: string
          substituto_militar_id?: string | null
          titular_militar_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assuncao_documento_id?: string | null
          created_at?: string
          data_fim_efetiva?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          dispensa_documento_id?: string | null
          funcao?: string | null
          id?: string
          motivo?: string | null
          snapshot?: Json
          status?: string
          substituto_militar_id?: string | null
          titular_militar_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nbi_substituicoes_assuncao_documento_id_fkey"
            columns: ["assuncao_documento_id"]
            isOneToOne: false
            referencedRelation: "nbi_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nbi_substituicoes_dispensa_documento_id_fkey"
            columns: ["dispensa_documento_id"]
            isOneToOne: false
            referencedRelation: "nbi_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nbi_substituicoes_substituto_militar_id_fkey"
            columns: ["substituto_militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nbi_substituicoes_titular_militar_id_fkey"
            columns: ["titular_militar_id"]
            isOneToOne: false
            referencedRelation: "militares"
            referencedColumns: ["id"]
          },
        ]
      }
      nbi_template_versions: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          template_id: string
          texto_modelo: string
          versao: number
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          template_id: string
          texto_modelo: string
          versao: number
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          template_id?: string
          texto_modelo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "nbi_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "nbi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      nbi_templates: {
        Row: {
          campos: Json
          codigo: string
          created_at: string
          descricao: string | null
          disponivel: boolean
          estado_homologacao: string
          id: string
          ordem: number
          subtipo: string | null
          texto_modelo: string
          titulo: string
          titulo_documento: string | null
          updated_at: string
          versao: number
        }
        Insert: {
          campos?: Json
          codigo: string
          created_at?: string
          descricao?: string | null
          disponivel?: boolean
          estado_homologacao?: string
          id?: string
          ordem?: number
          subtipo?: string | null
          texto_modelo: string
          titulo: string
          titulo_documento?: string | null
          updated_at?: string
          versao?: number
        }
        Update: {
          campos?: Json
          codigo?: string
          created_at?: string
          descricao?: string | null
          disponivel?: boolean
          estado_homologacao?: string
          id?: string
          ordem?: number
          subtipo?: string | null
          texto_modelo?: string
          titulo?: string
          titulo_documento?: string | null
          updated_at?: string
          versao?: number
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
          ambiente_homologacao: boolean
          complimentary_access: boolean
          complimentary_access_expires_at: string | null
          complimentary_access_reason: string | null
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
          ambiente_homologacao?: boolean
          complimentary_access?: boolean
          complimentary_access_expires_at?: string | null
          complimentary_access_reason?: string | null
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
          ambiente_homologacao?: boolean
          complimentary_access?: boolean
          complimentary_access_expires_at?: string | null
          complimentary_access_reason?: string | null
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
      stripe_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          customer_id: string | null
          id: string
          plan_type: string | null
          price_id: string | null
          raw_payload: Json | null
          status: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          customer_id?: string | null
          id?: string
          plan_type?: string | null
          price_id?: string | null
          raw_payload?: Json | null
          status?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          customer_id?: string | null
          id?: string
          plan_type?: string | null
          price_id?: string | null
          raw_payload?: Json | null
          status?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
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
      billing_claim_event: {
        Args: {
          _customer_email: string
          _dedupe_key: string
          _event_id: string
          _event_timestamp: string
          _event_type: string
          _external_id: string
          _headers: Json
          _payload: Json
          _provider: string
          _source_ip: string
          _subject_key: string
        }
        Returns: {
          decision: string
          event_row_id: string
        }[]
      }
      finalizar_senha_temporaria: {
        Args: never
        Returns: {
          id: string
          password_temporary: boolean
        }[]
      }
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
      nbi_cancelar_documento: {
        Args: { _documento_id: string; _motivo: string }
        Returns: {
          cancel_reason: string
          canceled_at: string
          id: string
          status: string
        }[]
      }
      nbi_reservar_numero: {
        Args: {
          _ano_local: number
          _confirmar_novo_ano?: boolean
          _documento_id: string
        }
        Returns: {
          ano: number
          motivo: string
          numero: number
          reservado: boolean
        }[]
      }
      nbi_reutilizar_numero: {
        Args: {
          _ano: number
          _documento_id: string
          _numero: number
          _origem_documento_id: string
        }
        Returns: {
          ano: number
          numero: number
          reutilizado: boolean
        }[]
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
        | "overdue"
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
        "overdue",
      ],
      user_status: ["pendente", "aprovado", "bloqueado"],
    },
  },
} as const
