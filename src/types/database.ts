// Hand-authored Supabase database types for the Phase 1 foundation schema.
// Once a local or hosted Supabase project is connected, regenerate this file with:
//   npx supabase gen types typescript --local > src/types/database.ts
// (or --project-id <ref> for a hosted project) and re-apply any manual additions.
// Child-agent modules MUST extend the `Tables`/`Functions`/`Enums` maps below when
// they add new tables/RPCs — do not create a second, parallel types file.

export type AppRole = 'super_admin' | 'school_admin' | 'sub_admin' | 'teacher' | 'student'
export type SchoolStatus = 'active' | 'suspended' | 'expired'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'suspended' | 'cancelled'
export type StudentStatus = 'active' | 'inactive' | 'transferred' | 'archived'
export type EnrollmentStatus = 'active' | 'promoted' | 'transferred' | 'archived'
export type TeacherStatus = 'active' | 'inactive'
export type TeacherSessionStatus = 'active' | 'revoked'
export type TransferStatus = 'pending' | 'accepted' | 'rejected'
export type PaymentMode = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'other'
export type PaymentStatus = 'paid' | 'refunded' | 'cancelled'
export type SubscriptionRequestStatus = 'pending' | 'approved' | 'rejected'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type ExamType = 'FA1' | 'FA2' | 'MID' | 'FA3' | 'FA4' | 'FINAL'

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
      students: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          admission_no: string
          admission_date: string
          first_name: string
          middle_name: string | null
          last_name: string | null
          date_of_birth: string | null
          gender: string | null
          blood_group: string | null
          nationality: string | null
          address: string | null
          phone: string | null
          email: string | null
          photo_url: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_email: string | null
          guardian_relationship: string | null
          status: StudentStatus
          created_at: string
          updated_at: string
        }
        Insert: never // create only via create_student_admission RPC
        Update: Partial<Database['public']['Tables']['students']['Row']>
        Relationships: []
      }
      student_enrollments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          section_id: string | null
          roll_no: string | null
          status: EnrollmentStatus
          created_at: string
        }
        Insert: never // create only via create_student_admission/promote_students/accept_student_transfer RPCs
        Update: never
        Relationships: []
      }
      student_documents: {
        Row: {
          id: string
          school_id: string
          student_id: string
          doc_type: string
          storage_path: string
          file_size: number | null
          mime_type: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['student_documents']['Row']> & {
          school_id: string
          student_id: string
          doc_type: string
          storage_path: string
        }
        Update: never
        Relationships: []
      }
      teachers: {
        Row: {
          id: string
          school_id: string
          user_id: string
          employee_no: string | null
          full_name: string
          phone: string | null
          email: string | null
          status: TeacherStatus
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['teachers']['Row']> & {
          school_id: string
          user_id: string
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
          section_id: string | null
          subject_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['teacher_assignments']['Row']> & {
          school_id: string
          teacher_id: string
          academic_year_id: string
          class_id: string
        }
        Update: never
        Relationships: []
      }
      teacher_sessions: {
        Row: {
          id: string
          teacher_id: string
          user_id: string
          school_id: string
          device_id: string
          created_at: string
          last_seen_at: string
          revoked_at: string | null
          status: TeacherSessionStatus
        }
        Insert: never // create only via register_teacher_session RPC
        Update: never
        Relationships: []
      }
      student_transfers: {
        Row: {
          id: string
          source_school_id: string
          destination_school_id: string
          student_id: string
          destination_student_id: string | null
          status: TransferStatus
          notes: string | null
          requested_by: string | null
          resolved_by: string | null
          created_at: string
          resolved_at: string | null
        }
        Insert: never // create only via initiate_student_transfer RPC
        Update: never
        Relationships: []
      }
      fee_types: {
        Row: { id: string; school_id: string; name: string; description: string | null; created_at: string }
        Insert: Partial<Database['public']['Tables']['fee_types']['Row']> & { school_id: string; name: string }
        Update: Partial<Database['public']['Tables']['fee_types']['Row']>
        Relationships: []
      }
      fee_structures: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          class_id: string
          fee_type_id: string
          amount: number
          due_date: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['fee_structures']['Row']> & {
          school_id: string
          academic_year_id: string
          class_id: string
          fee_type_id: string
          amount: number
        }
        Update: Partial<Database['public']['Tables']['fee_structures']['Row']>
        Relationships: []
      }
      student_fee_adjustments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          fee_type_id: string
          discount_amount: number
          concession_amount: number
          fine_amount: number
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['student_fee_adjustments']['Row']> & {
          school_id: string
          student_id: string
          academic_year_id: string
          fee_type_id: string
        }
        Update: Partial<Database['public']['Tables']['student_fee_adjustments']['Row']>
        Relationships: []
      }
      fee_payments: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          fee_type_id: string
          amount: number
          payment_mode: PaymentMode
          status: PaymentStatus
          idempotency_key: string | null
          receipt_no: string
          recorded_by: string | null
          created_at: string
        }
        Insert: never // create only via record_fee_payment RPC
        Update: never
        Relationships: []
      }
      subscription_requests: {
        Row: {
          id: string
          school_id: string
          plan_name: string
          requested_by: string | null
          requested_at: string
          status: SubscriptionRequestStatus
          notes: string | null
          resolved_by: string | null
          resolved_at: string | null
          resolution_notes: string | null
        }
        Insert: never // create only via request_subscription_renewal RPC
        Update: never
        Relationships: []
      }
      attendance: {
        Row: {
          id: string
          school_id: string
          student_id: string
          academic_year_id: string
          class_id: string
          section_id: string | null
          attendance_date: string
          status: AttendanceStatus
          marked_by: string | null
          corrected_by: string | null
          corrected_at: string | null
          correction_reason: string | null
          created_at: string
        }
        Insert: never // create only via mark_attendance RPC
        Update: never
        Relationships: []
      }
      exams: {
        Row: {
          id: string
          school_id: string
          academic_year_id: string
          class_id: string
          section_id: string | null
          subject_id: string
          exam_type: ExamType
          name: string
          max_marks: number
          exam_date: string
          duration_minutes: number | null
          instructions: string | null
          is_published: boolean
          created_by: string | null
          created_at: string
        }
        Insert: never // create only via create_exam RPC
        Update: never
        Relationships: []
      }
      exam_marks: {
        Row: {
          id: string
          school_id: string
          exam_id: string
          student_id: string
          marks_obtained: number
          remarks: string | null
          is_locked: boolean
          entered_by: string | null
          entered_at: string
          updated_at: string
        }
        Insert: never // create only via upsert_exam_marks RPC
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
      create_student_admission: {
        Args: {
          p_school_id: string
          p_student: Record<string, unknown>
          p_academic_year_id: string
          p_class_id: string
          p_section_id: string | null
          p_roll_no?: string | null
        }
        Returns: string
      }
      promote_students: {
        Args: {
          p_school_id: string
          p_student_ids: string[]
          p_dest_academic_year_id: string
          p_dest_class_id: string
          p_dest_section_id: string | null
        }
        Returns: number
      }
      initiate_student_transfer: {
        Args: {
          p_source_school_id: string
          p_student_id: string
          p_destination_school_id: string
          p_notes?: string | null
        }
        Returns: string
      }
      accept_student_transfer: {
        Args: {
          p_transfer_id: string
          p_new_admission_no: string
          p_academic_year_id: string
          p_class_id: string
          p_section_id: string | null
        }
        Returns: string
      }
      reject_student_transfer: {
        Args: { p_transfer_id: string; p_reason?: string | null }
        Returns: undefined
      }
      register_teacher_session: {
        Args: { p_device_id: string }
        Returns: { revoked_previous_session: boolean }
      }
      is_teacher_session_active: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      get_student_fee_summary: {
        Args: { p_school_id: string; p_student_id: string; p_academic_year_id: string }
        Returns: {
          fee_type_id: string
          fee_type_name: string
          total_due: number
          fines: number
          discounts: number
          concessions: number
          verified_payments: number
          outstanding: number
        }[]
      }
      record_fee_payment: {
        Args: {
          p_school_id: string
          p_student_id: string
          p_academic_year_id: string
          p_fee_type_id: string
          p_amount: number
          p_payment_mode: string
          p_idempotency_key?: string | null
        }
        Returns: Database['public']['Tables']['fee_payments']['Row']
      }
      request_subscription_renewal: {
        Args: { p_school_id: string; p_plan_name?: string; p_notes?: string | null }
        Returns: string
      }
      approve_subscription_renewal: {
        Args: { p_request_id: string; p_expiry_date: string; p_plan_name?: string | null }
        Returns: undefined
      }
      reject_subscription_renewal: {
        Args: { p_request_id: string; p_reason?: string | null }
        Returns: undefined
      }
      get_class_attendance: {
        Args: {
          p_school_id: string
          p_academic_year_id: string
          p_class_id: string
          p_section_id: string | null
          p_date: string
        }
        Returns: {
          student_id: string
          admission_no: string
          first_name: string
          last_name: string | null
          status: AttendanceStatus | null
        }[]
      }
      mark_attendance: {
        Args: {
          p_school_id: string
          p_academic_year_id: string
          p_class_id: string
          p_section_id: string | null
          p_attendance_date: string
          p_records: { student_id: string; status: AttendanceStatus }[]
        }
        Returns: number
      }
      get_student_attendance_stats: {
        Args: { p_school_id: string; p_student_id: string; p_academic_year_id: string; p_month?: string | null }
        Returns: {
          total_days: number
          present_days: number
          absent_days: number
          late_days: number
          excused_days: number
          percentage: number
        }[]
      }
      create_exam: {
        Args: {
          p_school_id: string
          p_academic_year_id: string
          p_class_id: string
          p_section_id: string | null
          p_subject_id: string
          p_exam_type: ExamType
          p_name: string
          p_max_marks: number
          p_exam_date: string
          p_duration_minutes?: number | null
          p_instructions?: string | null
        }
        Returns: string
      }
      upsert_exam_marks: {
        Args: {
          p_school_id: string
          p_exam_id: string
          p_records: { student_id: string; marks_obtained: number; remarks?: string | null }[]
        }
        Returns: number
      }
      publish_exam_results: {
        Args: { p_exam_id: string }
        Returns: undefined
      }
      get_student_exam_results: {
        Args: { p_school_id: string; p_student_id: string; p_academic_year_id: string }
        Returns: {
          exam_id: string
          exam_name: string
          exam_type: ExamType
          subject_name: string
          max_marks: number
          marks_obtained: number
          remarks: string | null
          exam_date: string
        }[]
      }
    }
    Enums: {
      app_role: AppRole
      school_status: SchoolStatus
      subscription_status: SubscriptionStatus
      student_status: StudentStatus
      enrollment_status: EnrollmentStatus
      teacher_status: TeacherStatus
      transfer_status: TransferStatus
    }
    CompositeTypes: Record<string, never>
  }
}
