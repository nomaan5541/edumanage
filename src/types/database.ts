// Hand-authored Supabase database types for the Phase 1 foundation schema.
// Once a local or hosted Supabase project is connected, regenerate this file with:
//   npx supabase gen types typescript --local > src/types/database.ts
// (or --project-id <ref> for a hosted project) and re-apply any manual additions.
// Child-agent modules MUST extend the `Tables`/`Functions`/`Enums` maps below when
// they add new tables/RPCs — do not create a second, parallel types file.

export type AppRole = 'super_admin' | 'school_admin' | 'sub_admin' | 'teacher' | 'student'
export type SchoolStatus = 'active' | 'suspended' | 'expired'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'suspended' | 'cancelled'
export type StudentStatus = 'active' | 'inactive' | 'archived' | 'transferred'
export type PersonGender = 'male' | 'female' | 'other'
export type StudentDocumentKind =
  | 'photo'
  | 'birth_certificate'
  | 'transfer_certificate'
  | 'aadhaar'
  | 'other'
export type TransferStatus = 'initiated' | 'pending' | 'accepted' | 'completed' | 'rejected'
export type TeacherStatus = 'active' | 'inactive'
export type TeacherSessionStatus = 'active' | 'revoked' | 'expired'
export type TeacherSessionPolicy = 'reject_new' | 'revoke_previous'

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
      school_security_settings: {
        Row: {
          school_id: string
          teacher_session_policy: TeacherSessionPolicy
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['school_security_settings']['Row']> & { school_id: string }
        Update: Partial<Database['public']['Tables']['school_security_settings']['Row']>
        Relationships: []
      }
      students: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          admission_no: string
          roll_no: string | null
          full_name: string
          first_name: string | null
          middle_name: string | null
          last_name: string | null
          date_of_birth: string | null
          gender: PersonGender | null
          blood_group: string | null
          nationality: string | null
          address: string | null
          phone: string | null
          email: string | null
          photo_url: string | null
          class_id: string | null
          section_id: string | null
          academic_year_id: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_email: string | null
          guardian_relationship: string | null
          admission_date: string
          status: StudentStatus
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['students']['Row']> & {
          school_id: string
          admission_no: string
          full_name: string
        }
        Update: Partial<Database['public']['Tables']['students']['Row']>
        Relationships: []
      }
      student_guardians: {
        Row: {
          id: string
          school_id: string
          student_id: string
          full_name: string
          relationship: string | null
          phone: string | null
          email: string | null
          address: string | null
          is_primary: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['student_guardians']['Row']> & {
          school_id: string
          student_id: string
          full_name: string
        }
        Update: Partial<Database['public']['Tables']['student_guardians']['Row']>
        Relationships: []
      }
      student_enrollments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          section_id: string
          roll_no: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['student_enrollments']['Row']> & {
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          section_id: string
        }
        Update: never
        Relationships: []
      }
      student_documents: {
        Row: {
          id: string
          school_id: string
          student_id: string
          kind: StudentDocumentKind
          storage_path: string
          mime_type: string
          file_size: number
          original_filename: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['student_documents']['Row']> & {
          school_id: string
          student_id: string
          kind: StudentDocumentKind
          storage_path: string
          mime_type: string
          file_size: number
        }
        Update: Partial<Database['public']['Tables']['student_documents']['Row']>
        Relationships: []
      }
      student_transfers: {
        Row: {
          id: string
          source_school_id: string
          destination_school_id: string
          source_student_id: string
          destination_student_id: string | null
          source_enrollment_id: string | null
          destination_enrollment_id: string | null
          status: TransferStatus
          reason: string | null
          rejection_reason: string | null
          initiated_by: string | null
          accepted_by: string | null
          rejected_by: string | null
          certificate_number: string | null
          certificate_payload: Record<string, unknown> | null
          initiated_at: string
          accepted_at: string | null
          completed_at: string | null
          rejected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      teachers: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          employee_code: string
          full_name: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          email: string | null
          date_of_joining: string | null
          status: TeacherStatus
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['teachers']['Row']> & {
          school_id: string
          employee_code: string
          full_name: string
        }
        Update: Partial<Database['public']['Tables']['teachers']['Row']>
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          id: string
          school_id: string
          teacher_id: string
          academic_year_id: string
          class_id: string
          section_id: string
          subject_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['teacher_assignments']['Row']> & {
          school_id: string
          teacher_id: string
          academic_year_id: string
          class_id: string
          section_id: string
          subject_id: string
        }
        Update: Partial<Database['public']['Tables']['teacher_assignments']['Row']>
        Relationships: []
      }
      teacher_sessions: {
        Row: {
          id: string
          school_id: string
          teacher_id: string
          user_id: string
          session_token_hash: string
          device_identifier: string | null
          created_at: string
          last_seen_at: string
          expires_at: string
          revoked_at: string | null
          ip_hash: string | null
          user_agent_hash: string | null
          status: TeacherSessionStatus
        }
        Insert: never
        Update: never
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
      admit_student: { Args: { p_payload: Record<string, unknown> }; Returns: string }
      promote_students: {
        Args: {
          p_student_ids: string[]
          p_source_academic_year_id: string
          p_destination_academic_year_id: string
          p_destination_class_id: string
          p_destination_section_id: string
        }
        Returns: number
      }
      initiate_student_transfer: {
        Args: { p_student_id: string; p_destination_school_id: string; p_reason?: string | null }
        Returns: string
      }
      reject_student_transfer: {
        Args: { p_transfer_id: string; p_reason?: string | null }
        Returns: undefined
      }
      accept_student_transfer: {
        Args: {
          p_transfer_id: string
          p_admission_no: string
          p_class_id: string
          p_section_id: string
          p_academic_year_id: string
          p_roll_no?: string | null
        }
        Returns: string
      }
      create_teacher: { Args: { p_payload: Record<string, unknown> }; Returns: string }
      register_teacher_session: {
        Args: { p_device_identifier?: string | null; p_user_agent_hash?: string | null; p_ip_hash?: string | null }
        Returns: string
      }
      assert_teacher_session: { Args: Record<string, never>; Returns: boolean }
      revoke_current_teacher_session: { Args: Record<string, never>; Returns: undefined }
      link_teacher_user: { Args: { p_teacher_id: string; p_user_id: string }; Returns: undefined }
      lookup_school_for_transfer: {
        Args: { p_school_code: string }
        Returns: { id: string; name: string; school_code: string }[]
      }
    }
    Enums: {
      app_role: AppRole
      school_status: SchoolStatus
      subscription_status: SubscriptionStatus
      student_status: StudentStatus
      person_gender: PersonGender
      transfer_status: TransferStatus
      teacher_status: TeacherStatus
    }
    CompositeTypes: Record<string, never>
  }
}
