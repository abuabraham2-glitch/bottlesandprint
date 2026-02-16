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
      catalog: {
        Row: {
          archived: boolean
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
      clients: {
        Row: {
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
          phone: string | null
          state: string | null
          street_address: string | null
          zip: string | null
        }
        Insert: {
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
          phone?: string | null
          state?: string | null
          street_address?: string | null
          zip?: string | null
        }
        Update: {
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
          phone?: string | null
          state?: string | null
          street_address?: string | null
          zip?: string | null
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
