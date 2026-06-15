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
      ai_insights: {
        Row: {
          body: string
          confidence: number
          created_at: string
          dismissed: boolean | null
          generated_by: string
          id: string
          module: string
          org_id: string
          recommendation: string | null
          saved: boolean | null
          source_refs: Json
          title: string
        }
        Insert: {
          body: string
          confidence?: number
          created_at?: string
          dismissed?: boolean | null
          generated_by?: string
          id?: string
          module: string
          org_id: string
          recommendation?: string | null
          saved?: boolean | null
          source_refs?: Json
          title: string
        }
        Update: {
          body?: string
          confidence?: number
          created_at?: string
          dismissed?: boolean | null
          generated_by?: string
          id?: string
          module?: string
          org_id?: string
          recommendation?: string | null
          saved?: boolean | null
          source_refs?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string | null
          created_at: string
          id: string
          org_id: string
          payload: Json | null
          rule_key: string
          severity: Database["public"]["Enums"]["alert_severity"]
          subject_id: string | null
          subject_type: string | null
          title: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          created_at?: string
          id?: string
          org_id: string
          payload?: Json | null
          rule_key: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          subject_id?: string | null
          subject_type?: string | null
          title: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          created_at?: string
          id?: string
          org_id?: string
          payload?: Json | null
          rule_key?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          subject_id?: string | null
          subject_type?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_objections: {
        Row: {
          call_id: string
          created_at: string
          id: string
          objection: string
          org_id: string
          resolved: boolean | null
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          objection: string
          org_id: string
          resolved?: boolean | null
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          objection?: string
          org_id?: string
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "call_objections_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_objections_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "call_objections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          call_summary: string | null
          cash_collected_cents: number | null
          closed: boolean | null
          closer_id: string | null
          closer_name: string | null
          contract_value_cents: number | null
          created_at: string
          deposit_cents: number | null
          id: string
          key_moment: string | null
          lead_email: string | null
          lead_id: string | null
          offer_made: boolean | null
          org_id: string
          payment_plan: boolean | null
          recording_url: string | null
          scheduled_for: string | null
          setter_id: string | null
          showed: boolean | null
          status: Database["public"]["Enums"]["call_status"]
          time_to_close_seconds: number | null
          updated_at: string
        }
        Insert: {
          call_summary?: string | null
          cash_collected_cents?: number | null
          closed?: boolean | null
          closer_id?: string | null
          closer_name?: string | null
          contract_value_cents?: number | null
          created_at?: string
          deposit_cents?: number | null
          id?: string
          key_moment?: string | null
          lead_email?: string | null
          lead_id?: string | null
          offer_made?: boolean | null
          org_id: string
          payment_plan?: boolean | null
          recording_url?: string | null
          scheduled_for?: string | null
          setter_id?: string | null
          showed?: boolean | null
          status?: Database["public"]["Enums"]["call_status"]
          time_to_close_seconds?: number | null
          updated_at?: string
        }
        Update: {
          call_summary?: string | null
          cash_collected_cents?: number | null
          closed?: boolean | null
          closer_id?: string | null
          closer_name?: string | null
          contract_value_cents?: number | null
          created_at?: string
          deposit_cents?: number | null
          id?: string
          key_moment?: string | null
          lead_email?: string | null
          lead_id?: string | null
          offer_made?: boolean | null
          org_id?: string
          payment_plan?: boolean | null
          recording_url?: string | null
          scheduled_for?: string | null
          setter_id?: string | null
          showed?: boolean | null
          status?: Database["public"]["Enums"]["call_status"]
          time_to_close_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_wins: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          magnitude: string
          occurred_at: string
          org_id: string
          screenshot_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          magnitude?: string
          occurred_at?: string
          org_id: string
          screenshot_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          magnitude?: string
          occurred_at?: string
          org_id?: string
          screenshot_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_wins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contract_value_cents: number | null
          created_at: string
          email: string | null
          expected_next_payment_cents: number | null
          expected_next_payment_date: string | null
          full_name: string
          health_score: number | null
          id: string
          installment_amount_cents: number | null
          installments_remaining: number | null
          invested_to_date_cents: number | null
          lead_id: string | null
          notes: string | null
          offer_name: string | null
          org_id: string
          payment_plan: boolean | null
          phone: string | null
          pre_close_raw: Json | null
          pre_close_summary: string | null
          renewal_conv_started: boolean | null
          renewal_date: string | null
          renewal_stage: string
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          contract_value_cents?: number | null
          created_at?: string
          email?: string | null
          expected_next_payment_cents?: number | null
          expected_next_payment_date?: string | null
          full_name: string
          health_score?: number | null
          id?: string
          installment_amount_cents?: number | null
          installments_remaining?: number | null
          invested_to_date_cents?: number | null
          lead_id?: string | null
          notes?: string | null
          offer_name?: string | null
          org_id: string
          payment_plan?: boolean | null
          phone?: string | null
          pre_close_raw?: Json | null
          pre_close_summary?: string | null
          renewal_conv_started?: boolean | null
          renewal_date?: string | null
          renewal_stage?: string
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          contract_value_cents?: number | null
          created_at?: string
          email?: string | null
          expected_next_payment_cents?: number | null
          expected_next_payment_date?: string | null
          full_name?: string
          health_score?: number | null
          id?: string
          installment_amount_cents?: number | null
          installments_remaining?: number | null
          invested_to_date_cents?: number | null
          lead_id?: string | null
          notes?: string | null
          offer_name?: string | null
          org_id?: string
          payment_plan?: boolean | null
          phone?: string | null
          pre_close_raw?: Json | null
          pre_close_summary?: string | null
          renewal_conv_started?: boolean | null
          renewal_date?: string | null
          renewal_stage?: string
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_connections: {
        Row: {
          config: Json
          connector_id: string
          created_at: string
          created_by: string | null
          display_name: string | null
          external_account_id: string | null
          id: string
          org_id: string
          state: Database["public"]["Enums"]["connector_state"]
          updated_at: string
        }
        Insert: {
          config?: Json
          connector_id: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          org_id: string
          state?: Database["public"]["Enums"]["connector_state"]
          updated_at?: string
        }
        Update: {
          config?: Json
          connector_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          org_id?: string
          state?: Database["public"]["Enums"]["connector_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_connections_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connector_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_registry: {
        Row: {
          auth_method: string
          category: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_available: boolean | null
          name: string
          supports_events: boolean | null
        }
        Insert: {
          auth_method?: string
          category: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id: string
          is_available?: boolean | null
          name: string
          supports_events?: boolean | null
        }
        Update: {
          auth_method?: string
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          supports_events?: boolean | null
        }
        Relationships: []
      }
      connector_sync_status: {
        Row: {
          connection_id: string
          cursor: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          next_sync_at: string | null
          org_id: string
          records_synced: number | null
          resource: string
          state: Database["public"]["Enums"]["connector_state"]
          updated_at: string
        }
        Insert: {
          connection_id: string
          cursor?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          org_id: string
          records_synced?: number | null
          resource: string
          state?: Database["public"]["Enums"]["connector_state"]
          updated_at?: string
        }
        Update: {
          connection_id?: string
          cursor?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          org_id?: string
          records_synced?: number | null
          resource?: string
          state?: Database["public"]["Enums"]["connector_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_sync_status_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connector_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_sync_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_metrics: {
        Row: {
          avg_watch_pct: number | null
          calls_booked: number | null
          captured_at: string
          cash_collected_cents: number | null
          cash_per_1k_views_cents: number | null
          closes: number | null
          comments: number | null
          content_id: string
          cta_conversion_pct: number | null
          dms_generated: number | null
          drop_off_seconds: number | null
          follower_view_ratio: number | null
          followers_gained: number | null
          hook_retention_pct: number | null
          icp_attraction_score: number | null
          id: string
          leads_generated: number | null
          leads_per_1k_views: number | null
          likes: number | null
          org_id: string
          profile_visits: number | null
          qualified_follower_ratio: number | null
          qualified_followers_gained: number | null
          raw: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          ten_sec_retention_pct: number | null
          three_sec_hold_pct: number | null
          views: number | null
          watch_time_seconds: number | null
        }
        Insert: {
          avg_watch_pct?: number | null
          calls_booked?: number | null
          captured_at?: string
          cash_collected_cents?: number | null
          cash_per_1k_views_cents?: number | null
          closes?: number | null
          comments?: number | null
          content_id: string
          cta_conversion_pct?: number | null
          dms_generated?: number | null
          drop_off_seconds?: number | null
          follower_view_ratio?: number | null
          followers_gained?: number | null
          hook_retention_pct?: number | null
          icp_attraction_score?: number | null
          id?: string
          leads_generated?: number | null
          leads_per_1k_views?: number | null
          likes?: number | null
          org_id: string
          profile_visits?: number | null
          qualified_follower_ratio?: number | null
          qualified_followers_gained?: number | null
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          ten_sec_retention_pct?: number | null
          three_sec_hold_pct?: number | null
          views?: number | null
          watch_time_seconds?: number | null
        }
        Update: {
          avg_watch_pct?: number | null
          calls_booked?: number | null
          captured_at?: string
          cash_collected_cents?: number | null
          cash_per_1k_views_cents?: number | null
          closes?: number | null
          comments?: number | null
          content_id?: string
          cta_conversion_pct?: number | null
          dms_generated?: number | null
          drop_off_seconds?: number | null
          follower_view_ratio?: number | null
          followers_gained?: number | null
          hook_retention_pct?: number | null
          icp_attraction_score?: number | null
          id?: string
          leads_generated?: number | null
          leads_per_1k_views?: number | null
          likes?: number | null
          org_id?: string
          profile_visits?: number | null
          qualified_follower_ratio?: number | null
          qualified_followers_gained?: number | null
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          ten_sec_retention_pct?: number | null
          three_sec_hold_pct?: number | null
          views?: number | null
          watch_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_metrics_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces: {
        Row: {
          angle: Database["public"]["Enums"]["content_angle"] | null
          awareness_stage: Database["public"]["Enums"]["awareness_stage"] | null
          body: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          duration_seconds: number | null
          external_id: string | null
          funnel_stage: string | null
          hook: string | null
          hook_score: number | null
          id: string
          notes: string | null
          org_id: string
          pain_point: string | null
          pipeline_status: string
          platform: Database["public"]["Enums"]["content_platform"]
          posted_at: string | null
          source_connector: string | null
          thumbnail_url: string | null
          title: string | null
          topic: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          angle?: Database["public"]["Enums"]["content_angle"] | null
          awareness_stage?:
            | Database["public"]["Enums"]["awareness_stage"]
            | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          duration_seconds?: number | null
          external_id?: string | null
          funnel_stage?: string | null
          hook?: string | null
          hook_score?: number | null
          id?: string
          notes?: string | null
          org_id: string
          pain_point?: string | null
          pipeline_status?: string
          platform: Database["public"]["Enums"]["content_platform"]
          posted_at?: string | null
          source_connector?: string | null
          thumbnail_url?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          angle?: Database["public"]["Enums"]["content_angle"] | null
          awareness_stage?:
            | Database["public"]["Enums"]["awareness_stage"]
            | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          duration_seconds?: number | null
          external_id?: string | null
          funnel_stage?: string | null
          hook?: string | null
          hook_score?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          pain_point?: string | null
          pipeline_status?: string
          platform?: Database["public"]["Enums"]["content_platform"]
          posted_at?: string | null
          source_connector?: string | null
          thumbnail_url?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_pieces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          created_at: string
          external_thread_id: string | null
          first_response_seconds: number | null
          id: string
          last_message_at: string | null
          lead_id: string | null
          org_id: string
          setter_id: string | null
          source_tag: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          external_thread_id?: string | null
          first_response_seconds?: number | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          org_id: string
          setter_id?: string | null
          source_tag?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          external_thread_id?: string | null
          first_response_seconds?: number | null
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          org_id?: string
          setter_id?: string | null
          source_tag?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_clients: {
        Row: {
          avatar_research: Json
          competitors: string | null
          created_at: string
          display_name: string
          id: string
          niche: string | null
          notes: string | null
          offer_details: Json
          org_id: string
          sacred_cows: string | null
          updated_at: string
          voice_fingerprint: Json | null
          voice_transcripts: string | null
        }
        Insert: {
          avatar_research?: Json
          competitors?: string | null
          created_at?: string
          display_name: string
          id?: string
          niche?: string | null
          notes?: string | null
          offer_details?: Json
          org_id: string
          sacred_cows?: string | null
          updated_at?: string
          voice_fingerprint?: Json | null
          voice_transcripts?: string | null
        }
        Update: {
          avatar_research?: Json
          competitors?: string | null
          created_at?: string
          display_name?: string
          id?: string
          niche?: string | null
          notes?: string | null
          offer_details?: Json
          org_id?: string
          sacred_cows?: string | null
          updated_at?: string
          voice_fingerprint?: Json | null
          voice_transcripts?: string | null
        }
        Relationships: []
      }
      copy_generations: {
        Row: {
          angle: string | null
          client_id: string | null
          copy_type: string
          created_at: string
          created_by: string | null
          goal: string | null
          id: string
          org_id: string
          output: string
          prompt_inputs: Json
          review_feedback: Json | null
          review_score: number | null
        }
        Insert: {
          angle?: string | null
          client_id?: string | null
          copy_type: string
          created_at?: string
          created_by?: string | null
          goal?: string | null
          id?: string
          org_id: string
          output: string
          prompt_inputs?: Json
          review_feedback?: Json | null
          review_score?: number | null
        }
        Update: {
          angle?: string | null
          client_id?: string | null
          copy_type?: string
          created_at?: string
          created_by?: string | null
          goal?: string | null
          id?: string
          org_id?: string
          output?: string
          prompt_inputs?: Json
          review_feedback?: Json | null
          review_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_generations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "copy_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_swipes: {
        Row: {
          angle: string | null
          body: string
          copy_type: string
          created_at: string
          emotion: string | null
          id: string
          image_urls: string[]
          org_id: string
          source: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          angle?: string | null
          body: string
          copy_type: string
          created_at?: string
          emotion?: string | null
          id?: string
          image_urls?: string[]
          org_id: string
          source?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          angle?: string | null
          body?: string
          copy_type?: string
          created_at?: string
          emotion?: string | null
          id?: string
          image_urls?: string[]
          org_id?: string
          source?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard: string
          id: string
          metric_key: string | null
          org_id: string
          position: number
          title: string
          updated_at: string
          user_id: string | null
          widget_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard?: string
          id?: string
          metric_key?: string | null
          org_id: string
          position?: number
          title: string
          updated_at?: string
          user_id?: string | null
          widget_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard?: string
          id?: string
          metric_key?: string | null
          org_id?: string
          position?: number
          title?: string
          updated_at?: string
          user_id?: string | null
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          org_id: string
          payload: Json
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          org_id: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          org_id?: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      formula_variables: {
        Row: {
          aggregation: string
          description: string | null
          display_name: string
          id: string
          is_currency: boolean | null
          scope: Database["public"]["Enums"]["metric_scope"]
          source_column: string
          source_table: string
        }
        Insert: {
          aggregation?: string
          description?: string | null
          display_name: string
          id: string
          is_currency?: boolean | null
          scope?: Database["public"]["Enums"]["metric_scope"]
          source_column: string
          source_table: string
        }
        Update: {
          aggregation?: string
          description?: string | null
          display_name?: string
          id?: string
          is_currency?: boolean | null
          scope?: Database["public"]["Enums"]["metric_scope"]
          source_column?: string
          source_table?: string
        }
        Relationships: []
      }
      hiring_applicants: {
        Row: {
          ai_reasoning: string | null
          ai_score: number | null
          applied_at: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_shown_at: string | null
          niche: string | null
          notes: string | null
          org_id: string
          phone: string | null
          responses: Json
          role_applied: string
          source: string | null
          stage: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          ai_reasoning?: string | null
          ai_score?: number | null
          applied_at?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_shown_at?: string | null
          niche?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          responses?: Json
          role_applied?: string
          source?: string | null
          stage?: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          ai_reasoning?: string | null
          ai_score?: number | null
          applied_at?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_shown_at?: string | null
          niche?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          responses?: Json
          role_applied?: string
          source?: string | null
          stage?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          attempt: number
          connection_id: string | null
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          org_id: string
          payload: Json | null
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          connection_id?: string | null
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          org_id: string
          payload?: Json | null
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          connection_id?: string | null
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          org_id?: string
          payload?: Json | null
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connector_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_content_touches: {
        Row: {
          content_id: string
          id: string
          lead_id: string
          org_id: string
          touch_type: string | null
          touched_at: string
        }
        Insert: {
          content_id: string
          id?: string
          lead_id: string
          org_id: string
          touch_type?: string | null
          touched_at?: string
        }
        Update: {
          content_id?: string
          id?: string
          lead_id?: string
          org_id?: string
          touch_type?: string | null
          touched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_content_touches_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_content_touches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_content_touches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_content_touches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          lead_id: string
          occurred_at: string
          org_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          occurred_at?: string
          org_id: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          occurred_at?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          kind: string
          lead_id: string
          org_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: string
          lead_id: string
          org_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          application_data: Json
          assigned_setter_id: string | null
          beliefs: string | null
          created_at: string
          email: string | null
          engagement_score: number | null
          estimated_close_probability: number | null
          external_id: string | null
          first_touch_at: string | null
          first_touch_content_id: string | null
          full_name: string | null
          handle: string | null
          id: string
          intent_score: number | null
          notes: string | null
          objections_raised: string[] | null
          org_id: string
          phone: string | null
          pipeline_stage: string | null
          precall_assets_sent_at: string | null
          precall_video_watched: boolean
          priority: string
          qualification_notes: string | null
          source_connector: string | null
          status: Database["public"]["Enums"]["lead_status"]
          traffic_source_id: string | null
          updated_at: string
        }
        Insert: {
          application_data?: Json
          assigned_setter_id?: string | null
          beliefs?: string | null
          created_at?: string
          email?: string | null
          engagement_score?: number | null
          estimated_close_probability?: number | null
          external_id?: string | null
          first_touch_at?: string | null
          first_touch_content_id?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          intent_score?: number | null
          notes?: string | null
          objections_raised?: string[] | null
          org_id: string
          phone?: string | null
          pipeline_stage?: string | null
          precall_assets_sent_at?: string | null
          precall_video_watched?: boolean
          priority?: string
          qualification_notes?: string | null
          source_connector?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          traffic_source_id?: string | null
          updated_at?: string
        }
        Update: {
          application_data?: Json
          assigned_setter_id?: string | null
          beliefs?: string | null
          created_at?: string
          email?: string | null
          engagement_score?: number | null
          estimated_close_probability?: number | null
          external_id?: string | null
          first_touch_at?: string | null
          first_touch_content_id?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          intent_score?: number | null
          notes?: string | null
          objections_raised?: string[] | null
          org_id?: string
          phone?: string | null
          pipeline_stage?: string | null
          precall_assets_sent_at?: string | null
          precall_video_watched?: boolean
          priority?: string
          qualification_notes?: string | null
          source_connector?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          traffic_source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_first_touch_content_id_fkey"
            columns: ["first_touch_content_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_traffic_source_id_fkey"
            columns: ["traffic_source_id"]
            isOneToOne: false
            referencedRelation: "traffic_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          id: string
          org_id: string
          resource: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          id?: string
          org_id: string
          resource: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          id?: string
          org_id?: string
          resource?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_requests: {
        Row: {
          admin_email: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string
          id: string
          org_id: string
          requested_role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          admin_email?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name: string
          id?: string
          org_id: string
          requested_role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          admin_email?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string
          id?: string
          org_id?: string
          requested_role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          direction: string
          external_id: string | null
          id: string
          org_id: string
          raw: Json | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          direction: string
          external_id?: string | null
          id?: string
          org_id: string
          raw?: Json | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          direction?: string
          external_id?: string | null
          id?: string
          org_id?: string
          raw?: Json | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          formula: string
          id: string
          is_system: boolean | null
          key: string
          org_id: string | null
          scope: Database["public"]["Enums"]["metric_scope"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          formula: string
          id?: string
          is_system?: boolean | null
          key: string
          org_id?: string | null
          scope?: Database["public"]["Enums"]["metric_scope"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          formula?: string
          id?: string
          is_system?: boolean | null
          key?: string
          org_id?: string | null
          scope?: Database["public"]["Enums"]["metric_scope"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          org_id: string
          responses: Json
          share_token: string
          submitted_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          responses?: Json
          share_token?: string
          submitted_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          responses?: Json
          share_token?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      outreach_lists: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_lists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          kind: string
          list_id: string | null
          org_id: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          list_id?: string | null
          org_id: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          list_id?: string | null
          org_id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "outreach_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_recipients: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          list_id: string
          org_id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          list_id: string
          org_id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          list_id?: string
          org_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_recipients_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "outreach_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_recipients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          call_id: string | null
          client_id: string | null
          collected_at: string
          created_at: string
          currency: string
          external_id: string | null
          id: string
          org_id: string
          raw: Json | null
          source_connector: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_cents: number
          call_id?: string | null
          client_id?: string | null
          collected_at?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          org_id: string
          raw?: Json | null
          source_connector?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_cents?: number
          call_id?: string | null
          client_id?: string | null
          collected_at?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          org_id?: string
          raw?: Json | null
          source_connector?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution_v"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raw_payloads: {
        Row: {
          connection_id: string | null
          connector_id: string
          external_id: string | null
          id: string
          org_id: string
          payload: Json
          process_error: string | null
          processed_at: string | null
          received_at: string
          resource: string
        }
        Insert: {
          connection_id?: string | null
          connector_id: string
          external_id?: string | null
          id?: string
          org_id: string
          payload: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          resource: string
        }
        Update: {
          connection_id?: string | null
          connector_id?: string
          external_id?: string | null
          id?: string
          org_id?: string
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          resource?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_payloads_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connector_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_payloads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          id: string
          org_id: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          id?: string
          org_id: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          id?: string
          org_id?: string
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          entity: string
          filter: Json
          id: string
          is_shared: boolean | null
          name: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity: string
          filter?: Json
          id?: string
          is_shared?: boolean | null
          name: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity?: string
          filter?: Json
          id?: string
          is_shared?: boolean | null
          name?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      setter_activity: {
        Row: {
          activity_date: string
          calls_on_calendar: number | null
          cash_collected_cents: number | null
          closes: number | null
          connections: number | null
          created_at: string
          dials: number | null
          downsells: number | null
          id: string
          lead_source: string | null
          leads_contacted: number | null
          links_sent: number | null
          live_calls: number | null
          notes: string | null
          objections: string | null
          org_id: string
          qualified_convos: number | null
          rate_today: number | null
          role: string
          sets: number | null
          team_member_name: string
          total_revenue_cents: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activity_date?: string
          calls_on_calendar?: number | null
          cash_collected_cents?: number | null
          closes?: number | null
          connections?: number | null
          created_at?: string
          dials?: number | null
          downsells?: number | null
          id?: string
          lead_source?: string | null
          leads_contacted?: number | null
          links_sent?: number | null
          live_calls?: number | null
          notes?: string | null
          objections?: string | null
          org_id: string
          qualified_convos?: number | null
          rate_today?: number | null
          role?: string
          sets?: number | null
          team_member_name: string
          total_revenue_cents?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activity_date?: string
          calls_on_calendar?: number | null
          cash_collected_cents?: number | null
          closes?: number | null
          connections?: number | null
          created_at?: string
          dials?: number | null
          downsells?: number | null
          id?: string
          lead_source?: string | null
          leads_contacted?: number | null
          links_sent?: number | null
          live_calls?: number | null
          notes?: string | null
          objections?: string | null
          org_id?: string
          qualified_convos?: number | null
          rate_today?: number | null
          role?: string
          sets?: number | null
          team_member_name?: string
          total_revenue_cents?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      slide_metrics: {
        Row: {
          captured_at: string
          exits: number | null
          id: string
          link_clicks: number | null
          org_id: string
          raw: Json | null
          replies: number | null
          slide_id: string
          taps_back: number | null
          taps_forward: number | null
          views: number | null
        }
        Insert: {
          captured_at?: string
          exits?: number | null
          id?: string
          link_clicks?: number | null
          org_id: string
          raw?: Json | null
          replies?: number | null
          slide_id: string
          taps_back?: number | null
          taps_forward?: number | null
          views?: number | null
        }
        Update: {
          captured_at?: string
          exits?: number | null
          id?: string
          link_clicks?: number | null
          org_id?: string
          raw?: Json | null
          replies?: number | null
          slide_id?: string
          taps_back?: number | null
          taps_forward?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "slide_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_metrics_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "story_slides"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sequences: {
        Row: {
          client_id: string | null
          created_at: string
          day_of_week: number
          id: string
          notes: string | null
          org_id: string
          posted_at: string | null
          scheduled_for: string | null
          slides: Json
          status: string
          template_key: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          notes?: string | null
          org_id: string
          posted_at?: string | null
          scheduled_for?: string | null
          slides?: Json
          status?: string
          template_key: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          notes?: string | null
          org_id?: string
          posted_at?: string | null
          scheduled_for?: string | null
          slides?: Json
          status?: string
          template_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "copy_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      story_slides: {
        Row: {
          caption: string | null
          content_id: string
          created_at: string
          cta: string | null
          id: string
          org_id: string
          posted_at: string | null
          sequence_index: number
        }
        Insert: {
          caption?: string | null
          content_id: string
          created_at?: string
          cta?: string | null
          id?: string
          org_id: string
          posted_at?: string | null
          sequence_index: number
        }
        Update: {
          caption?: string | null
          content_id?: string
          created_at?: string
          cta?: string | null
          id?: string
          org_id?: string
          posted_at?: string | null
          sequence_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_slides_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_slides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      taggables: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          taggable_id: string
          taggable_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          taggable_id: string
          taggable_type: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          taggable_id?: string
          taggable_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "taggables_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string
          color: string | null
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org_id: string
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org_id: string
          role: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      traffic_sources: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traffic_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          delivered_at: string | null
          event_id: string | null
          id: string
          org_id: string
          response_body: string | null
          response_code: number | null
          status: string
          subscription_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          id?: string
          org_id: string
          response_body?: string | null
          response_code?: number | null
          status?: string
          subscription_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          id?: string
          org_id?: string
          response_body?: string | null
          response_code?: number | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          active: boolean
          category: string | null
          channel: string
          created_at: string
          event_types: string[]
          id: string
          name: string
          org_id: string
          role_filter: Database["public"]["Enums"]["app_role"][] | null
          signing_secret: string | null
          target_url: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          channel?: string
          created_at?: string
          event_types?: string[]
          id?: string
          name: string
          org_id: string
          role_filter?: Database["public"]["Enums"]["app_role"][] | null
          signing_secret?: string | null
          target_url: string
        }
        Update: {
          active?: boolean
          category?: string | null
          channel?: string
          created_at?: string
          event_types?: string[]
          id?: string
          name?: string
          org_id?: string
          role_filter?: Database["public"]["Enums"]["app_role"][] | null
          signing_secret?: string | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lead_attribution_v: {
        Row: {
          call_cash_cents: number | null
          call_closed: boolean | null
          call_id: string | null
          call_scheduled_for: string | null
          call_showed: boolean | null
          closer_name: string | null
          email: string | null
          first_touch_content_id: string | null
          first_touch_hook: string | null
          first_touch_platform:
            | Database["public"]["Enums"]["content_platform"]
            | null
          first_touch_title: string | null
          full_name: string | null
          handle: string | null
          last_payment_at: string | null
          lead_created_at: string | null
          lead_id: string | null
          org_id: string | null
          payments_total_cents: number | null
          setter_name: string | null
          source_connector: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_first_touch_content_id_fkey"
            columns: ["first_touch_content_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_membership_request: {
        Args: {
          _request_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      current_user_orgs: { Args: never; Returns: string[] }
      has_org_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      reject_membership_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      submit_membership_request: {
        Args: {
          _admin_email: string
          _email: string
          _full_name: string
          _requested_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role:
        | "owner"
        | "admin"
        | "closer"
        | "setter"
        | "va"
        | "viewer"
        | "sales_manager"
        | "growth_ops"
      awareness_stage:
        | "unaware"
        | "problem_aware"
        | "solution_aware"
        | "product_aware"
        | "most_aware"
      call_status:
        | "booked"
        | "showed"
        | "no_show"
        | "offer_made"
        | "closed"
        | "disqualified"
        | "follow_up"
        | "rescheduled"
      connector_state:
        | "not_connected"
        | "connected"
        | "syncing"
        | "error"
        | "disabled"
      content_angle:
        | "authority"
        | "proof"
        | "educational"
        | "lifestyle"
        | "controversial"
        | "identity"
        | "origin_story"
        | "other"
      content_platform:
        | "reel"
        | "tiktok"
        | "youtube"
        | "youtube_short"
        | "story_sequence"
        | "email"
        | "ad_creative"
        | "vsl"
        | "carousel"
        | "post"
        | "dm"
        | "other"
      lead_status:
        | "dm_received"
        | "qualified"
        | "pre_call_assets_sent"
        | "call_booked"
        | "showed"
        | "closed"
        | "disqualified"
        | "follow_up"
        | "no_show"
        | "ghosted"
      metric_scope:
        | "org"
        | "content"
        | "lead"
        | "call"
        | "setter"
        | "closer"
        | "traffic_source"
        | "client"
      payment_status: "paid" | "pending" | "failed" | "refunded" | "partial"
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
      alert_severity: ["info", "warning", "critical"],
      app_role: [
        "owner",
        "admin",
        "closer",
        "setter",
        "va",
        "viewer",
        "sales_manager",
        "growth_ops",
      ],
      awareness_stage: [
        "unaware",
        "problem_aware",
        "solution_aware",
        "product_aware",
        "most_aware",
      ],
      call_status: [
        "booked",
        "showed",
        "no_show",
        "offer_made",
        "closed",
        "disqualified",
        "follow_up",
        "rescheduled",
      ],
      connector_state: [
        "not_connected",
        "connected",
        "syncing",
        "error",
        "disabled",
      ],
      content_angle: [
        "authority",
        "proof",
        "educational",
        "lifestyle",
        "controversial",
        "identity",
        "origin_story",
        "other",
      ],
      content_platform: [
        "reel",
        "tiktok",
        "youtube",
        "youtube_short",
        "story_sequence",
        "email",
        "ad_creative",
        "vsl",
        "carousel",
        "post",
        "dm",
        "other",
      ],
      lead_status: [
        "dm_received",
        "qualified",
        "pre_call_assets_sent",
        "call_booked",
        "showed",
        "closed",
        "disqualified",
        "follow_up",
        "no_show",
        "ghosted",
      ],
      metric_scope: [
        "org",
        "content",
        "lead",
        "call",
        "setter",
        "closer",
        "traffic_source",
        "client",
      ],
      payment_status: ["paid", "pending", "failed", "refunded", "partial"],
    },
  },
} as const
