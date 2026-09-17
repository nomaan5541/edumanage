// Hand-authored Supabase database types for the Phase 1 foundation schema.
// Once a local or hosted Supabase project is connected, regenerate this file with:
//   npx supabase gen types typescript --local > src/types/database.ts
// (or --project-id <ref> for a hosted project) and re-apply any manual additions.
// Child-agent modules MUST extend the `Tables`/`Functions`/`Enums` maps below when
// they add new tables/RPCs — do not create a second, parallel types file.

export type AppRole = 'super_admin' | 'school_admin' | 'sub_admin' | 'teacher' | 'student'
export type SchoolStatus = 'active' | 'suspended' | 'expired'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'suspended' | 'cancelled'

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string
          name: string
          legal_name: string | null
          school_code: string
          address: string | null
          district: string | null
          state: string | null
          country: string
          phone: string | null
          email: string | null
          website: string | null
          logo_url: string | null
          principal_name: string | null
          board: string | null
          status: SchoolStatus
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['schools']['Row']> & {
          name: string
          school_code: string
        }
        Update: Partial<Database['public']['Tables']['schools']['Row']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string | null
          phone: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: AppRole
          school_id: string | null
          is_active: boolean
          created_at: string
          created_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['user_roles']['Row']> & {
          user_id: string
          role: AppRole
        }
        Update: Partial<Database['public']['Tables']['user_roles']['Row']>
        Relationships: []
      }
      permissions: {
        Row: { key: string; module: string; description: string }
        Insert: Database['public']['Tables']['permissions']['Row']
        Update: Partial<Database['public']['Tables']['permissions']['Row']>
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          user_id: string
          school_id: string
          permission_key: string
          granted: boolean
          granted_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['role_permissions']['Row']> & {
          user_id: string
          school_id: string
          permission_key: string
        }
        Update: Partial<Database['public']['Tables']['role_permissions']['Row']>
        Relationships: []
      }
      academic_years: {
        Row: {
          id: string
          school_id: string
          name: string
          start_date: string
          end_date: string
          is_active: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['academic_years']['Row']> & {
          school_id: string
          name: string
          start_date: string
          end_date: string
        }
        Update: Partial<Database['public']['Tables']['academic_years']['Row']>
        Relationships: []
      }
      classes: {
        Row: { id: string; school_id: string; name: string; sort_order: number; created_at: string }
        Insert: Partial<Database['public']['Tables']['classes']['Row']> & { school_id: string; name: string }
        Update: Partial<Database['public']['Tables']['classes']['Row']>
        Relationships: []
      }
      sections: {
        Row: { id: string; school_id: string; class_id: string; name: string; created_at: string }
        Insert: Partial<Database['public']['Tables']['sections']['Row']> & {
          school_id: string
          class_id: string
          name: string
        }
        Update: Partial<Database['public']['Tables']['sections']['Row']>
        Relationships: []
      }
      subjects: {
        Row: { id: string; school_id: string; name: string; code: string | null; created_at: string }
        Insert: Partial<Database['public']['Tables']['subjects']['Row']> & { school_id: string; name: string }
        Update: Partial<Database['public']['Tables']['subjects']['Row']>
        Relationships: []
      }
      class_subjects: {
        Row: {
          id: string
          school_id: string
          class_id: string
          subject_id: string
          academic_year_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['class_subjects']['Row']> & {
          school_id: string
          class_id: string
          subject_id: string
          academic_year_id: string
        }
        Update: Partial<Database['public']['Tables']['class_subjects']['Row']>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          school_id: string
          plan_name: string
          status: SubscriptionStatus
          start_date: string | null
          expiry_date: string | null
          activated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['subscriptions']['Row']> & { school_id: string }
        Update: Partial<Database['public']['Tables']['subscriptions']['Row']>
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          school_id: string | null
          actor_user_id: string | null
          actor_role: AppRole | null
          action: string
          entity_type: string
          entity_id: string | null
          old_values: Record<string, unknown> | null
          new_values: Record<string, unknown> | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: never // append-only via RPC — do not insert directly from the client
        Update: never
        Relationships: []
      }
      id_card_templates: {
        Row: {
          id: string
          school_id: string
          name: string
          category: 'student' | 'staff' | 'visitor' | 'other'
          description: string | null
          layout: Record<string, unknown>
          source_starter_key: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          updated_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['id_card_templates']['Row']> & {
          school_id: string
          name: string
          category: 'student' | 'staff' | 'visitor' | 'other'
          layout: Record<string, unknown>
        }
        Update: Partial<Database['public']['Tables']['id_card_templates']['Row']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_super_admin: { Args: Record<string, never>; Returns: boolean }
      has_role_in_school: { Args: { target_school_id: string; target_role: AppRole }; Returns: boolean }
      is_school_admin_or_above: { Args: { target_school_id: string }; Returns: boolean }
      is_school_member: { Args: { target_school_id: string }; Returns: boolean }
      current_user_school_id: { Args: Record<string, never>; Returns: string | null }
      current_user_role_in_school: { Args: { target_school_id: string }; Returns: AppRole | null }
      has_permission: { Args: { target_school_id: string; perm_key: string }; Returns: boolean }
      is_school_read_only: { Args: { target_school_id: string }; Returns: boolean }
      create_school_bootstrap: {
        Args: { p_school: Record<string, unknown>; p_admin_user_id: string; p_admin_email: string }
        Returns: string
      }
    }
    Enums: {
      app_role: AppRole
      school_status: SchoolStatus
      subscription_status: SubscriptionStatus
    }
    CompositeTypes: Record<string, never>
  }
}
