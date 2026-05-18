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
      clients: {
        Row: {
          contract_value_cents: number | null
          created_at: string
          email: string | null
          full_name: string
          health_score: number | null
          id: string
          installments_remaining: number | null
          lead_id: string | null
          notes: string | null
          offer_name: string | null
          org_id: string
          payment_plan: boolean | null
          renewal_conv_started: boolean | null
          renewal_date: string | null
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          contract_value_cents?: number | null
          created_at?: string
          email?: string | null
          full_name: string
          health_score?: number | null
          id?: string
          installments_remaining?: number | null
          lead_id?: string | null
          notes?: string | null
          offer_name?: string | null
          org_id: string
          payment_plan?: boolean | null
          renewal_conv_started?: boolean | null
          renewal_date?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          contract_value_cents?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          health_score?: number | null
          id?: string
          installments_remaining?: number | null
          lead_id?: string | null
          notes?: string | null
          offer_name?: string | null
          org_id?: string
          payment_plan?: boolean | null
          renewal_conv_started?: boolean | null
          renewal_date?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
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
          id: string
          notes: string | null
          org_id: string
          pain_point: string | null
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
          id?: string
          notes?: string | null
          org_id: string
          pain_point?: string | null
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
          id?: string
          notes?: string | null
          org_id?: string
          pain_point?: string | null
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
      leads: {
        Row: {
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
          objections_raised: string[] | null
          org_id: string
          phone: string | null
          qualification_notes: string | null
          source_connector: string | null
          status: Database["public"]["Enums"]["lead_status"]
          traffic_source_id: string | null
          updated_at: string
        }
        Insert: {
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
          objections_raised?: string[] | null
          org_id: string
          phone?: string | null
          qualification_notes?: string | null
          source_connector?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          traffic_source_id?: string | null
          updated_at?: string
        }
        Update: {
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
          objections_raised?: string[] | null
          org_id?: string
          phone?: string | null
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
      [_ in never]: never
    }
    Functions: {
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
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role: "owner" | "admin" | "closer" | "setter" | "va" | "viewer"
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
      app_role: ["owner", "admin", "closer", "setter", "va", "viewer"],
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
