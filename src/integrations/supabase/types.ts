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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      archived_orders: {
        Row: {
          client_company: string | null
          comments: string | null
          date_completed: string | null
          description: string | null
          id: string
          month: string | null
          original_order_id: string | null
          pass: number | null
          quantity: number | null
          size: string | null
          year: string | null
        }
        Insert: {
          client_company?: string | null
          comments?: string | null
          date_completed?: string | null
          description?: string | null
          id?: string
          month?: string | null
          original_order_id?: string | null
          pass?: number | null
          quantity?: number | null
          size?: string | null
          year?: string | null
        }
        Update: {
          client_company?: string | null
          comments?: string | null
          date_completed?: string | null
          description?: string | null
          id?: string
          month?: string | null
          original_order_id?: string | null
          pass?: number | null
          quantity?: number | null
          size?: string | null
          year?: string | null
        }
        Relationships: []
      }
      auto_ack_log_backup_2026_04_28: {
        Row: {
          ack_type: string | null
          email_address: string | null
          gmail_id: string | null
          id: string | null
          sent_at: string | null
        }
        Insert: {
          ack_type?: string | null
          email_address?: string | null
          gmail_id?: string | null
          id?: string | null
          sent_at?: string | null
        }
        Update: {
          ack_type?: string | null
          email_address?: string | null
          gmail_id?: string | null
          id?: string | null
          sent_at?: string | null
        }
        Relationships: []
      }
      calls: {
        Row: {
          action_items: Json | null
          call_reason: string | null
          call_sid: string | null
          caller_name: string | null
          category: string | null
          company_name: string | null
          created_at: string | null
          cross_match_note: string | null
          draft_response: string | null
          email: string | null
          has_quote_request: boolean | null
          holding_sent_at: string | null
          id: string
          is_actionable: boolean | null
          is_existing_client: boolean | null
          is_read: boolean | null
          is_urgent: boolean | null
          phone_number: string | null
          quote_details: Json | null
          related_messages: Json | null
          resolved_at: string | null
          status: string | null
          summary: string | null
          transcript: string | null
        }
        Insert: {
          action_items?: Json | null
          call_reason?: string | null
          call_sid?: string | null
          caller_name?: string | null
          category?: string | null
          company_name?: string | null
          created_at?: string | null
          cross_match_note?: string | null
          draft_response?: string | null
          email?: string | null
          has_quote_request?: boolean | null
          holding_sent_at?: string | null
          id?: string
          is_actionable?: boolean | null
          is_existing_client?: boolean | null
          is_read?: boolean | null
          is_urgent?: boolean | null
          phone_number?: string | null
          quote_details?: Json | null
          related_messages?: Json | null
          resolved_at?: string | null
          status?: string | null
          summary?: string | null
          transcript?: string | null
        }
        Update: {
          action_items?: Json | null
          call_reason?: string | null
          call_sid?: string | null
          caller_name?: string | null
          category?: string | null
          company_name?: string | null
          created_at?: string | null
          cross_match_note?: string | null
          draft_response?: string | null
          email?: string | null
          has_quote_request?: boolean | null
          holding_sent_at?: string | null
          id?: string
          is_actionable?: boolean | null
          is_existing_client?: boolean | null
          is_read?: boolean | null
          is_urgent?: boolean | null
          phone_number?: string | null
          quote_details?: Json | null
          related_messages?: Json | null
          resolved_at?: string | null
          status?: string | null
          summary?: string | null
          transcript?: string | null
        }
        Relationships: []
      }
      catalog: {
        Row: {
          archived: boolean
          artwork_url: string | null
          artwork_url_2: string | null
          client_id: string
          component: string | null
          container_color: string | null
          created_at: string
          first_run: string | null
          id: string
          last_run: string | null
          material: string | null
          num_colors: number | null
          print_colors: string | null
          product_name: string
          size: string | null
        }
        Insert: {
          archived?: boolean
          artwork_url?: string | null
          artwork_url_2?: string | null
          client_id: string
          component?: string | null
          container_color?: string | null
          created_at?: string
          first_run?: string | null
          id?: string
          last_run?: string | null
          material?: string | null
          num_colors?: number | null
          print_colors?: string | null
          product_name: string
          size?: string | null
        }
        Update: {
          archived?: boolean
          artwork_url?: string | null
          artwork_url_2?: string | null
          client_id?: string
          component?: string | null
          container_color?: string | null
          created_at?: string
          first_run?: string | null
          id?: string
          last_run?: string | null
          material?: string | null
          num_colors?: number | null
          print_colors?: string | null
          product_name?: string
          size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          uploaded_at: string | null
        }
        Insert: {
          client_id: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_at?: string | null
        }
        Update: {
          client_id?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ap_contact_name: string | null
          ap_email: string | null
          ap_phone: string | null
          archived: boolean
          billing_city: string | null
          billing_state: string | null
          billing_street: string | null
          billing_zip: string | null
          city: string | null
          company: string
          contact_name: string | null
          created_at: string
          email: string | null
          form_signed: boolean
          id: string
          orders_contact_name: string | null
          orders_email: string | null
          orders_phone: string | null
          phone: string | null
          state: string | null
          street_address: string | null
          tier: string | null
          zip: string | null
        }
        Insert: {
          ap_contact_name?: string | null
          ap_email?: string | null
          ap_phone?: string | null
          archived?: boolean
          billing_city?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          city?: string | null
          company: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          form_signed?: boolean
          id?: string
          orders_contact_name?: string | null
          orders_email?: string | null
          orders_phone?: string | null
          phone?: string | null
          state?: string | null
          street_address?: string | null
          tier?: string | null
          zip?: string | null
        }
        Update: {
          ap_contact_name?: string | null
          ap_email?: string | null
          ap_phone?: string | null
          archived?: boolean
          billing_city?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          city?: string | null
          company?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          form_signed?: boolean
          id?: string
          orders_contact_name?: string | null
          orders_email?: string | null
          orders_phone?: string | null
          phone?: string | null
          state?: string | null
          street_address?: string | null
          tier?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      corrections: {
        Row: {
          category: string | null
          created_at: string
          edited_draft: string | null
          email_id: string | null
          id: string
          original_draft: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          edited_draft?: string | null
          email_id?: string | null
          id?: string
          original_draft?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          edited_draft?: string | null
          email_id?: string | null
          id?: string
          original_draft?: string | null
        }
        Relationships: []
      }
      dashboard_todos: {
        Row: {
          checked_at: string | null
          created_at: string | null
          id: string
          is_checked: boolean | null
          text: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          text: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string | null
          id?: string
          is_checked?: boolean | null
          text?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          acknowledged: boolean | null
          approved_sent_at: string | null
          attachments: Json | null
          body: string | null
          call_id: string | null
          category: string | null
          cc_emails: string | null
          cc_recipients: string | null
          client_id: string | null
          converted: boolean | null
          created_at: string | null
          cross_match_note: string | null
          deleted_at: string | null
          direction: string | null
          draft_response: string | null
          from_email: string | null
          from_name: string | null
          gmail_id: string | null
          holding_sent_at: string | null
          html_body: string | null
          id: string
          incoming_summary: string | null
          is_read: boolean | null
          is_urgent: boolean | null
          label: string | null
          multi_topic_alert: string | null
          original_sent_at: string | null
          po_received_at: string | null
          quote_data: Json | null
          quoted_at: string | null
          resolved_at: string | null
          same_company_alert: string | null
          same_company_link_id: string | null
          skip_alert: string | null
          skip_link_id: string | null
          status: string | null
          subject: string | null
          thread_id: string | null
          tier: string | null
          to_email_all: string | null
          to_recipients: string | null
          win_back_sent_at: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          approved_sent_at?: string | null
          attachments?: Json | null
          body?: string | null
          call_id?: string | null
          category?: string | null
          cc_emails?: string | null
          cc_recipients?: string | null
          client_id?: string | null
          converted?: boolean | null
          created_at?: string | null
          cross_match_note?: string | null
          deleted_at?: string | null
          direction?: string | null
          draft_response?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_id?: string | null
          holding_sent_at?: string | null
          html_body?: string | null
          id?: string
          incoming_summary?: string | null
          is_read?: boolean | null
          is_urgent?: boolean | null
          label?: string | null
          multi_topic_alert?: string | null
          original_sent_at?: string | null
          po_received_at?: string | null
          quote_data?: Json | null
          quoted_at?: string | null
          resolved_at?: string | null
          same_company_alert?: string | null
          same_company_link_id?: string | null
          skip_alert?: string | null
          skip_link_id?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
          tier?: string | null
          to_email_all?: string | null
          to_recipients?: string | null
          win_back_sent_at?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          approved_sent_at?: string | null
          attachments?: Json | null
          body?: string | null
          call_id?: string | null
          category?: string | null
          cc_emails?: string | null
          cc_recipients?: string | null
          client_id?: string | null
          converted?: boolean | null
          created_at?: string | null
          cross_match_note?: string | null
          deleted_at?: string | null
          direction?: string | null
          draft_response?: string | null
          from_email?: string | null
          from_name?: string | null
          gmail_id?: string | null
          holding_sent_at?: string | null
          html_body?: string | null
          id?: string
          incoming_summary?: string | null
          is_read?: boolean | null
          is_urgent?: boolean | null
          label?: string | null
          multi_topic_alert?: string | null
          original_sent_at?: string | null
          po_received_at?: string | null
          quote_data?: Json | null
          quoted_at?: string | null
          resolved_at?: string | null
          same_company_alert?: string | null
          same_company_link_id?: string | null
          skip_alert?: string | null
          skip_link_id?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
          tier?: string | null
          to_email_all?: string | null
          to_recipients?: string | null
          win_back_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          cancelled: boolean | null
          client_email: string | null
          client_name: string | null
          created_at: string | null
          email_id: string | null
          follow_up_number: number | null
          id: string
          scheduled_for: string | null
          sent: boolean | null
          sent_at: string | null
          subject: string | null
        }
        Insert: {
          cancelled?: boolean | null
          client_email?: string | null
          client_name?: string | null
          created_at?: string | null
          email_id?: string | null
          follow_up_number?: number | null
          id?: string
          scheduled_for?: string | null
          sent?: boolean | null
          sent_at?: string | null
          subject?: string | null
        }
        Update: {
          cancelled?: boolean | null
          client_email?: string | null
          client_name?: string | null
          created_at?: string | null
          email_id?: string | null
          follow_up_number?: number | null
          id?: string
          scheduled_for?: string | null
          sent?: boolean | null
          sent_at?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_stats: {
        Row: {
          avg_days_to_close: number | null
          conversion_pct: number | null
          created_at: string | null
          id: string
          insights: string | null
          month_start: string
          po_received: number | null
          quotes_sent: number | null
        }
        Insert: {
          avg_days_to_close?: number | null
          conversion_pct?: number | null
          created_at?: string | null
          id?: string
          insights?: string | null
          month_start: string
          po_received?: number | null
          quotes_sent?: number | null
        }
        Update: {
          avg_days_to_close?: number | null
          conversion_pct?: number | null
          created_at?: string | null
          id?: string
          insights?: string | null
          month_start?: string
          po_received?: number | null
          quotes_sent?: number | null
        }
        Relationships: []
      }
      order_documents: {
        Row: {
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          order_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          order_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          order_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          bottle_color: string | null
          bottle_size: string | null
          bottle_type: string | null
          created_at: string
          id: string
          item_name: string
          material: string | null
          num_colors: number | null
          order_id: string
          packing: string | null
          print_colors: string | null
          quantity: number | null
        }
        Insert: {
          bottle_color?: string | null
          bottle_size?: string | null
          bottle_type?: string | null
          created_at?: string
          id?: string
          item_name: string
          material?: string | null
          num_colors?: number | null
          order_id: string
          packing?: string | null
          print_colors?: string | null
          quantity?: number | null
        }
        Update: {
          bottle_color?: string | null
          bottle_size?: string | null
          bottle_type?: string | null
          created_at?: string
          id?: string
          item_name?: string
          material?: string | null
          num_colors?: number | null
          order_id?: string
          packing?: string | null
          print_colors?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived: boolean
          bol_signed: boolean
          bottle_color: string | null
          bottle_size: string | null
          bottle_type: string | null
          checklist_art_order_logged: boolean
          checklist_artwork_in: boolean
          checklist_bottles: boolean
          checklist_new_client_form: boolean
          checklist_proof_approved: boolean
          checklist_purchase_order: boolean
          client_id: string
          client_po: string | null
          created_at: string
          date_entered: string
          due_date: string | null
          id: string
          invoice_num: string | null
          invoice_reviewed: boolean
          invoiced: boolean
          item_name: string
          material: string | null
          notes: string | null
          num_colors: number | null
          outgoing_bol: string | null
          packing: string | null
          paid: boolean
          pass: number
          pay_date: string | null
          pay_method: string | null
          print_colors: string | null
          quantity: number | null
          ship_date: string | null
          shipped: boolean
          stage: string
          vendor_po: string | null
          vendor_po_reviewed: boolean
        }
        Insert: {
          archived?: boolean
          bol_signed?: boolean
          bottle_color?: string | null
          bottle_size?: string | null
          bottle_type?: string | null
          checklist_art_order_logged?: boolean
          checklist_artwork_in?: boolean
          checklist_bottles?: boolean
          checklist_new_client_form?: boolean
          checklist_proof_approved?: boolean
          checklist_purchase_order?: boolean
          client_id: string
          client_po?: string | null
          created_at?: string
          date_entered?: string
          due_date?: string | null
          id?: string
          invoice_num?: string | null
          invoice_reviewed?: boolean
          invoiced?: boolean
          item_name: string
          material?: string | null
          notes?: string | null
          num_colors?: number | null
          outgoing_bol?: string | null
          packing?: string | null
          paid?: boolean
          pass?: number
          pay_date?: string | null
          pay_method?: string | null
          print_colors?: string | null
          quantity?: number | null
          ship_date?: string | null
          shipped?: boolean
          stage?: string
          vendor_po?: string | null
          vendor_po_reviewed?: boolean
        }
        Update: {
          archived?: boolean
          bol_signed?: boolean
          bottle_color?: string | null
          bottle_size?: string | null
          bottle_type?: string | null
          checklist_art_order_logged?: boolean
          checklist_artwork_in?: boolean
          checklist_bottles?: boolean
          checklist_new_client_form?: boolean
          checklist_proof_approved?: boolean
          checklist_purchase_order?: boolean
          client_id?: string
          client_po?: string | null
          created_at?: string
          date_entered?: string
          due_date?: string | null
          id?: string
          invoice_num?: string | null
          invoice_reviewed?: boolean
          invoiced?: boolean
          item_name?: string
          material?: string | null
          notes?: string | null
          num_colors?: number | null
          outgoing_bol?: string | null
          packing?: string | null
          paid?: boolean
          pass?: number
          pay_date?: string | null
          pay_method?: string | null
          print_colors?: string | null
          quantity?: number | null
          ship_date?: string | null
          shipped?: boolean
          stage?: string
          vendor_po?: string | null
          vendor_po_reviewed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_notes: {
        Row: {
          id: number
          system_log: Json
          updated_at: string
          user_notes: Json
        }
        Insert: {
          id?: number
          system_log?: Json
          updated_at?: string
          user_notes?: Json
        }
        Update: {
          id?: number
          system_log?: Json
          updated_at?: string
          user_notes?: Json
        }
        Relationships: []
      }
      reconciliation_backup_2026_04_28: {
        Row: {
          created_at: string | null
          direction: string | null
          id: string | null
          snapshot_taken_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string | null
          id?: string | null
          snapshot_taken_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string | null
          id?: string | null
          snapshot_taken_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      sequence_counters: {
        Row: {
          counter_name: string
          id: string
          next_number: number
        }
        Insert: {
          counter_name: string
          id?: string
          next_number?: number
        }
        Update: {
          counter_name?: string
          id?: string
          next_number?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      triage_feedback: {
        Row: {
          created_at: string | null
          email_id: string | null
          feedback_type: string | null
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          email_id?: string | null
          feedback_type?: string | null
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          email_id?: string | null
          feedback_type?: string | null
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "triage_feedback_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      get_next_bol_number: { Args: never; Returns: string }
      get_next_sequence_number: {
        Args: { p_counter_name: string }
        Returns: number
      }
      get_open_emails_for_reconciliation: { Args: never; Returns: Json[] }
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
    },
  },
} as const
