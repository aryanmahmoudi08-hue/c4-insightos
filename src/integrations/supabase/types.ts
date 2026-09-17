export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      access_audit_log: {
        Row: {
          action: string;
          actor_user_id: string;
          created_at: string;
          detail: Json;
          id: string;
          org_id: string;
          target_email: string | null;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id: string;
          created_at?: string;
          detail?: Json;
          id?: string;
          org_id: string;
          target_email?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string;
          created_at?: string;
          detail?: Json;
          id?: string;
          org_id?: string;
          target_email?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "access_audit_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      acquisition_spend: {
        Row: {
          ad_account_id: string | null;
          campaign_id: string | null;
          campaign_name: string | null;
          captured_at: string;
          clicks: number | null;
          content_id: string | null;
          created_at: string;
          currency: string;
          external_record_id: string;
          id: string;
          impressions: number | null;
          is_remarketing: boolean;
          metadata: Json;
          org_id: string;
          paid_visits: number | null;
          provider: string;
          source_platform: string | null;
          source_type: string | null;
          spend_amount_cents: number | null;
          spend_date: string;
          webinar_id: string | null;
        };
        Insert: {
          ad_account_id?: string | null;
          campaign_id?: string | null;
          campaign_name?: string | null;
          captured_at?: string;
          clicks?: number | null;
          content_id?: string | null;
          created_at?: string;
          currency?: string;
          external_record_id: string;
          id?: string;
          impressions?: number | null;
          is_remarketing?: boolean;
          metadata?: Json;
          org_id: string;
          paid_visits?: number | null;
          provider: string;
          source_platform?: string | null;
          source_type?: string | null;
          spend_amount_cents?: number | null;
          spend_date: string;
          webinar_id?: string | null;
        };
        Update: {
          ad_account_id?: string | null;
          campaign_id?: string | null;
          campaign_name?: string | null;
          captured_at?: string;
          clicks?: number | null;
          content_id?: string | null;
          created_at?: string;
          currency?: string;
          external_record_id?: string;
          id?: string;
          impressions?: number | null;
          is_remarketing?: boolean;
          metadata?: Json;
          org_id?: string;
          paid_visits?: number | null;
          provider?: string;
          source_platform?: string | null;
          source_type?: string | null;
          spend_amount_cents?: number | null;
          spend_date?: string;
          webinar_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "acquisition_spend_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acquisition_spend_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acquisition_spend_webinar_id_fkey";
            columns: ["webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_insights: {
        Row: {
          body: string;
          confidence: number;
          created_at: string;
          dismissed: boolean | null;
          generated_by: string;
          id: string;
          module: string;
          org_id: string;
          recommendation: string | null;
          saved: boolean | null;
          source_refs: Json;
          title: string;
        };
        Insert: {
          body: string;
          confidence?: number;
          created_at?: string;
          dismissed?: boolean | null;
          generated_by?: string;
          id?: string;
          module: string;
          org_id: string;
          recommendation?: string | null;
          saved?: boolean | null;
          source_refs?: Json;
          title: string;
        };
        Update: {
          body?: string;
          confidence?: number;
          created_at?: string;
          dismissed?: boolean | null;
          generated_by?: string;
          id?: string;
          module?: string;
          org_id?: string;
          recommendation?: string | null;
          saved?: boolean | null;
          source_refs?: Json;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_insights_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          acknowledged: boolean | null;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          body: string | null;
          created_at: string;
          id: string;
          org_id: string;
          payload: Json | null;
          rule_key: string;
          severity: Database["public"]["Enums"]["alert_severity"];
          subject_id: string | null;
          subject_type: string | null;
          title: string;
        };
        Insert: {
          acknowledged?: boolean | null;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          payload?: Json | null;
          rule_key: string;
          severity?: Database["public"]["Enums"]["alert_severity"];
          subject_id?: string | null;
          subject_type?: string | null;
          title: string;
        };
        Update: {
          acknowledged?: boolean | null;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          payload?: Json | null;
          rule_key?: string;
          severity?: Database["public"]["Enums"]["alert_severity"];
          subject_id?: string | null;
          subject_type?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_coaching_reviews: {
        Row: {
          behavior_change: string;
          call_id: string | null;
          created_at: string;
          gap_category: string | null;
          id: string;
          org_id: string;
          rep_name: string;
          reviewer_id: string | null;
          reviewer_name: string | null;
          what_learned: string | null;
          what_went_wrong: string | null;
        };
        Insert: {
          behavior_change: string;
          call_id?: string | null;
          created_at?: string;
          gap_category?: string | null;
          id?: string;
          org_id: string;
          rep_name: string;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          what_learned?: string | null;
          what_went_wrong?: string | null;
        };
        Update: {
          behavior_change?: string;
          call_id?: string | null;
          created_at?: string;
          gap_category?: string | null;
          id?: string;
          org_id?: string;
          rep_name?: string;
          reviewer_id?: string | null;
          reviewer_name?: string | null;
          what_learned?: string | null;
          what_went_wrong?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "call_coaching_reviews_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_coaching_reviews_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "call_coaching_reviews_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_confirmations: {
        Row: {
          call_id: string;
          cancelled_reason: string | null;
          confirmed_at: string | null;
          created_at: string;
          id: string;
          morning_goal_1: string | null;
          morning_goal_2: string | null;
          morning_goal_3: string | null;
          morning_reason_for_change: string | null;
          morning_responded_at: string | null;
          morning_response_notes: string | null;
          morning_scheduled_at: string | null;
          morning_sent_at: string | null;
          night_before_responded_at: string | null;
          night_before_scheduled_at: string | null;
          night_before_sent_at: string | null;
          one_hour_responded_at: string | null;
          one_hour_scheduled_at: string | null;
          one_hour_sent_at: string | null;
          org_id: string;
          overall_status: string;
          previous_status: string | null;
          rescheduled_reason: string | null;
          ten_min_responded_at: string | null;
          ten_min_scheduled_at: string | null;
          ten_min_sent_at: string | null;
          thirty_min_confirmed: boolean;
          thirty_min_confirmed_at: string | null;
          thirty_min_scheduled_at: string | null;
          thirty_min_sent_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          call_id: string;
          cancelled_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          morning_goal_1?: string | null;
          morning_goal_2?: string | null;
          morning_goal_3?: string | null;
          morning_reason_for_change?: string | null;
          morning_responded_at?: string | null;
          morning_response_notes?: string | null;
          morning_scheduled_at?: string | null;
          morning_sent_at?: string | null;
          night_before_responded_at?: string | null;
          night_before_scheduled_at?: string | null;
          night_before_sent_at?: string | null;
          one_hour_responded_at?: string | null;
          one_hour_scheduled_at?: string | null;
          one_hour_sent_at?: string | null;
          org_id: string;
          overall_status?: string;
          previous_status?: string | null;
          rescheduled_reason?: string | null;
          ten_min_responded_at?: string | null;
          ten_min_scheduled_at?: string | null;
          ten_min_sent_at?: string | null;
          thirty_min_confirmed?: boolean;
          thirty_min_confirmed_at?: string | null;
          thirty_min_scheduled_at?: string | null;
          thirty_min_sent_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          call_id?: string;
          cancelled_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          id?: string;
          morning_goal_1?: string | null;
          morning_goal_2?: string | null;
          morning_goal_3?: string | null;
          morning_reason_for_change?: string | null;
          morning_responded_at?: string | null;
          morning_response_notes?: string | null;
          morning_scheduled_at?: string | null;
          morning_sent_at?: string | null;
          night_before_responded_at?: string | null;
          night_before_scheduled_at?: string | null;
          night_before_sent_at?: string | null;
          one_hour_responded_at?: string | null;
          one_hour_scheduled_at?: string | null;
          one_hour_sent_at?: string | null;
          org_id?: string;
          overall_status?: string;
          previous_status?: string | null;
          rescheduled_reason?: string | null;
          ten_min_responded_at?: string | null;
          ten_min_scheduled_at?: string | null;
          ten_min_sent_at?: string | null;
          thirty_min_confirmed?: boolean;
          thirty_min_confirmed_at?: string | null;
          thirty_min_scheduled_at?: string | null;
          thirty_min_sent_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "call_confirmations_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: true;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_confirmations_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: true;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "call_confirmations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_objections: {
        Row: {
          call_id: string;
          call_stage: string | null;
          category: string | null;
          created_at: string;
          id: string;
          objection: string;
          org_id: string;
          resolved: boolean | null;
        };
        Insert: {
          call_id: string;
          call_stage?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          objection: string;
          org_id: string;
          resolved?: boolean | null;
        };
        Update: {
          call_id?: string;
          call_stage?: string | null;
          category?: string | null;
          created_at?: string;
          id?: string;
          objection?: string;
          org_id?: string;
          resolved?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "call_objections_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_objections_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "call_objections_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          calendly_cancel_url: string | null;
          calendly_reschedule_url: string | null;
          call_summary: string | null;
          cancelled: boolean;
          cash_collected_cents: number | null;
          closed: boolean | null;
          closer_id: string | null;
          closer_name: string | null;
          contract_value_cents: number | null;
          created_at: string;
          deposit_cents: number | null;
          disposition: string | null;
          duration_seconds: number | null;
          eod_lead_status: string | null;
          followup_amount_pitched_cents: number | null;
          followup_notes: string | null;
          followup_reason: string | null;
          followup_reason_other: string | null;
          id: string;
          key_moment: string | null;
          lead_email: string | null;
          lead_id: string | null;
          meeting_link: string | null;
          no_show_recovered: boolean;
          offer_at: string | null;
          offer_made: boolean | null;
          org_id: string;
          original_currency: string;
          payment_plan: boolean | null;
          recording_url: string | null;
          recovered_from_call_id: string | null;
          requested_followup_at: string | null;
          scheduled_for: string | null;
          setter_id: string | null;
          showed: boolean | null;
          showed_at: string | null;
          source_campaign: string | null;
          source_content_id: string | null;
          source_format: string | null;
          source_platform: string | null;
          source_vsl_id: string | null;
          source_webinar_id: string | null;
          status: Database["public"]["Enums"]["call_status"];
          talk_seconds: number | null;
          time_to_close_seconds: number | null;
          updated_at: string;
        };
        Insert: {
          calendly_cancel_url?: string | null;
          calendly_reschedule_url?: string | null;
          call_summary?: string | null;
          cancelled?: boolean;
          cash_collected_cents?: number | null;
          closed?: boolean | null;
          closer_id?: string | null;
          closer_name?: string | null;
          contract_value_cents?: number | null;
          created_at?: string;
          deposit_cents?: number | null;
          disposition?: string | null;
          duration_seconds?: number | null;
          eod_lead_status?: string | null;
          followup_amount_pitched_cents?: number | null;
          followup_notes?: string | null;
          followup_reason?: string | null;
          followup_reason_other?: string | null;
          id?: string;
          key_moment?: string | null;
          lead_email?: string | null;
          lead_id?: string | null;
          meeting_link?: string | null;
          no_show_recovered?: boolean;
          offer_at?: string | null;
          offer_made?: boolean | null;
          org_id: string;
          original_currency?: string;
          payment_plan?: boolean | null;
          recording_url?: string | null;
          recovered_from_call_id?: string | null;
          requested_followup_at?: string | null;
          scheduled_for?: string | null;
          setter_id?: string | null;
          showed?: boolean | null;
          showed_at?: string | null;
          source_campaign?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_vsl_id?: string | null;
          source_webinar_id?: string | null;
          status?: Database["public"]["Enums"]["call_status"];
          talk_seconds?: number | null;
          time_to_close_seconds?: number | null;
          updated_at?: string;
        };
        Update: {
          calendly_cancel_url?: string | null;
          calendly_reschedule_url?: string | null;
          call_summary?: string | null;
          cancelled?: boolean;
          cash_collected_cents?: number | null;
          closed?: boolean | null;
          closer_id?: string | null;
          closer_name?: string | null;
          contract_value_cents?: number | null;
          created_at?: string;
          deposit_cents?: number | null;
          disposition?: string | null;
          duration_seconds?: number | null;
          eod_lead_status?: string | null;
          followup_amount_pitched_cents?: number | null;
          followup_notes?: string | null;
          followup_reason?: string | null;
          followup_reason_other?: string | null;
          id?: string;
          key_moment?: string | null;
          lead_email?: string | null;
          lead_id?: string | null;
          meeting_link?: string | null;
          no_show_recovered?: boolean;
          offer_at?: string | null;
          offer_made?: boolean | null;
          org_id?: string;
          original_currency?: string;
          payment_plan?: boolean | null;
          recording_url?: string | null;
          recovered_from_call_id?: string | null;
          requested_followup_at?: string | null;
          scheduled_for?: string | null;
          setter_id?: string | null;
          showed?: boolean | null;
          showed_at?: string | null;
          source_campaign?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_vsl_id?: string | null;
          source_webinar_id?: string | null;
          status?: Database["public"]["Enums"]["call_status"];
          talk_seconds?: number | null;
          time_to_close_seconds?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calls_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "calls_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_recovered_from_call_id_fkey";
            columns: ["recovered_from_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_recovered_from_call_id_fkey";
            columns: ["recovered_from_call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "calls_source_content_id_fkey";
            columns: ["source_content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_source_vsl_id_fkey";
            columns: ["source_vsl_id"];
            isOneToOne: false;
            referencedRelation: "vsls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_source_webinar_id_fkey";
            columns: ["source_webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
        ];
      };
      client_activity_events: {
        Row: {
          actor_id: string | null;
          actor_name: string | null;
          body: string | null;
          client_id: string;
          created_at: string;
          event_type: string;
          id: string;
          org_id: string;
        };
        Insert: {
          actor_id?: string | null;
          actor_name?: string | null;
          body?: string | null;
          client_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          org_id: string;
        };
        Update: {
          actor_id?: string | null;
          actor_name?: string | null;
          body?: string | null;
          client_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_activity_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_activity_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      client_wins: {
        Row: {
          body: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          magnitude: string;
          occurred_at: string;
          org_id: string;
          screenshot_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          magnitude?: string;
          occurred_at?: string;
          org_id: string;
          screenshot_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          magnitude?: string;
          occurred_at?: string;
          org_id?: string;
          screenshot_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_wins_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_wins_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          contract_value_cents: number | null;
          created_at: string;
          email: string | null;
          expected_next_payment_cents: number | null;
          expected_next_payment_date: string | null;
          full_name: string;
          health_score: number | null;
          id: string;
          installment_amount_cents: number | null;
          installments_remaining: number | null;
          invested_to_date_cents: number | null;
          lead_id: string | null;
          notes: string | null;
          offer_name: string | null;
          org_id: string;
          payment_plan: boolean | null;
          phone: string | null;
          pre_close_raw: Json | null;
          pre_close_summary: string | null;
          renewal_conv_started: boolean | null;
          renewal_date: string | null;
          renewal_stage: string;
          start_date: string;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          contract_value_cents?: number | null;
          created_at?: string;
          email?: string | null;
          expected_next_payment_cents?: number | null;
          expected_next_payment_date?: string | null;
          full_name: string;
          health_score?: number | null;
          id?: string;
          installment_amount_cents?: number | null;
          installments_remaining?: number | null;
          invested_to_date_cents?: number | null;
          lead_id?: string | null;
          notes?: string | null;
          offer_name?: string | null;
          org_id: string;
          payment_plan?: boolean | null;
          phone?: string | null;
          pre_close_raw?: Json | null;
          pre_close_summary?: string | null;
          renewal_conv_started?: boolean | null;
          renewal_date?: string | null;
          renewal_stage?: string;
          start_date?: string;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          contract_value_cents?: number | null;
          created_at?: string;
          email?: string | null;
          expected_next_payment_cents?: number | null;
          expected_next_payment_date?: string | null;
          full_name?: string;
          health_score?: number | null;
          id?: string;
          installment_amount_cents?: number | null;
          installments_remaining?: number | null;
          invested_to_date_cents?: number | null;
          lead_id?: string | null;
          notes?: string | null;
          offer_name?: string | null;
          org_id?: string;
          payment_plan?: boolean | null;
          phone?: string | null;
          pre_close_raw?: Json | null;
          pre_close_summary?: string | null;
          renewal_conv_started?: boolean | null;
          renewal_date?: string | null;
          renewal_stage?: string;
          start_date?: string;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "clients_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      confirmation_policy: {
        Row: {
          at_risk_after_hours: number;
          auto_cancel_enabled: boolean;
          auto_cancel_minutes_before: number;
          org_id: string;
          overdue_after_hours: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          at_risk_after_hours?: number;
          auto_cancel_enabled?: boolean;
          auto_cancel_minutes_before?: number;
          org_id: string;
          overdue_after_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          at_risk_after_hours?: number;
          auto_cancel_enabled?: boolean;
          auto_cancel_minutes_before?: number;
          org_id?: string;
          overdue_after_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "confirmation_policy_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      connector_connections: {
        Row: {
          config: Json;
          connector_id: string;
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          external_account_id: string | null;
          id: string;
          org_id: string;
          state: Database["public"]["Enums"]["connector_state"];
          updated_at: string;
        };
        Insert: {
          config?: Json;
          connector_id: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          external_account_id?: string | null;
          id?: string;
          org_id: string;
          state?: Database["public"]["Enums"]["connector_state"];
          updated_at?: string;
        };
        Update: {
          config?: Json;
          connector_id?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          external_account_id?: string | null;
          id?: string;
          org_id?: string;
          state?: Database["public"]["Enums"]["connector_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connector_connections_connector_id_fkey";
            columns: ["connector_id"];
            isOneToOne: false;
            referencedRelation: "connector_registry";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connector_connections_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      connector_registry: {
        Row: {
          auth_method: string;
          category: string;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_available: boolean | null;
          name: string;
          supports_events: boolean | null;
        };
        Insert: {
          auth_method?: string;
          category: string;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id: string;
          is_available?: boolean | null;
          name: string;
          supports_events?: boolean | null;
        };
        Update: {
          auth_method?: string;
          category?: string;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_available?: boolean | null;
          name?: string;
          supports_events?: boolean | null;
        };
        Relationships: [];
      };
      connector_sync_status: {
        Row: {
          connection_id: string;
          cursor: string | null;
          id: string;
          last_error: string | null;
          last_sync_at: string | null;
          next_sync_at: string | null;
          org_id: string;
          records_synced: number | null;
          resource: string;
          state: Database["public"]["Enums"]["connector_state"];
          updated_at: string;
        };
        Insert: {
          connection_id: string;
          cursor?: string | null;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          next_sync_at?: string | null;
          org_id: string;
          records_synced?: number | null;
          resource: string;
          state?: Database["public"]["Enums"]["connector_state"];
          updated_at?: string;
        };
        Update: {
          connection_id?: string;
          cursor?: string | null;
          id?: string;
          last_error?: string | null;
          last_sync_at?: string | null;
          next_sync_at?: string | null;
          org_id?: string;
          records_synced?: number | null;
          resource?: string;
          state?: Database["public"]["Enums"]["connector_state"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connector_sync_status_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connector_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connector_sync_status_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      content_metrics: {
        Row: {
          avg_watch_pct: number | null;
          calls_booked: number | null;
          captured_at: string;
          cash_collected_cents: number | null;
          cash_per_1k_views_cents: number | null;
          closes: number | null;
          comments: number | null;
          content_id: string;
          cta_conversion_pct: number | null;
          dms_generated: number | null;
          drop_off_rate_pct: number | null;
          drop_off_seconds: number | null;
          engagement_rate_pct: number | null;
          follower_view_ratio: number | null;
          follower_views: number | null;
          followers_gained: number | null;
          hook_retention_pct: number | null;
          icp_attraction_score: number | null;
          id: string;
          leads_generated: number | null;
          leads_per_1k_views: number | null;
          likes: number | null;
          non_follower_views: number | null;
          org_id: string;
          profile_visits: number | null;
          qualified_follower_ratio: number | null;
          qualified_followers_gained: number | null;
          raw: Json | null;
          reach: number | null;
          saves: number | null;
          shares: number | null;
          ten_sec_retention_pct: number | null;
          three_sec_hold_pct: number | null;
          views: number | null;
          watch_time_seconds: number | null;
        };
        Insert: {
          avg_watch_pct?: number | null;
          calls_booked?: number | null;
          captured_at?: string;
          cash_collected_cents?: number | null;
          cash_per_1k_views_cents?: number | null;
          closes?: number | null;
          comments?: number | null;
          content_id: string;
          cta_conversion_pct?: number | null;
          dms_generated?: number | null;
          drop_off_rate_pct?: number | null;
          drop_off_seconds?: number | null;
          engagement_rate_pct?: number | null;
          follower_view_ratio?: number | null;
          follower_views?: number | null;
          followers_gained?: number | null;
          hook_retention_pct?: number | null;
          icp_attraction_score?: number | null;
          id?: string;
          leads_generated?: number | null;
          leads_per_1k_views?: number | null;
          likes?: number | null;
          non_follower_views?: number | null;
          org_id: string;
          profile_visits?: number | null;
          qualified_follower_ratio?: number | null;
          qualified_followers_gained?: number | null;
          raw?: Json | null;
          reach?: number | null;
          saves?: number | null;
          shares?: number | null;
          ten_sec_retention_pct?: number | null;
          three_sec_hold_pct?: number | null;
          views?: number | null;
          watch_time_seconds?: number | null;
        };
        Update: {
          avg_watch_pct?: number | null;
          calls_booked?: number | null;
          captured_at?: string;
          cash_collected_cents?: number | null;
          cash_per_1k_views_cents?: number | null;
          closes?: number | null;
          comments?: number | null;
          content_id?: string;
          cta_conversion_pct?: number | null;
          dms_generated?: number | null;
          drop_off_rate_pct?: number | null;
          drop_off_seconds?: number | null;
          engagement_rate_pct?: number | null;
          follower_view_ratio?: number | null;
          follower_views?: number | null;
          followers_gained?: number | null;
          hook_retention_pct?: number | null;
          icp_attraction_score?: number | null;
          id?: string;
          leads_generated?: number | null;
          leads_per_1k_views?: number | null;
          likes?: number | null;
          non_follower_views?: number | null;
          org_id?: string;
          profile_visits?: number | null;
          qualified_follower_ratio?: number | null;
          qualified_followers_gained?: number | null;
          raw?: Json | null;
          reach?: number | null;
          saves?: number | null;
          shares?: number | null;
          ten_sec_retention_pct?: number | null;
          three_sec_hold_pct?: number | null;
          views?: number | null;
          watch_time_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_metrics_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_metrics_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      content_pieces: {
        Row: {
          angle: Database["public"]["Enums"]["content_angle"] | null;
          awareness_stage: Database["public"]["Enums"]["awareness_stage"] | null;
          body: string | null;
          created_at: string;
          created_by: string | null;
          cta: string | null;
          duration_seconds: number | null;
          external_id: string | null;
          funnel_stage: string | null;
          hook: string | null;
          hook_score: number | null;
          id: string;
          mechanism: string | null;
          notes: string | null;
          org_id: string;
          pain_point: string | null;
          pipeline_status: string;
          platform: Database["public"]["Enums"]["content_platform"];
          post_format: string | null;
          posted_at: string | null;
          posting_instructions: string | null;
          repurpose_plan: string | null;
          scheduled_date: string | null;
          scheduled_time: string | null;
          source_connector: string | null;
          source_platform: string | null;
          thumbnail_url: string | null;
          title: string | null;
          topic: string | null;
          updated_at: string;
          url: string | null;
          variation: string | null;
          variation_answers: Json;
          voice_notes: string | null;
          why_it_works: string | null;
        };
        Insert: {
          angle?: Database["public"]["Enums"]["content_angle"] | null;
          awareness_stage?: Database["public"]["Enums"]["awareness_stage"] | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          cta?: string | null;
          duration_seconds?: number | null;
          external_id?: string | null;
          funnel_stage?: string | null;
          hook?: string | null;
          hook_score?: number | null;
          id?: string;
          mechanism?: string | null;
          notes?: string | null;
          org_id: string;
          pain_point?: string | null;
          pipeline_status?: string;
          platform: Database["public"]["Enums"]["content_platform"];
          post_format?: string | null;
          posted_at?: string | null;
          posting_instructions?: string | null;
          repurpose_plan?: string | null;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          source_connector?: string | null;
          source_platform?: string | null;
          thumbnail_url?: string | null;
          title?: string | null;
          topic?: string | null;
          updated_at?: string;
          url?: string | null;
          variation?: string | null;
          variation_answers?: Json;
          voice_notes?: string | null;
          why_it_works?: string | null;
        };
        Update: {
          angle?: Database["public"]["Enums"]["content_angle"] | null;
          awareness_stage?: Database["public"]["Enums"]["awareness_stage"] | null;
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          cta?: string | null;
          duration_seconds?: number | null;
          external_id?: string | null;
          funnel_stage?: string | null;
          hook?: string | null;
          hook_score?: number | null;
          id?: string;
          mechanism?: string | null;
          notes?: string | null;
          org_id?: string;
          pain_point?: string | null;
          pipeline_status?: string;
          platform?: Database["public"]["Enums"]["content_platform"];
          post_format?: string | null;
          posted_at?: string | null;
          posting_instructions?: string | null;
          repurpose_plan?: string | null;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          source_connector?: string | null;
          source_platform?: string | null;
          thumbnail_url?: string | null;
          title?: string | null;
          topic?: string | null;
          updated_at?: string;
          url?: string | null;
          variation?: string | null;
          variation_answers?: Json;
          voice_notes?: string | null;
          why_it_works?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_pieces_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          channel: string;
          created_at: string;
          external_thread_id: string | null;
          first_response_seconds: number | null;
          id: string;
          last_message_at: string | null;
          lead_id: string | null;
          org_id: string;
          setter_id: string | null;
          source_tag: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          external_thread_id?: string | null;
          first_response_seconds?: number | null;
          id?: string;
          last_message_at?: string | null;
          lead_id?: string | null;
          org_id: string;
          setter_id?: string | null;
          source_tag?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          external_thread_id?: string | null;
          first_response_seconds?: number | null;
          id?: string;
          last_message_at?: string | null;
          lead_id?: string | null;
          org_id?: string;
          setter_id?: string | null;
          source_tag?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "conversations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      copy_clients: {
        Row: {
          age: number | null;
          avatar_research: Json;
          avatar_url: string | null;
          bio: string | null;
          business_stage: string | null;
          competitors: string | null;
          content_pillars: string | null;
          created_at: string;
          display_name: string;
          dream_outcome: string | null;
          goals: string | null;
          id: string;
          instagram_followers: number | null;
          instagram_handle: string | null;
          location: string | null;
          monthly_revenue_cents: number | null;
          niche: string | null;
          notes: string | null;
          offer_details: Json;
          offer_price_cents: number | null;
          org_id: string;
          proof_assets: string | null;
          sacred_cows: string | null;
          tiktok_followers: number | null;
          tiktok_handle: string | null;
          updated_at: string;
          voice_fingerprint: Json | null;
          voice_transcripts: string | null;
          youtube_handle: string | null;
          youtube_subscribers: number | null;
        };
        Insert: {
          age?: number | null;
          avatar_research?: Json;
          avatar_url?: string | null;
          bio?: string | null;
          business_stage?: string | null;
          competitors?: string | null;
          content_pillars?: string | null;
          created_at?: string;
          display_name: string;
          dream_outcome?: string | null;
          goals?: string | null;
          id?: string;
          instagram_followers?: number | null;
          instagram_handle?: string | null;
          location?: string | null;
          monthly_revenue_cents?: number | null;
          niche?: string | null;
          notes?: string | null;
          offer_details?: Json;
          offer_price_cents?: number | null;
          org_id: string;
          proof_assets?: string | null;
          sacred_cows?: string | null;
          tiktok_followers?: number | null;
          tiktok_handle?: string | null;
          updated_at?: string;
          voice_fingerprint?: Json | null;
          voice_transcripts?: string | null;
          youtube_handle?: string | null;
          youtube_subscribers?: number | null;
        };
        Update: {
          age?: number | null;
          avatar_research?: Json;
          avatar_url?: string | null;
          bio?: string | null;
          business_stage?: string | null;
          competitors?: string | null;
          content_pillars?: string | null;
          created_at?: string;
          display_name?: string;
          dream_outcome?: string | null;
          goals?: string | null;
          id?: string;
          instagram_followers?: number | null;
          instagram_handle?: string | null;
          location?: string | null;
          monthly_revenue_cents?: number | null;
          niche?: string | null;
          notes?: string | null;
          offer_details?: Json;
          offer_price_cents?: number | null;
          org_id?: string;
          proof_assets?: string | null;
          sacred_cows?: string | null;
          tiktok_followers?: number | null;
          tiktok_handle?: string | null;
          updated_at?: string;
          voice_fingerprint?: Json | null;
          voice_transcripts?: string | null;
          youtube_handle?: string | null;
          youtube_subscribers?: number | null;
        };
        Relationships: [];
      };
      copy_generations: {
        Row: {
          angle: string | null;
          client_id: string | null;
          copy_type: string;
          created_at: string;
          created_by: string | null;
          goal: string | null;
          id: string;
          org_id: string;
          output: string;
          prompt_inputs: Json;
          review_feedback: Json | null;
          review_score: number | null;
        };
        Insert: {
          angle?: string | null;
          client_id?: string | null;
          copy_type: string;
          created_at?: string;
          created_by?: string | null;
          goal?: string | null;
          id?: string;
          org_id: string;
          output: string;
          prompt_inputs?: Json;
          review_feedback?: Json | null;
          review_score?: number | null;
        };
        Update: {
          angle?: string | null;
          client_id?: string | null;
          copy_type?: string;
          created_at?: string;
          created_by?: string | null;
          goal?: string | null;
          id?: string;
          org_id?: string;
          output?: string;
          prompt_inputs?: Json;
          review_feedback?: Json | null;
          review_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "copy_generations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "copy_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      copy_swipes: {
        Row: {
          angle: string | null;
          body: string;
          copy_type: string;
          created_at: string;
          emotion: string | null;
          id: string;
          image_urls: string[];
          org_id: string;
          source: string | null;
          tags: string[];
          title: string;
          updated_at: string;
        };
        Insert: {
          angle?: string | null;
          body: string;
          copy_type: string;
          created_at?: string;
          emotion?: string | null;
          id?: string;
          image_urls?: string[];
          org_id: string;
          source?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
        };
        Update: {
          angle?: string | null;
          body?: string;
          copy_type?: string;
          created_at?: string;
          emotion?: string | null;
          id?: string;
          image_urls?: string[];
          org_id?: string;
          source?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      crm_activities: {
        Row: {
          activity_type: string;
          actor_user_id: string | null;
          body: string | null;
          created_at: string;
          id: string;
          occurred_at: string;
          org_id: string;
          payload: Json;
          source_id: string | null;
          source_type: string;
          title: string;
        };
        Insert: {
          activity_type: string;
          actor_user_id?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          org_id: string;
          payload?: Json;
          source_id?: string | null;
          source_type?: string;
          title: string;
        };
        Update: {
          activity_type?: string;
          actor_user_id?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          occurred_at?: string;
          org_id?: string;
          payload?: Json;
          source_id?: string | null;
          source_type?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_activities_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_activity_targets: {
        Row: {
          activity_id: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          org_id: string;
        };
        Insert: {
          activity_id: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          org_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_activity_targets_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "crm_activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_activity_targets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_automation_rules: {
        Row: {
          actions: Json;
          conditions: Json;
          created_at: string;
          created_by: string | null;
          description: string | null;
          entity_type: string;
          id: string;
          is_enabled: boolean;
          name: string;
          org_id: string;
          trigger_config: Json;
          trigger_type: string;
          updated_at: string;
        };
        Insert: {
          actions?: Json;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          entity_type: string;
          id?: string;
          is_enabled?: boolean;
          name: string;
          org_id: string;
          trigger_config?: Json;
          trigger_type: string;
          updated_at?: string;
        };
        Update: {
          actions?: Json;
          conditions?: Json;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          entity_type?: string;
          id?: string;
          is_enabled?: boolean;
          name?: string;
          org_id?: string;
          trigger_config?: Json;
          trigger_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_automation_rules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_automation_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          input: Json;
          org_id: string;
          result: Json;
          rule_id: string;
          started_at: string | null;
          status: string;
          trigger_entity_id: string | null;
          trigger_entity_type: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          input?: Json;
          org_id: string;
          result?: Json;
          rule_id: string;
          started_at?: string | null;
          status?: string;
          trigger_entity_id?: string | null;
          trigger_entity_type: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          input?: Json;
          org_id?: string;
          result?: Json;
          rule_id?: string;
          started_at?: string | null;
          status?: string;
          trigger_entity_id?: string | null;
          trigger_entity_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_automation_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_automation_runs_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "crm_automation_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_bulk_operations: {
        Row: {
          completed_at: string | null;
          created_at: string;
          entity_type: string;
          error_message: string | null;
          id: string;
          initiated_by: string | null;
          input: Json;
          operation_type: string;
          org_id: string;
          result: Json;
          selection_count: number;
          selection_snapshot: Json;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          entity_type: string;
          error_message?: string | null;
          id?: string;
          initiated_by?: string | null;
          input?: Json;
          operation_type: string;
          org_id: string;
          result?: Json;
          selection_count: number;
          selection_snapshot?: Json;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          entity_type?: string;
          error_message?: string | null;
          id?: string;
          initiated_by?: string | null;
          input?: Json;
          operation_type?: string;
          org_id?: string;
          result?: Json;
          selection_count?: number;
          selection_snapshot?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_bulk_operations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_call_recordings: {
        Row: {
          call_session_id: string | null;
          content_type: string | null;
          created_at: string;
          duration_seconds: number | null;
          external_recording_id: string | null;
          id: string;
          legacy_call_id: string | null;
          metadata: Json;
          org_id: string;
          provider: string;
          recording_url: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          call_session_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          external_recording_id?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          metadata?: Json;
          org_id: string;
          provider: string;
          recording_url?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          call_session_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          external_recording_id?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          metadata?: Json;
          org_id?: string;
          provider?: string;
          recording_url?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_call_recordings_call_session_id_fkey";
            columns: ["call_session_id"];
            isOneToOne: false;
            referencedRelation: "crm_call_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_recordings_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_recordings_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "crm_call_recordings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_call_sessions: {
        Row: {
          account_id: string | null;
          answered_at: string | null;
          completed_at: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          direction: string;
          disposition: string | null;
          duration_seconds: number | null;
          external_call_id: string | null;
          from_address: string | null;
          id: string;
          legacy_call_id: string | null;
          legacy_lead_id: string | null;
          metadata: Json;
          notes: string | null;
          opportunity_id: string | null;
          org_id: string;
          provider: string;
          started_at: string | null;
          status: string;
          thread_id: string | null;
          to_address: string | null;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          answered_at?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          direction: string;
          disposition?: string | null;
          duration_seconds?: number | null;
          external_call_id?: string | null;
          from_address?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_lead_id?: string | null;
          metadata?: Json;
          notes?: string | null;
          opportunity_id?: string | null;
          org_id: string;
          provider: string;
          started_at?: string | null;
          status?: string;
          thread_id?: string | null;
          to_address?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          answered_at?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          direction?: string;
          disposition?: string | null;
          duration_seconds?: number | null;
          external_call_id?: string | null;
          from_address?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_lead_id?: string | null;
          metadata?: Json;
          notes?: string | null;
          opportunity_id?: string | null;
          org_id?: string;
          provider?: string;
          started_at?: string | null;
          status?: string;
          thread_id?: string | null;
          to_address?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_call_sessions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "crm_call_sessions_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "crm_call_sessions_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "crm_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_call_sessions_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_communication_accounts: {
        Row: {
          address_value: string;
          channel: string;
          connection_status: string;
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          external_account_id: string | null;
          id: string;
          is_default: boolean;
          last_synced_at: string | null;
          org_id: string;
          provider: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          address_value: string;
          channel: string;
          connection_status?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          external_account_id?: string | null;
          id?: string;
          is_default?: boolean;
          last_synced_at?: string | null;
          org_id: string;
          provider: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          address_value?: string;
          channel?: string;
          connection_status?: string;
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          external_account_id?: string | null;
          id?: string;
          is_default?: boolean;
          last_synced_at?: string | null;
          org_id?: string;
          provider?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_communication_accounts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_communication_deliveries: {
        Row: {
          created_at: string;
          delivery_status: string;
          error_code: string | null;
          error_message: string | null;
          external_event_id: string;
          id: string;
          message_id: string;
          occurred_at: string;
          org_id: string;
          payload: Json;
          provider: string;
        };
        Insert: {
          created_at?: string;
          delivery_status: string;
          error_code?: string | null;
          error_message?: string | null;
          external_event_id: string;
          id?: string;
          message_id: string;
          occurred_at?: string;
          org_id: string;
          payload?: Json;
          provider: string;
        };
        Update: {
          created_at?: string;
          delivery_status?: string;
          error_code?: string | null;
          error_message?: string | null;
          external_event_id?: string;
          id?: string;
          message_id?: string;
          occurred_at?: string;
          org_id?: string;
          payload?: Json;
          provider?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_communication_deliveries_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_deliveries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_communication_messages: {
        Row: {
          account_id: string | null;
          bcc_addresses: Json;
          body_html: string | null;
          body_text: string | null;
          cc_addresses: Json;
          created_at: string;
          created_by: string | null;
          direction: string;
          error_message: string | null;
          external_message_id: string | null;
          from_address: string | null;
          id: string;
          metadata: Json;
          org_id: string;
          provider: string;
          received_at: string | null;
          sent_at: string | null;
          status: string;
          subject: string | null;
          thread_id: string;
          to_addresses: Json;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          bcc_addresses?: Json;
          body_html?: string | null;
          body_text?: string | null;
          cc_addresses?: Json;
          created_at?: string;
          created_by?: string | null;
          direction: string;
          error_message?: string | null;
          external_message_id?: string | null;
          from_address?: string | null;
          id?: string;
          metadata?: Json;
          org_id: string;
          provider: string;
          received_at?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          thread_id: string;
          to_addresses?: Json;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          bcc_addresses?: Json;
          body_html?: string | null;
          body_text?: string | null;
          cc_addresses?: Json;
          created_at?: string;
          created_by?: string | null;
          direction?: string;
          error_message?: string | null;
          external_message_id?: string | null;
          from_address?: string | null;
          id?: string;
          metadata?: Json;
          org_id?: string;
          provider?: string;
          received_at?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          thread_id?: string;
          to_addresses?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_communication_messages_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_communication_participants: {
        Row: {
          address_value: string;
          contact_id: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          org_id: string;
          participant_role: string;
          thread_id: string;
        };
        Insert: {
          address_value: string;
          contact_id?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          org_id: string;
          participant_role?: string;
          thread_id: string;
        };
        Update: {
          address_value?: string;
          contact_id?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          org_id?: string;
          participant_role?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_communication_participants_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_participants_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_participants_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_communication_threads: {
        Row: {
          account_id: string | null;
          assigned_user_id: string | null;
          channel: string;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          external_thread_id: string | null;
          id: string;
          last_message_at: string | null;
          legacy_lead_id: string | null;
          metadata: Json;
          opportunity_id: string | null;
          org_id: string;
          status: string;
          subject: string | null;
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          assigned_user_id?: string | null;
          channel: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          external_thread_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          legacy_lead_id?: string | null;
          metadata?: Json;
          opportunity_id?: string | null;
          org_id: string;
          status?: string;
          subject?: string | null;
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          assigned_user_id?: string | null;
          channel?: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          external_thread_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          legacy_lead_id?: string | null;
          metadata?: Json;
          opportunity_id?: string | null;
          org_id?: string;
          status?: string;
          subject?: string | null;
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_communication_threads_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "crm_communication_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_threads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "crm_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_threads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_threads_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "crm_communication_threads_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_threads_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "crm_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_communication_threads_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_companies: {
        Row: {
          created_at: string;
          description: string | null;
          domain: string | null;
          id: string;
          industry: string | null;
          name: string;
          org_id: string;
          owner_user_id: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          domain?: string | null;
          id?: string;
          industry?: string | null;
          name: string;
          org_id: string;
          owner_user_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          domain?: string | null;
          id?: string;
          industry?: string | null;
          name?: string;
          org_id?: string;
          owner_user_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_companies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_company_contacts: {
        Row: {
          company_id: string;
          contact_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          org_id: string;
          title: string | null;
        };
        Insert: {
          company_id: string;
          contact_id: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          org_id: string;
          title?: string | null;
        };
        Update: {
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          org_id?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_company_contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "crm_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_company_contacts_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_company_contacts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_contacts: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          legacy_lead_id: string | null;
          lifecycle_status: string;
          org_id: string;
          owner_user_id: string | null;
          primary_email: string | null;
          primary_phone: string | null;
          social_handle: string | null;
          source: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          legacy_lead_id?: string | null;
          lifecycle_status?: string;
          org_id: string;
          owner_user_id?: string | null;
          primary_email?: string | null;
          primary_phone?: string | null;
          social_handle?: string | null;
          source?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          legacy_lead_id?: string | null;
          lifecycle_status?: string;
          org_id?: string;
          owner_user_id?: string | null;
          primary_email?: string | null;
          primary_phone?: string | null;
          social_handle?: string | null;
          source?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_contacts_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: true;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "crm_contacts_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: true;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_contacts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_custom_field_definitions: {
        Row: {
          created_at: string;
          entity_type: string;
          field_type: string;
          id: string;
          is_archived: boolean;
          is_required: boolean;
          key: string;
          label: string;
          options: Json;
          org_id: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entity_type: string;
          field_type: string;
          id?: string;
          is_archived?: boolean;
          is_required?: boolean;
          key: string;
          label: string;
          options?: Json;
          org_id: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entity_type?: string;
          field_type?: string;
          id?: string;
          is_archived?: boolean;
          is_required?: boolean;
          key?: string;
          label?: string;
          options?: Json;
          org_id?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_custom_field_definitions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_custom_field_values: {
        Row: {
          created_at: string;
          definition_id: string;
          entity_id: string;
          entity_type: string;
          id: string;
          org_id: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          created_at?: string;
          definition_id: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          org_id: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          created_at?: string;
          definition_id?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "crm_custom_field_values_definition_id_fkey";
            columns: ["definition_id"];
            isOneToOne: false;
            referencedRelation: "crm_custom_field_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_custom_field_values_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_external_events: {
        Row: {
          created_at: string;
          error_message: string | null;
          event_type: string;
          external_event_id: string;
          id: string;
          org_id: string;
          payload: Json;
          processed_at: string | null;
          processing_status: string;
          provider: string;
          received_at: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          event_type: string;
          external_event_id: string;
          id?: string;
          org_id: string;
          payload?: Json;
          processed_at?: string | null;
          processing_status?: string;
          provider: string;
          received_at?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          event_type?: string;
          external_event_id?: string;
          id?: string;
          org_id?: string;
          payload?: Json;
          processed_at?: string | null;
          processing_status?: string;
          provider?: string;
          received_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_external_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_legacy_links: {
        Row: {
          created_at: string;
          crm_entity_id: string;
          crm_entity_type: string;
          id: string;
          legacy_entity_id: string;
          legacy_entity_type: string;
          org_id: string;
          relationship_type: string;
        };
        Insert: {
          created_at?: string;
          crm_entity_id: string;
          crm_entity_type: string;
          id?: string;
          legacy_entity_id: string;
          legacy_entity_type: string;
          org_id: string;
          relationship_type?: string;
        };
        Update: {
          created_at?: string;
          crm_entity_id?: string;
          crm_entity_type?: string;
          id?: string;
          legacy_entity_id?: string;
          legacy_entity_type?: string;
          org_id?: string;
          relationship_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_legacy_links_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_legacy_stage_mappings: {
        Row: {
          created_at: string;
          id: string;
          legacy_entity_type: string;
          legacy_value: string;
          lifecycle_status: string | null;
          notes: string | null;
          org_id: string;
          pipeline_id: string | null;
          pipeline_stage_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          legacy_entity_type: string;
          legacy_value: string;
          lifecycle_status?: string | null;
          notes?: string | null;
          org_id: string;
          pipeline_id?: string | null;
          pipeline_stage_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          legacy_entity_type?: string;
          legacy_value?: string;
          lifecycle_status?: string | null;
          notes?: string | null;
          org_id?: string;
          pipeline_id?: string | null;
          pipeline_stage_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_legacy_stage_mappings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_legacy_stage_mappings_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_legacy_stage_mappings_pipeline_stage_id_fkey";
            columns: ["pipeline_stage_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_notes: {
        Row: {
          author_user_id: string | null;
          body: string;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          id: string;
          legacy_lead_id: string | null;
          legacy_lead_note_id: string | null;
          opportunity_id: string | null;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          author_user_id?: string | null;
          body: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          legacy_lead_id?: string | null;
          legacy_lead_note_id?: string | null;
          opportunity_id?: string | null;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          author_user_id?: string | null;
          body?: string;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          legacy_lead_id?: string | null;
          legacy_lead_note_id?: string | null;
          opportunity_id?: string | null;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_notes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "crm_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_notes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_notes_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "crm_notes_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_notes_legacy_lead_note_id_fkey";
            columns: ["legacy_lead_note_id"];
            isOneToOne: true;
            referencedRelation: "lead_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_notes_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "crm_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_notes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_opportunities: {
        Row: {
          amount_cents: number;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string;
          expected_close_date: string | null;
          id: string;
          legacy_call_id: string | null;
          legacy_client_id: string | null;
          lost_at: string | null;
          lost_reason: string | null;
          name: string;
          org_id: string;
          owner_user_id: string | null;
          pipeline_id: string;
          pipeline_stage_id: string;
          probability: number | null;
          source: string | null;
          status: string;
          updated_at: string;
          won_at: string | null;
        };
        Insert: {
          amount_cents?: number;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          expected_close_date?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_client_id?: string | null;
          lost_at?: string | null;
          lost_reason?: string | null;
          name: string;
          org_id: string;
          owner_user_id?: string | null;
          pipeline_id: string;
          pipeline_stage_id: string;
          probability?: number | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          won_at?: string | null;
        };
        Update: {
          amount_cents?: number;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          expected_close_date?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_client_id?: string | null;
          lost_at?: string | null;
          lost_reason?: string | null;
          name?: string;
          org_id?: string;
          owner_user_id?: string | null;
          pipeline_id?: string;
          pipeline_stage_id?: string;
          probability?: number | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
          won_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "crm_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: true;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: true;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "crm_opportunities_legacy_client_id_fkey";
            columns: ["legacy_client_id"];
            isOneToOne: true;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_opportunities_pipeline_stage_id_fkey";
            columns: ["pipeline_stage_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_pipeline_stages: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          is_archived: boolean;
          is_closed_lost: boolean;
          is_closed_won: boolean;
          name: string;
          org_id: string;
          pipeline_id: string;
          position: number;
          probability: number;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          is_closed_lost?: boolean;
          is_closed_won?: boolean;
          name: string;
          org_id: string;
          pipeline_id: string;
          position?: number;
          probability?: number;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          is_closed_lost?: boolean;
          is_closed_won?: boolean;
          name?: string;
          org_id?: string;
          pipeline_id?: string;
          position?: number;
          probability?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_pipelines: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_archived: boolean;
          is_default: boolean;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_saved_views: {
        Row: {
          columns: Json;
          created_at: string;
          description: string | null;
          entity_type: string;
          filters: Json;
          id: string;
          is_default: boolean;
          name: string;
          org_id: string;
          owner_user_id: string | null;
          sort: Json;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          columns?: Json;
          created_at?: string;
          description?: string | null;
          entity_type: string;
          filters?: Json;
          id?: string;
          is_default?: boolean;
          name: string;
          org_id: string;
          owner_user_id?: string | null;
          sort?: Json;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          columns?: Json;
          created_at?: string;
          description?: string | null;
          entity_type?: string;
          filters?: Json;
          id?: string;
          is_default?: boolean;
          name?: string;
          org_id?: string;
          owner_user_id?: string | null;
          sort?: Json;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_saved_views_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_tasks: {
        Row: {
          assignee_user_id: string | null;
          company_id: string | null;
          completed_at: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_at: string | null;
          id: string;
          legacy_call_id: string | null;
          legacy_lead_id: string | null;
          opportunity_id: string | null;
          org_id: string;
          priority: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assignee_user_id?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_lead_id?: string | null;
          opportunity_id?: string | null;
          org_id: string;
          priority?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assignee_user_id?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          legacy_call_id?: string | null;
          legacy_lead_id?: string | null;
          opportunity_id?: string | null;
          org_id?: string;
          priority?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_tasks_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "crm_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tasks_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "crm_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tasks_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tasks_legacy_call_id_fkey";
            columns: ["legacy_call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "crm_tasks_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "crm_tasks_legacy_lead_id_fkey";
            columns: ["legacy_lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tasks_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "crm_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_wins: {
        Row: {
          blocker: string | null;
          client_id: string | null;
          created_at: string;
          energy_score: number | null;
          financial_amount_cents: number | null;
          financial_source: string | null;
          id: string;
          org_id: string;
          priority: string;
          proof_url: string | null;
          source: string;
          student_name: string;
          tomorrow_needle_mover: string | null;
          updated_at: string;
          win_date: string;
          win_description: string;
          win_types: string[];
          work_done: string | null;
          yesterday_commitment: string | null;
          yesterday_status: string;
        };
        Insert: {
          blocker?: string | null;
          client_id?: string | null;
          created_at?: string;
          energy_score?: number | null;
          financial_amount_cents?: number | null;
          financial_source?: string | null;
          id?: string;
          org_id: string;
          priority?: string;
          proof_url?: string | null;
          source?: string;
          student_name: string;
          tomorrow_needle_mover?: string | null;
          updated_at?: string;
          win_date?: string;
          win_description: string;
          win_types?: string[];
          work_done?: string | null;
          yesterday_commitment?: string | null;
          yesterday_status?: string;
        };
        Update: {
          blocker?: string | null;
          client_id?: string | null;
          created_at?: string;
          energy_score?: number | null;
          financial_amount_cents?: number | null;
          financial_source?: string | null;
          id?: string;
          org_id?: string;
          priority?: string;
          proof_url?: string | null;
          source?: string;
          student_name?: string;
          tomorrow_needle_mover?: string | null;
          updated_at?: string;
          win_date?: string;
          win_description?: string;
          win_types?: string[];
          work_done?: string | null;
          yesterday_commitment?: string | null;
          yesterday_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_wins_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_wins_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      dashboard_widgets: {
        Row: {
          config: Json;
          created_at: string;
          dashboard: string;
          id: string;
          metric_key: string | null;
          org_id: string;
          position: number;
          title: string;
          updated_at: string;
          user_id: string | null;
          widget_type: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          dashboard?: string;
          id?: string;
          metric_key?: string | null;
          org_id: string;
          position?: number;
          title: string;
          updated_at?: string;
          user_id?: string | null;
          widget_type: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          dashboard?: string;
          id?: string;
          metric_key?: string | null;
          org_id?: string;
          position?: number;
          title?: string;
          updated_at?: string;
          user_id?: string | null;
          widget_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      eod_submissions: {
        Row: {
          external_submission_id: string | null;
          form_provider: string;
          id: string;
          last_error: string | null;
          org_id: string;
          payload: Json;
          processed_at: string | null;
          processing_attempts: number;
          received_at: string;
          submission_status: string;
          submitter_id: string | null;
        };
        Insert: {
          external_submission_id?: string | null;
          form_provider?: string;
          id?: string;
          last_error?: string | null;
          org_id: string;
          payload?: Json;
          processed_at?: string | null;
          processing_attempts?: number;
          received_at?: string;
          submission_status?: string;
          submitter_id?: string | null;
        };
        Update: {
          external_submission_id?: string | null;
          form_provider?: string;
          id?: string;
          last_error?: string | null;
          org_id?: string;
          payload?: Json;
          processed_at?: string | null;
          processing_attempts?: number;
          received_at?: string;
          submission_status?: string;
          submitter_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "eod_submissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          occurred_at: string;
          org_id: string;
          payload: Json;
          subject_id: string | null;
          subject_type: string | null;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          occurred_at?: string;
          org_id: string;
          payload?: Json;
          subject_id?: string | null;
          subject_type?: string | null;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          org_id?: string;
          payload?: Json;
          subject_id?: string | null;
          subject_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      faq_videos: {
        Row: {
          active: boolean;
          avg_watch_pct: number;
          clicks: number;
          created_at: string;
          id: string;
          mechanism: string | null;
          notes: string | null;
          org_id: string;
          plays: number;
          question: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
          wistia_video_id: string | null;
        };
        Insert: {
          active?: boolean;
          avg_watch_pct?: number;
          clicks?: number;
          created_at?: string;
          id?: string;
          mechanism?: string | null;
          notes?: string | null;
          org_id: string;
          plays?: number;
          question?: string | null;
          title: string;
          updated_at?: string;
          video_url?: string | null;
          wistia_video_id?: string | null;
        };
        Update: {
          active?: boolean;
          avg_watch_pct?: number;
          clicks?: number;
          created_at?: string;
          id?: string;
          mechanism?: string | null;
          notes?: string | null;
          org_id?: string;
          plays?: number;
          question?: string | null;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
          wistia_video_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "faq_videos_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      formula_variables: {
        Row: {
          aggregation: string;
          description: string | null;
          display_name: string;
          id: string;
          is_currency: boolean | null;
          scope: Database["public"]["Enums"]["metric_scope"];
          source_column: string;
          source_table: string;
        };
        Insert: {
          aggregation?: string;
          description?: string | null;
          display_name: string;
          id: string;
          is_currency?: boolean | null;
          scope?: Database["public"]["Enums"]["metric_scope"];
          source_column: string;
          source_table: string;
        };
        Update: {
          aggregation?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          is_currency?: boolean | null;
          scope?: Database["public"]["Enums"]["metric_scope"];
          source_column?: string;
          source_table?: string;
        };
        Relationships: [];
      };
      fx_rates: {
        Row: {
          base_currency: string;
          created_at: string;
          id: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
          source: string;
        };
        Insert: {
          base_currency?: string;
          created_at?: string;
          id?: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
          source?: string;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          id?: string;
          quote_currency?: string;
          rate?: number;
          rate_date?: string;
          source?: string;
        };
        Relationships: [];
      };
      hiring_applicants: {
        Row: {
          ai_reasoning: string | null;
          ai_recommended_stage: string | null;
          ai_score: number | null;
          ai_stated_role: string | null;
          ai_transcript_summary: string | null;
          applied_at: string;
          audio_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          historical_cash_collected_cents: number | null;
          id: string;
          last_shown_at: string | null;
          loom_transcript: string | null;
          loom_url: string | null;
          niche: string | null;
          notes: string | null;
          org_id: string;
          phone: string | null;
          portfolio_url: string | null;
          recent_monthly_cash_collected_cents: number | null;
          region: string | null;
          responses: Json;
          resume_url: string | null;
          role_applied: string;
          source: string | null;
          stage: string;
          updated_at: string;
          years_experience: number | null;
        };
        Insert: {
          ai_reasoning?: string | null;
          ai_recommended_stage?: string | null;
          ai_score?: number | null;
          ai_stated_role?: string | null;
          ai_transcript_summary?: string | null;
          applied_at?: string;
          audio_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          historical_cash_collected_cents?: number | null;
          id?: string;
          last_shown_at?: string | null;
          loom_transcript?: string | null;
          loom_url?: string | null;
          niche?: string | null;
          notes?: string | null;
          org_id: string;
          phone?: string | null;
          portfolio_url?: string | null;
          recent_monthly_cash_collected_cents?: number | null;
          region?: string | null;
          responses?: Json;
          resume_url?: string | null;
          role_applied?: string;
          source?: string | null;
          stage?: string;
          updated_at?: string;
          years_experience?: number | null;
        };
        Update: {
          ai_reasoning?: string | null;
          ai_recommended_stage?: string | null;
          ai_score?: number | null;
          ai_stated_role?: string | null;
          ai_transcript_summary?: string | null;
          applied_at?: string;
          audio_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          historical_cash_collected_cents?: number | null;
          id?: string;
          last_shown_at?: string | null;
          loom_transcript?: string | null;
          loom_url?: string | null;
          niche?: string | null;
          notes?: string | null;
          org_id?: string;
          phone?: string | null;
          portfolio_url?: string | null;
          recent_monthly_cash_collected_cents?: number | null;
          region?: string | null;
          responses?: Json;
          resume_url?: string | null;
          role_applied?: string;
          source?: string | null;
          stage?: string;
          updated_at?: string;
          years_experience?: number | null;
        };
        Relationships: [];
      };
      ingestion_jobs: {
        Row: {
          attempt: number;
          connection_id: string | null;
          created_at: string;
          id: string;
          job_type: string;
          last_error: string | null;
          max_attempts: number;
          next_retry_at: string | null;
          org_id: string;
          payload: Json | null;
          scheduled_for: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt?: number;
          connection_id?: string | null;
          created_at?: string;
          id?: string;
          job_type: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string | null;
          org_id: string;
          payload?: Json | null;
          scheduled_for?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt?: number;
          connection_id?: string | null;
          created_at?: string;
          id?: string;
          job_type?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string | null;
          org_id?: string;
          payload?: Json | null;
          scheduled_for?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connector_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingestion_jobs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_call_transcripts: {
        Row: {
          call_type: string;
          created_at: string;
          id: string;
          lead_id: string;
          org_id: string;
          source: string | null;
          transcript: string;
          updated_at: string;
        };
        Insert: {
          call_type?: string;
          created_at?: string;
          id?: string;
          lead_id: string;
          org_id: string;
          source?: string | null;
          transcript: string;
          updated_at?: string;
        };
        Update: {
          call_type?: string;
          created_at?: string;
          id?: string;
          lead_id?: string;
          org_id?: string;
          source?: string | null;
          transcript?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_call_transcripts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "lead_call_transcripts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_call_transcripts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_classification_rules: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          operator: string;
          org_id: string;
          priority: number;
          threshold_cents: number;
          tier_key: string;
          typeform_field_key: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          operator: string;
          org_id: string;
          priority?: number;
          threshold_cents: number;
          tier_key: string;
          typeform_field_key: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          operator?: string;
          org_id?: string;
          priority?: number;
          threshold_cents?: number;
          tier_key?: string;
          typeform_field_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_classification_rules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_classification_rules_org_id_tier_key_fkey";
            columns: ["org_id", "tier_key"];
            isOneToOne: false;
            referencedRelation: "offer_tiers";
            referencedColumns: ["org_id", "key"];
          },
        ];
      };
      lead_content_touches: {
        Row: {
          content_id: string;
          id: string;
          lead_id: string;
          org_id: string;
          touch_type: string | null;
          touched_at: string;
        };
        Insert: {
          content_id: string;
          id?: string;
          lead_id: string;
          org_id: string;
          touch_type?: string | null;
          touched_at?: string;
        };
        Update: {
          content_id?: string;
          id?: string;
          lead_id?: string;
          org_id?: string;
          touch_type?: string | null;
          touched_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_content_touches_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_content_touches_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "lead_content_touches_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_content_touches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          lead_id: string;
          occurred_at: string;
          org_id: string;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          lead_id: string;
          occurred_at?: string;
          org_id: string;
          payload?: Json;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          lead_id?: string;
          occurred_at?: string;
          org_id?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_notes: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          kind: string;
          lead_id: string;
          org_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: string;
          kind?: string;
          lead_id: string;
          org_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          lead_id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_notes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_response_events: {
        Row: {
          booked_call: boolean | null;
          call_id: string | null;
          campaign: string | null;
          client_id: string | null;
          closed: boolean | null;
          connected: boolean | null;
          content_id: string | null;
          created_at: string;
          event_at: string | null;
          event_log: Json;
          event_type: string | null;
          first_attempt_at: string | null;
          first_connection_at: string | null;
          format: string | null;
          id: string;
          lead_assigned_at: string | null;
          lead_created_at: string | null;
          lead_id: string;
          lead_source: string | null;
          offer: boolean | null;
          org_id: string;
          payment_id: string | null;
          qualified: boolean | null;
          rep_id: string | null;
          set: boolean | null;
          showed: boolean | null;
          source_platform: string | null;
          updated_at: string;
          webinar_id: string | null;
        };
        Insert: {
          booked_call?: boolean | null;
          call_id?: string | null;
          campaign?: string | null;
          client_id?: string | null;
          closed?: boolean | null;
          connected?: boolean | null;
          content_id?: string | null;
          created_at?: string;
          event_at?: string | null;
          event_log?: Json;
          event_type?: string | null;
          first_attempt_at?: string | null;
          first_connection_at?: string | null;
          format?: string | null;
          id?: string;
          lead_assigned_at?: string | null;
          lead_created_at?: string | null;
          lead_id: string;
          lead_source?: string | null;
          offer?: boolean | null;
          org_id: string;
          payment_id?: string | null;
          qualified?: boolean | null;
          rep_id?: string | null;
          set?: boolean | null;
          showed?: boolean | null;
          source_platform?: string | null;
          updated_at?: string;
          webinar_id?: string | null;
        };
        Update: {
          booked_call?: boolean | null;
          call_id?: string | null;
          campaign?: string | null;
          client_id?: string | null;
          closed?: boolean | null;
          connected?: boolean | null;
          content_id?: string | null;
          created_at?: string;
          event_at?: string | null;
          event_log?: Json;
          event_type?: string | null;
          first_attempt_at?: string | null;
          first_connection_at?: string | null;
          format?: string | null;
          id?: string;
          lead_assigned_at?: string | null;
          lead_created_at?: string | null;
          lead_id?: string;
          lead_source?: string | null;
          offer?: boolean | null;
          org_id?: string;
          payment_id?: string | null;
          qualified?: boolean | null;
          rep_id?: string | null;
          set?: boolean | null;
          showed?: boolean | null;
          source_platform?: string | null;
          updated_at?: string;
          webinar_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_response_events_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_response_events_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "lead_response_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_response_events_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_response_events_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_response_events_webinar_id_fkey";
            columns: ["webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_video_links: {
        Row: {
          created_at: string;
          id: string;
          lead_id: string;
          opened_at: string | null;
          org_id: string;
          token: string;
          vsl_kind: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lead_id: string;
          opened_at?: string | null;
          org_id: string;
          token: string;
          vsl_kind?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lead_id?: string;
          opened_at?: string | null;
          org_id?: string;
          token?: string;
          vsl_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_video_links_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "lead_video_links_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_video_links_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          application_data: Json;
          assigned_setter_id: string | null;
          beliefs: string | null;
          created_at: string;
          email: string | null;
          engagement_score: number | null;
          estimated_close_probability: number | null;
          external_id: string | null;
          first_touch_at: string | null;
          first_touch_content_id: string | null;
          full_name: string | null;
          handle: string | null;
          id: string;
          intent_score: number | null;
          notes: string | null;
          objections_raised: string[] | null;
          org_id: string;
          phone: string | null;
          pipeline_stage: string | null;
          precall_assets_sent_at: string | null;
          precall_video_watched: boolean;
          priority: string;
          qualification_notes: string | null;
          source_campaign: string | null;
          source_connector: string | null;
          source_content_id: string | null;
          source_format: string | null;
          source_platform: string | null;
          source_vsl_id: string | null;
          source_webinar_id: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          tags: string[];
          ticket_tier: string | null;
          ticket_tier_classified_at: string | null;
          ticket_tier_raw_value: string | null;
          ticket_tier_rule_id: string | null;
          traffic_source_id: string | null;
          updated_at: string;
        };
        Insert: {
          application_data?: Json;
          assigned_setter_id?: string | null;
          beliefs?: string | null;
          created_at?: string;
          email?: string | null;
          engagement_score?: number | null;
          estimated_close_probability?: number | null;
          external_id?: string | null;
          first_touch_at?: string | null;
          first_touch_content_id?: string | null;
          full_name?: string | null;
          handle?: string | null;
          id?: string;
          intent_score?: number | null;
          notes?: string | null;
          objections_raised?: string[] | null;
          org_id: string;
          phone?: string | null;
          pipeline_stage?: string | null;
          precall_assets_sent_at?: string | null;
          precall_video_watched?: boolean;
          priority?: string;
          qualification_notes?: string | null;
          source_campaign?: string | null;
          source_connector?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_vsl_id?: string | null;
          source_webinar_id?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          tags?: string[];
          ticket_tier?: string | null;
          ticket_tier_classified_at?: string | null;
          ticket_tier_raw_value?: string | null;
          ticket_tier_rule_id?: string | null;
          traffic_source_id?: string | null;
          updated_at?: string;
        };
        Update: {
          application_data?: Json;
          assigned_setter_id?: string | null;
          beliefs?: string | null;
          created_at?: string;
          email?: string | null;
          engagement_score?: number | null;
          estimated_close_probability?: number | null;
          external_id?: string | null;
          first_touch_at?: string | null;
          first_touch_content_id?: string | null;
          full_name?: string | null;
          handle?: string | null;
          id?: string;
          intent_score?: number | null;
          notes?: string | null;
          objections_raised?: string[] | null;
          org_id?: string;
          phone?: string | null;
          pipeline_stage?: string | null;
          precall_assets_sent_at?: string | null;
          precall_video_watched?: boolean;
          priority?: string;
          qualification_notes?: string | null;
          source_campaign?: string | null;
          source_connector?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_vsl_id?: string | null;
          source_webinar_id?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          tags?: string[];
          ticket_tier?: string | null;
          ticket_tier_classified_at?: string | null;
          ticket_tier_raw_value?: string | null;
          ticket_tier_rule_id?: string | null;
          traffic_source_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_first_touch_content_id_fkey";
            columns: ["first_touch_content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_source_content_id_fkey";
            columns: ["source_content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_source_vsl_id_fkey";
            columns: ["source_vsl_id"];
            isOneToOne: false;
            referencedRelation: "vsls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_source_webinar_id_fkey";
            columns: ["source_webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_ticket_tier_rule_id_fkey";
            columns: ["ticket_tier_rule_id"];
            isOneToOne: false;
            referencedRelation: "lead_classification_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_traffic_source_id_fkey";
            columns: ["traffic_source_id"];
            isOneToOne: false;
            referencedRelation: "traffic_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      member_permissions: {
        Row: {
          can_edit: boolean;
          can_view: boolean;
          id: string;
          org_id: string;
          resource: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          can_edit?: boolean;
          can_view?: boolean;
          id?: string;
          org_id: string;
          resource: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_edit?: boolean;
          can_view?: boolean;
          id?: string;
          org_id?: string;
          resource?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_permissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_requests: {
        Row: {
          admin_email: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          email: string;
          full_name: string;
          id: string;
          org_id: string;
          requested_role: Database["public"]["Enums"]["app_role"];
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_email?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          email: string;
          full_name: string;
          id?: string;
          org_id: string;
          requested_role?: Database["public"]["Enums"]["app_role"];
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_email?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          org_id?: string;
          requested_role?: Database["public"]["Enums"]["app_role"];
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string | null;
          conversation_id: string;
          direction: string;
          external_id: string | null;
          id: string;
          org_id: string;
          raw: Json | null;
          sent_at: string;
          sent_by: string | null;
        };
        Insert: {
          body?: string | null;
          conversation_id: string;
          direction: string;
          external_id?: string | null;
          id?: string;
          org_id: string;
          raw?: Json | null;
          sent_at?: string;
          sent_by?: string | null;
        };
        Update: {
          body?: string | null;
          conversation_id?: string;
          direction?: string;
          external_id?: string | null;
          id?: string;
          org_id?: string;
          raw?: Json | null;
          sent_at?: string;
          sent_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      metric_definitions: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          display_name: string;
          formula: string;
          id: string;
          is_system: boolean | null;
          key: string;
          org_id: string | null;
          scope: Database["public"]["Enums"]["metric_scope"];
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          display_name: string;
          formula: string;
          id?: string;
          is_system?: boolean | null;
          key: string;
          org_id?: string | null;
          scope?: Database["public"]["Enums"]["metric_scope"];
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          display_name?: string;
          formula?: string;
          id?: string;
          is_system?: boolean | null;
          key?: string;
          org_id?: string | null;
          scope?: Database["public"]["Enums"]["metric_scope"];
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metric_definitions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_attempts: {
        Row: {
          attempt_count: number;
          channel: string;
          created_at: string;
          event: string;
          id: string;
          idempotency_key: string;
          last_error: string | null;
          next_retry_at: string | null;
          org_id: string;
          payload: Json;
          provider: string | null;
          recipient: string | null;
          sent_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          channel: string;
          created_at?: string;
          event: string;
          id?: string;
          idempotency_key: string;
          last_error?: string | null;
          next_retry_at?: string | null;
          org_id: string;
          payload?: Json;
          provider?: string | null;
          recipient?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          channel?: string;
          created_at?: string;
          event?: string;
          id?: string;
          idempotency_key?: string;
          last_error?: string | null;
          next_retry_at?: string | null;
          org_id?: string;
          payload?: Json;
          provider?: string | null;
          recipient?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_attempts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      objection_intelligence: {
        Row: {
          call_id: string | null;
          confidence: number | null;
          created_at: string;
          decision_factor: string | null;
          evidence_ref: string | null;
          id: string;
          objection_category: string | null;
          objection_position: string | null;
          org_id: string;
          outcome: string | null;
          speaker: string | null;
          timestamp_seconds: number | null;
          transcript_id: string | null;
        };
        Insert: {
          call_id?: string | null;
          confidence?: number | null;
          created_at?: string;
          decision_factor?: string | null;
          evidence_ref?: string | null;
          id?: string;
          objection_category?: string | null;
          objection_position?: string | null;
          org_id: string;
          outcome?: string | null;
          speaker?: string | null;
          timestamp_seconds?: number | null;
          transcript_id?: string | null;
        };
        Update: {
          call_id?: string | null;
          confidence?: number | null;
          created_at?: string;
          decision_factor?: string | null;
          evidence_ref?: string | null;
          id?: string;
          objection_category?: string | null;
          objection_position?: string | null;
          org_id?: string;
          outcome?: string | null;
          speaker?: string | null;
          timestamp_seconds?: number | null;
          transcript_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "objection_intelligence_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      offer_payment_plans: {
        Row: {
          cadence: string;
          created_at: string;
          deposit_cents: number | null;
          id: string;
          installment_amount_cents: number | null;
          installment_count: number | null;
          is_active: boolean;
          label: string;
          offer_id: string;
          org_id: string;
          total_contracted_value_cents: number | null;
        };
        Insert: {
          cadence: string;
          created_at?: string;
          deposit_cents?: number | null;
          id?: string;
          installment_amount_cents?: number | null;
          installment_count?: number | null;
          is_active?: boolean;
          label: string;
          offer_id: string;
          org_id: string;
          total_contracted_value_cents?: number | null;
        };
        Update: {
          cadence?: string;
          created_at?: string;
          deposit_cents?: number | null;
          id?: string;
          installment_amount_cents?: number | null;
          installment_count?: number | null;
          is_active?: boolean;
          label?: string;
          offer_id?: string;
          org_id?: string;
          total_contracted_value_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "offer_payment_plans_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offer_payment_plans_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      offer_tiers: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          org_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          org_id: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          org_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "offer_tiers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          org_id: string;
          price_cents: number | null;
          pricing_type: string;
          tier_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          org_id: string;
          price_cents?: number | null;
          pricing_type?: string;
          tier_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          org_id?: string;
          price_cents?: number | null;
          pricing_type?: string;
          tier_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_org_id_tier_key_fkey";
            columns: ["org_id", "tier_key"];
            isOneToOne: false;
            referencedRelation: "offer_tiers";
            referencedColumns: ["org_id", "key"];
          },
        ];
      };
      onboarding_responses: {
        Row: {
          client_id: string | null;
          created_at: string;
          id: string;
          mechanism_signals: Json;
          org_id: string;
          responses: Json;
          share_token: string;
          submitted_at: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          mechanism_signals?: Json;
          org_id: string;
          responses?: Json;
          share_token?: string;
          submitted_at?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          mechanism_signals?: Json;
          org_id?: string;
          responses?: Json;
          share_token?: string;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_responses_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      operational_audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          from_state: string | null;
          id: string;
          org_id: string;
          payload: Json;
          reason: string | null;
          to_state: string | null;
          work_item_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          from_state?: string | null;
          id?: string;
          org_id: string;
          payload?: Json;
          reason?: string | null;
          to_state?: string | null;
          work_item_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          from_state?: string | null;
          id?: string;
          org_id?: string;
          payload?: Json;
          reason?: string | null;
          to_state?: string | null;
          work_item_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "operational_audit_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_audit_events_work_item_id_fkey";
            columns: ["work_item_id"];
            isOneToOne: false;
            referencedRelation: "operational_work_items";
            referencedColumns: ["id"];
          },
        ];
      };
      operational_work_items: {
        Row: {
          created_at: string;
          due_at: string | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          next_action: string | null;
          next_action_at: string | null;
          org_id: string;
          owner_id: string | null;
          payload: Json;
          state: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          due_at?: string | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id: string;
          owner_id?: string | null;
          payload?: Json;
          state: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          due_at?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id?: string;
          owner_id?: string | null;
          payload?: Json;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operational_work_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan: string;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan?: string;
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan?: string;
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outreach_lists: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_lists_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_messages: {
        Row: {
          body: string;
          created_at: string;
          error: string | null;
          id: string;
          kind: string;
          list_id: string | null;
          org_id: string;
          scheduled_for: string | null;
          sent_at: string | null;
          status: string;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: string;
          list_id?: string | null;
          org_id: string;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: string;
          list_id?: string | null;
          org_id?: string;
          scheduled_for?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_messages_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "outreach_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_recipients: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          list_id: string;
          org_id: string;
          phone: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          list_id: string;
          org_id: string;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          list_id?: string;
          org_id?: string;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_recipients_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "outreach_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_recipients_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_recovery_items: {
        Row: {
          amount_cents: number;
          client_id: string | null;
          created_at: string;
          due_at: string | null;
          id: string;
          next_action: string | null;
          next_action_at: string | null;
          org_id: string;
          owner_id: string | null;
          payment_id: string | null;
          provider_execution_status: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents?: number;
          client_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id: string;
          owner_id?: string | null;
          payment_id?: string | null;
          provider_execution_status?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          client_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id?: string;
          owner_id?: string | null;
          payment_id?: string | null;
          provider_execution_status?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_recovery_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_recovery_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_schedule_items: {
        Row: {
          amount_cents: number;
          client_id: string;
          created_at: string;
          due_date: string;
          id: string;
          notes: string | null;
          org_id: string;
          payment_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          client_id: string;
          created_at?: string;
          due_date: string;
          id?: string;
          notes?: string | null;
          org_id: string;
          payment_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          client_id?: string;
          created_at?: string;
          due_date?: string;
          id?: string;
          notes?: string | null;
          org_id?: string;
          payment_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_schedule_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_schedule_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_schedule_items_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          call_id: string | null;
          client_id: string | null;
          collected_at: string;
          created_at: string;
          currency: string;
          external_id: string | null;
          fx_rate: number;
          fx_rate_date: string | null;
          fx_source: string;
          id: string;
          org_id: string;
          original_amount_cents: number;
          original_currency: string;
          raw: Json | null;
          source_connector: string | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        Insert: {
          amount_cents: number;
          call_id?: string | null;
          client_id?: string | null;
          collected_at?: string;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          fx_rate: number;
          fx_rate_date?: string | null;
          fx_source: string;
          id?: string;
          org_id: string;
          original_amount_cents: number;
          original_currency: string;
          raw?: Json | null;
          source_connector?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount_cents?: number;
          call_id?: string | null;
          client_id?: string | null;
          collected_at?: string;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          fx_rate?: number;
          fx_rate_date?: string | null;
          fx_source?: string;
          id?: string;
          org_id?: string;
          original_amount_cents?: number;
          original_currency?: string;
          raw?: Json | null;
          source_connector?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["call_id"];
          },
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      raw_payloads: {
        Row: {
          connection_id: string | null;
          connector_id: string;
          external_id: string | null;
          id: string;
          org_id: string;
          payload: Json;
          process_error: string | null;
          processed_at: string | null;
          received_at: string;
          resource: string;
        };
        Insert: {
          connection_id?: string | null;
          connector_id: string;
          external_id?: string | null;
          id?: string;
          org_id: string;
          payload: Json;
          process_error?: string | null;
          processed_at?: string | null;
          received_at?: string;
          resource: string;
        };
        Update: {
          connection_id?: string | null;
          connector_id?: string;
          external_id?: string | null;
          id?: string;
          org_id?: string;
          payload?: Json;
          process_error?: string | null;
          processed_at?: string | null;
          received_at?: string;
          resource?: string;
        };
        Relationships: [
          {
            foreignKeyName: "raw_payloads_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "connector_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "raw_payloads_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      renewal_work_items: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          next_action: string | null;
          next_action_at: string | null;
          org_id: string;
          owner_id: string | null;
          payment_outcome: string | null;
          reason: string | null;
          renewal_date: string | null;
          renewal_outcome: string | null;
          risk: string;
          stage: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id: string;
          owner_id?: string | null;
          payment_outcome?: string | null;
          reason?: string | null;
          renewal_date?: string | null;
          renewal_outcome?: string | null;
          risk?: string;
          stage?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          next_action?: string | null;
          next_action_at?: string | null;
          org_id?: string;
          owner_id?: string | null;
          payment_outcome?: string | null;
          reason?: string | null;
          renewal_date?: string | null;
          renewal_outcome?: string | null;
          risk?: string;
          stage?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "renewal_work_items_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "renewal_work_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      rep_kpi_targets: {
        Row: {
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          is_active: boolean;
          metric_key: string;
          org_id: string;
          period: string;
          role: string;
          target_value: number;
          team_member_name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          is_active?: boolean;
          metric_key: string;
          org_id: string;
          period: string;
          role: string;
          target_value: number;
          team_member_name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          is_active?: boolean;
          metric_key?: string;
          org_id?: string;
          period?: string;
          role?: string;
          target_value?: number;
          team_member_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rep_kpi_targets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          can_edit: boolean;
          can_view: boolean;
          id: string;
          org_id: string;
          resource: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          can_edit?: boolean;
          can_view?: boolean;
          id?: string;
          org_id: string;
          resource: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          can_edit?: boolean;
          can_view?: boolean;
          id?: string;
          org_id?: string;
          resource?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_communications: {
        Row: {
          body: string | null;
          channel: string;
          client_id: string;
          created_at: string;
          id: string;
          org_id: string;
          scheduled_for: string;
          send_status: string;
          sent_at: string | null;
          subject: string | null;
          trigger_type: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          channel: string;
          client_id: string;
          created_at?: string;
          id?: string;
          org_id: string;
          scheduled_for: string;
          send_status?: string;
          sent_at?: string | null;
          subject?: string | null;
          trigger_type: string;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          channel?: string;
          client_id?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          scheduled_for?: string;
          send_status?: string;
          sent_at?: string | null;
          subject?: string | null;
          trigger_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_communications_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_communications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      segments: {
        Row: {
          created_at: string;
          entity: string;
          filter: Json;
          id: string;
          is_shared: boolean | null;
          name: string;
          org_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          entity: string;
          filter?: Json;
          id?: string;
          is_shared?: boolean | null;
          name: string;
          org_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          entity?: string;
          filter?: Json;
          id?: string;
          is_shared?: boolean | null;
          name?: string;
          org_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      setter_activity: {
        Row: {
          activity_date: string;
          calls_on_calendar: number | null;
          cash_collected_cents: number | null;
          closes: number | null;
          connections: number | null;
          created_at: string;
          dials: number | null;
          downsells: number | null;
          followups_sent: number | null;
          id: string;
          inbound_dms_sent: number | null;
          lead_source: string | null;
          leads_contacted: number | null;
          links_clicked: number | null;
          links_sent: number | null;
          live_calls: number | null;
          notes: string | null;
          objections: string | null;
          org_id: string;
          original_currency: string;
          outbound_dms_sent: number | null;
          post_booking_page_visits: number | null;
          pre_call_video_watches: number | null;
          qualified_convos: number | null;
          rate_today: number | null;
          replies: number | null;
          role: string;
          sets: number | null;
          team_member_name: string;
          total_revenue_cents: number | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          activity_date?: string;
          calls_on_calendar?: number | null;
          cash_collected_cents?: number | null;
          closes?: number | null;
          connections?: number | null;
          created_at?: string;
          dials?: number | null;
          downsells?: number | null;
          followups_sent?: number | null;
          id?: string;
          inbound_dms_sent?: number | null;
          lead_source?: string | null;
          leads_contacted?: number | null;
          links_clicked?: number | null;
          links_sent?: number | null;
          live_calls?: number | null;
          notes?: string | null;
          objections?: string | null;
          org_id: string;
          original_currency?: string;
          outbound_dms_sent?: number | null;
          post_booking_page_visits?: number | null;
          pre_call_video_watches?: number | null;
          qualified_convos?: number | null;
          rate_today?: number | null;
          replies?: number | null;
          role?: string;
          sets?: number | null;
          team_member_name: string;
          total_revenue_cents?: number | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          activity_date?: string;
          calls_on_calendar?: number | null;
          cash_collected_cents?: number | null;
          closes?: number | null;
          connections?: number | null;
          created_at?: string;
          dials?: number | null;
          downsells?: number | null;
          followups_sent?: number | null;
          id?: string;
          inbound_dms_sent?: number | null;
          lead_source?: string | null;
          leads_contacted?: number | null;
          links_clicked?: number | null;
          links_sent?: number | null;
          live_calls?: number | null;
          notes?: string | null;
          objections?: string | null;
          org_id?: string;
          original_currency?: string;
          outbound_dms_sent?: number | null;
          post_booking_page_visits?: number | null;
          pre_call_video_watches?: number | null;
          qualified_convos?: number | null;
          rate_today?: number | null;
          replies?: number | null;
          role?: string;
          sets?: number | null;
          team_member_name?: string;
          total_revenue_cents?: number | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      setter_call_signals: {
        Row: {
          ai_summary: string | null;
          call_date: string;
          created_at: string;
          id: string;
          lead_id: string | null;
          limiting_beliefs: string[];
          mechanism: string | null;
          notes: string | null;
          objections: string[];
          org_id: string;
          setter_name: string;
          source: string;
          transcript: string | null;
          updated_at: string;
        };
        Insert: {
          ai_summary?: string | null;
          call_date?: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          limiting_beliefs?: string[];
          mechanism?: string | null;
          notes?: string | null;
          objections?: string[];
          org_id: string;
          setter_name: string;
          source?: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_summary?: string | null;
          call_date?: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          limiting_beliefs?: string[];
          mechanism?: string | null;
          notes?: string | null;
          objections?: string[];
          org_id?: string;
          setter_name?: string;
          source?: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "setter_call_signals_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "lead_attribution_v";
            referencedColumns: ["lead_id"];
          },
          {
            foreignKeyName: "setter_call_signals_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "setter_call_signals_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sla_breach_records: {
        Row: {
          breached_at: string;
          created_at: string;
          id: string;
          lead_id: string | null;
          notification_key: string;
          org_id: string;
          owner_id: string | null;
          resolution: string | null;
          status: string;
          threshold_minutes: number;
        };
        Insert: {
          breached_at: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          notification_key: string;
          org_id: string;
          owner_id?: string | null;
          resolution?: string | null;
          status?: string;
          threshold_minutes?: number;
        };
        Update: {
          breached_at?: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          notification_key?: string;
          org_id?: string;
          owner_id?: string | null;
          resolution?: string | null;
          status?: string;
          threshold_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sla_breach_records_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      slide_metrics: {
        Row: {
          captured_at: string;
          exits: number | null;
          id: string;
          link_clicks: number | null;
          org_id: string;
          raw: Json | null;
          replies: number | null;
          slide_id: string;
          taps_back: number | null;
          taps_forward: number | null;
          views: number | null;
        };
        Insert: {
          captured_at?: string;
          exits?: number | null;
          id?: string;
          link_clicks?: number | null;
          org_id: string;
          raw?: Json | null;
          replies?: number | null;
          slide_id: string;
          taps_back?: number | null;
          taps_forward?: number | null;
          views?: number | null;
        };
        Update: {
          captured_at?: string;
          exits?: number | null;
          id?: string;
          link_clicks?: number | null;
          org_id?: string;
          raw?: Json | null;
          replies?: number | null;
          slide_id?: string;
          taps_back?: number | null;
          taps_forward?: number | null;
          views?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "slide_metrics_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "slide_metrics_slide_id_fkey";
            columns: ["slide_id"];
            isOneToOne: false;
            referencedRelation: "story_slides";
            referencedColumns: ["id"];
          },
        ];
      };
      story_sequences: {
        Row: {
          client_id: string | null;
          created_at: string;
          day_of_week: number;
          id: string;
          notes: string | null;
          org_id: string;
          posted_at: string | null;
          scheduled_for: string | null;
          slides: Json;
          status: string;
          template_key: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          day_of_week: number;
          id?: string;
          notes?: string | null;
          org_id: string;
          posted_at?: string | null;
          scheduled_for?: string | null;
          slides?: Json;
          status?: string;
          template_key: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          day_of_week?: number;
          id?: string;
          notes?: string | null;
          org_id?: string;
          posted_at?: string | null;
          scheduled_for?: string | null;
          slides?: Json;
          status?: string;
          template_key?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_sequences_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "copy_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "story_sequences_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      story_slides: {
        Row: {
          caption: string | null;
          content_id: string;
          created_at: string;
          cta: string | null;
          id: string;
          org_id: string;
          posted_at: string | null;
          sequence_index: number;
        };
        Insert: {
          caption?: string | null;
          content_id: string;
          created_at?: string;
          cta?: string | null;
          id?: string;
          org_id: string;
          posted_at?: string | null;
          sequence_index: number;
        };
        Update: {
          caption?: string | null;
          content_id?: string;
          created_at?: string;
          cta?: string | null;
          id?: string;
          org_id?: string;
          posted_at?: string | null;
          sequence_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "story_slides_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "story_slides_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      taggables: {
        Row: {
          created_at: string;
          id: string;
          tag_id: string;
          taggable_id: string;
          taggable_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          tag_id: string;
          taggable_id: string;
          taggable_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          tag_id?: string;
          taggable_id?: string;
          taggable_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taggables_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          category: string;
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          org_id: string;
        };
        Insert: {
          category: string;
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          category?: string;
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      team_calendars: {
        Row: {
          active: boolean;
          calendar_id: string | null;
          color: string | null;
          created_at: string;
          embed_url: string | null;
          ical_url: string | null;
          id: string;
          member_name: string;
          org_id: string;
          provider: string;
          role: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          calendar_id?: string | null;
          color?: string | null;
          created_at?: string;
          embed_url?: string | null;
          ical_url?: string | null;
          id?: string;
          member_name: string;
          org_id: string;
          provider?: string;
          role?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          calendar_id?: string | null;
          color?: string | null;
          created_at?: string;
          embed_url?: string | null;
          ical_url?: string | null;
          id?: string;
          member_name?: string;
          org_id?: string;
          provider?: string;
          role?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_calendars_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          org_id: string;
          role: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
          role: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      traffic_sources: {
        Row: {
          base_url: string | null;
          category: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          org_id: string;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          base_url?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          org_id: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          base_url?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          org_id?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "traffic_sources_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      vsl_metric_snapshots: {
        Row: {
          avg_percent_watched: number;
          captured_at: string;
          cta_click_rate: number | null;
          cta_clicks: number | null;
          device: string | null;
          embed_location: string | null;
          engagement_json: Json | null;
          id: string;
          identified_viewer_id: string | null;
          new_vs_returning: string | null;
          org_id: string;
          page_loads: number;
          pct_100_reached: number | null;
          pct_25_reached: number | null;
          pct_50_reached: number | null;
          pct_75_reached: number | null;
          pct_90_reached: number | null;
          play_rate: number;
          referrer: string | null;
          rewatches: number | null;
          skips: number | null;
          source: string;
          total_plays: number;
          unique_viewers: number;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          video_name: string | null;
          vsl_id: string;
        };
        Insert: {
          avg_percent_watched?: number;
          captured_at?: string;
          cta_click_rate?: number | null;
          cta_clicks?: number | null;
          device?: string | null;
          embed_location?: string | null;
          engagement_json?: Json | null;
          id?: string;
          identified_viewer_id?: string | null;
          new_vs_returning?: string | null;
          org_id: string;
          page_loads?: number;
          pct_100_reached?: number | null;
          pct_25_reached?: number | null;
          pct_50_reached?: number | null;
          pct_75_reached?: number | null;
          pct_90_reached?: number | null;
          play_rate?: number;
          referrer?: string | null;
          rewatches?: number | null;
          skips?: number | null;
          source?: string;
          total_plays?: number;
          unique_viewers?: number;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          video_name?: string | null;
          vsl_id: string;
        };
        Update: {
          avg_percent_watched?: number;
          captured_at?: string;
          cta_click_rate?: number | null;
          cta_clicks?: number | null;
          device?: string | null;
          embed_location?: string | null;
          engagement_json?: Json | null;
          id?: string;
          identified_viewer_id?: string | null;
          new_vs_returning?: string | null;
          org_id?: string;
          page_loads?: number;
          pct_100_reached?: number | null;
          pct_25_reached?: number | null;
          pct_50_reached?: number | null;
          pct_75_reached?: number | null;
          pct_90_reached?: number | null;
          play_rate?: number;
          referrer?: string | null;
          rewatches?: number | null;
          skips?: number | null;
          source?: string;
          total_plays?: number;
          unique_viewers?: number;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          video_name?: string | null;
          vsl_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vsl_metric_snapshots_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vsl_metric_snapshots_vsl_id_fkey";
            columns: ["vsl_id"];
            isOneToOne: false;
            referencedRelation: "vsls";
            referencedColumns: ["id"];
          },
        ];
      };
      vsl_recommendations: {
        Row: {
          action: string;
          confidence: number | null;
          created_at: string;
          evidence_json: Json;
          id: string;
          org_id: string;
          reason: string;
          status: string;
          updated_at: string;
          vsl_id: string;
        };
        Insert: {
          action: string;
          confidence?: number | null;
          created_at?: string;
          evidence_json?: Json;
          id?: string;
          org_id: string;
          reason: string;
          status?: string;
          updated_at?: string;
          vsl_id: string;
        };
        Update: {
          action?: string;
          confidence?: number | null;
          created_at?: string;
          evidence_json?: Json;
          id?: string;
          org_id?: string;
          reason?: string;
          status?: string;
          updated_at?: string;
          vsl_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vsl_recommendations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vsl_recommendations_vsl_id_fkey";
            columns: ["vsl_id"];
            isOneToOne: false;
            referencedRelation: "vsls";
            referencedColumns: ["id"];
          },
        ];
      };
      vsls: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["vsl_kind"];
          name: string;
          notes: string;
          org_id: string;
          script: string;
          sheet_url: string | null;
          transcript_json: Json;
          updated_at: string;
          wistia_video_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["vsl_kind"];
          name: string;
          notes?: string;
          org_id: string;
          script?: string;
          sheet_url?: string | null;
          transcript_json?: Json;
          updated_at?: string;
          wistia_video_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["vsl_kind"];
          name?: string;
          notes?: string;
          org_id?: string;
          script?: string;
          sheet_url?: string | null;
          transcript_json?: Json;
          updated_at?: string;
          wistia_video_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vsls_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempt: number;
          created_at: string;
          delivered_at: string | null;
          event_id: string | null;
          id: string;
          org_id: string;
          response_body: string | null;
          response_code: number | null;
          status: string;
          subscription_id: string;
        };
        Insert: {
          attempt?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id?: string | null;
          id?: string;
          org_id: string;
          response_body?: string | null;
          response_code?: number | null;
          status?: string;
          subscription_id: string;
        };
        Update: {
          attempt?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id?: string | null;
          id?: string;
          org_id?: string;
          response_body?: string | null;
          response_code?: number | null;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "webhook_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_subscriptions: {
        Row: {
          active: boolean;
          category: string | null;
          channel: string;
          created_at: string;
          event_types: string[];
          id: string;
          name: string;
          org_id: string;
          role_filter: Database["public"]["Enums"]["app_role"][] | null;
          signing_secret: string | null;
          target_url: string;
        };
        Insert: {
          active?: boolean;
          category?: string | null;
          channel?: string;
          created_at?: string;
          event_types?: string[];
          id?: string;
          name: string;
          org_id: string;
          role_filter?: Database["public"]["Enums"]["app_role"][] | null;
          signing_secret?: string | null;
          target_url: string;
        };
        Update: {
          active?: boolean;
          category?: string | null;
          channel?: string;
          created_at?: string;
          event_types?: string[];
          id?: string;
          name?: string;
          org_id?: string;
          role_filter?: Database["public"]["Enums"]["app_role"][] | null;
          signing_secret?: string | null;
          target_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webinar_events: {
        Row: {
          event_key: string | null;
          event_type: string;
          id: string;
          lead_id: string | null;
          metadata: Json;
          occurred_at: string;
          org_id: string;
          provider_event_id: string | null;
          registration_source: string | null;
          source_campaign: string | null;
          source_content_id: string | null;
          source_format: string | null;
          source_platform: string | null;
          source_type: string | null;
          webinar_id: string;
        };
        Insert: {
          event_key?: string | null;
          event_type: string;
          id?: string;
          lead_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          org_id: string;
          provider_event_id?: string | null;
          registration_source?: string | null;
          source_campaign?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_type?: string | null;
          webinar_id: string;
        };
        Update: {
          event_key?: string | null;
          event_type?: string;
          id?: string;
          lead_id?: string | null;
          metadata?: Json;
          occurred_at?: string;
          org_id?: string;
          provider_event_id?: string | null;
          registration_source?: string | null;
          source_campaign?: string | null;
          source_content_id?: string | null;
          source_format?: string | null;
          source_platform?: string | null;
          source_type?: string | null;
          webinar_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webinar_events_source_content_id_fkey";
            columns: ["source_content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webinar_events_webinar_id_fkey";
            columns: ["webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
        ];
      };
      webinar_metrics: {
        Row: {
          captured_at: string;
          clicks: number | null;
          core_revenue_cents: number | null;
          deposits: number | null;
          email_clicks: number | null;
          email_opens: number | null;
          group_leads: number | null;
          id: string;
          lead_capture_investment_cents: number | null;
          live_attendees: number | null;
          order_bump_revenue_cents: number | null;
          order_bump_sales: number | null;
          org_id: string;
          organic_leads: number | null;
          paid_leads: number | null;
          pitch_attendees: number | null;
          refunds_cents: number | null;
          registered: number | null;
          sales: number | null;
          source: string;
          upsell_revenue_cents: number | null;
          upsell_sales: number | null;
          visits_organic: number | null;
          visits_paid: number | null;
          webinar_id: string;
        };
        Insert: {
          captured_at?: string;
          clicks?: number | null;
          core_revenue_cents?: number | null;
          deposits?: number | null;
          email_clicks?: number | null;
          email_opens?: number | null;
          group_leads?: number | null;
          id?: string;
          lead_capture_investment_cents?: number | null;
          live_attendees?: number | null;
          order_bump_revenue_cents?: number | null;
          order_bump_sales?: number | null;
          org_id: string;
          organic_leads?: number | null;
          paid_leads?: number | null;
          pitch_attendees?: number | null;
          refunds_cents?: number | null;
          registered?: number | null;
          sales?: number | null;
          source?: string;
          upsell_revenue_cents?: number | null;
          upsell_sales?: number | null;
          visits_organic?: number | null;
          visits_paid?: number | null;
          webinar_id: string;
        };
        Update: {
          captured_at?: string;
          clicks?: number | null;
          core_revenue_cents?: number | null;
          deposits?: number | null;
          email_clicks?: number | null;
          email_opens?: number | null;
          group_leads?: number | null;
          id?: string;
          lead_capture_investment_cents?: number | null;
          live_attendees?: number | null;
          order_bump_revenue_cents?: number | null;
          order_bump_sales?: number | null;
          org_id?: string;
          organic_leads?: number | null;
          paid_leads?: number | null;
          pitch_attendees?: number | null;
          refunds_cents?: number | null;
          registered?: number | null;
          sales?: number | null;
          source?: string;
          upsell_revenue_cents?: number | null;
          upsell_sales?: number | null;
          visits_organic?: number | null;
          visits_paid?: number | null;
          webinar_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webinar_metrics_webinar_id_fkey";
            columns: ["webinar_id"];
            isOneToOne: false;
            referencedRelation: "webinars";
            referencedColumns: ["id"];
          },
        ];
      };
      webinars: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          org_id: string;
          registration_url: string | null;
          slug: string | null;
          starts_at: string | null;
          status: string;
          updated_at: string;
          webinar_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          org_id: string;
          registration_url?: string | null;
          slug?: string | null;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
          webinar_type?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          org_id?: string;
          registration_url?: string | null;
          slug?: string | null;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
          webinar_type?: string;
        };
        Relationships: [];
      };
      work_blocks: {
        Row: {
          block_date: string;
          created_at: string;
          created_by: string | null;
          end_time: string | null;
          id: string;
          kind: string;
          member_name: string;
          notes: string | null;
          org_id: string;
          role: string | null;
          start_time: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          block_date: string;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          kind?: string;
          member_name: string;
          notes?: string | null;
          org_id: string;
          role?: string | null;
          start_time?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          block_date?: string;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          kind?: string;
          member_name?: string;
          notes?: string | null;
          org_id?: string;
          role?: string | null;
          start_time?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_blocks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      crm_communication_legacy_adapter_v: {
        Row: {
          channel: string | null;
          contact_id: string | null;
          created_at: string | null;
          id: string | null;
          last_message_at: string | null;
          legacy_lead_id: string | null;
          org_id: string | null;
          record_source: string | null;
          status: string | null;
          subject: string | null;
          unread_count: number | null;
        };
        Relationships: [];
      };
      crm_contact_legacy_adapter_v: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          first_name: string | null;
          id: string | null;
          last_name: string | null;
          legacy_lead_id: string | null;
          lifecycle_status: string | null;
          org_id: string | null;
          owner_user_id: string | null;
          primary_email: string | null;
          primary_phone: string | null;
          record_source: string | null;
          social_handle: string | null;
          source: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      lead_attribution_v: {
        Row: {
          call_cash_cents: number | null;
          call_closed: boolean | null;
          call_id: string | null;
          call_scheduled_for: string | null;
          call_showed: boolean | null;
          closer_name: string | null;
          email: string | null;
          first_touch_content_id: string | null;
          first_touch_hook: string | null;
          first_touch_platform: Database["public"]["Enums"]["content_platform"] | null;
          first_touch_title: string | null;
          full_name: string | null;
          handle: string | null;
          last_payment_at: string | null;
          lead_created_at: string | null;
          lead_id: string | null;
          org_id: string | null;
          payments_total_cents: number | null;
          setter_name: string | null;
          source_connector: string | null;
          status: Database["public"]["Enums"]["lead_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_first_touch_content_id_fkey";
            columns: ["first_touch_content_id"];
            isOneToOne: false;
            referencedRelation: "content_pieces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      approve_membership_request: {
        Args: {
          _request_id: string;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: string;
      };
      current_user_orgs: { Args: never; Returns: string[] };
      has_org_role: {
        Args: {
          _org_id: string;
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: { _org_id: string; _user_id: string };
        Returns: boolean;
      };
      record_lead_lifecycle_event: {
        Args: {
          p_call_id?: string;
          p_campaign?: string;
          p_client_id?: string;
          p_content_id?: string;
          p_event_at: string;
          p_event_type: string;
          p_format?: string;
          p_idempotency_key: string;
          p_lead_id: string;
          p_lead_source?: string;
          p_org_id: string;
          p_payload?: Json;
          p_payment_id?: string;
          p_rep_id?: string;
          p_source_platform?: string;
          p_webinar_id?: string;
        };
        Returns: boolean;
      };
      record_webinar_event: {
        Args: {
          p_event_key: string;
          p_event_type: string;
          p_lead_id?: string;
          p_metadata?: Json;
          p_occurred_at: string;
          p_org_id: string;
          p_provider_event_id?: string;
          p_registration_source?: string;
          p_source_campaign?: string;
          p_source_content_id?: string;
          p_source_format?: string;
          p_source_platform?: string;
          p_source_type?: string;
          p_webinar_id: string;
        };
        Returns: boolean;
      };
      reject_membership_request: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      revoke_membership_access: {
        Args: { _org_id: string; _target_user_id: string };
        Returns: undefined;
      };
      submit_membership_request: {
        Args: {
          _admin_email: string;
          _email: string;
          _full_name: string;
          _requested_role: Database["public"]["Enums"]["app_role"];
        };
        Returns: string;
      };
    };
    Enums: {
      alert_severity: "info" | "warning" | "critical";
      app_role:
        | "owner"
        | "admin"
        | "closer"
        | "setter"
        | "va"
        | "viewer"
        | "sales_manager"
        | "growth_ops"
        | "inbound_dialer";
      awareness_stage:
        | "unaware"
        | "problem_aware"
        | "solution_aware"
        | "product_aware"
        | "most_aware";
      call_status:
        | "booked"
        | "showed"
        | "no_show"
        | "offer_made"
        | "closed"
        | "disqualified"
        | "follow_up"
        | "rescheduled";
      connector_state: "not_connected" | "connected" | "syncing" | "error" | "disabled";
      content_angle:
        | "authority"
        | "proof"
        | "educational"
        | "lifestyle"
        | "controversial"
        | "identity"
        | "origin_story"
        | "other";
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
        | "other";
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
        | "ghosted";
      metric_scope:
        | "org"
        | "content"
        | "lead"
        | "call"
        | "setter"
        | "closer"
        | "traffic_source"
        | "client";
      payment_status: "paid" | "pending" | "failed" | "refunded" | "partial";
      vsl_kind: "main" | "webinar" | "post_booking" | "testimonial";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
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
        "inbound_dialer",
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
      connector_state: ["not_connected", "connected", "syncing", "error", "disabled"],
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
      vsl_kind: ["main", "webinar", "post_booking", "testimonial"],
    },
  },
} as const;
