import { useQuery } from '@tanstack/react-query'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type StatsRow = Database['public']['Functions']['get_student_attendance_stats']['Returns'][number]

function useOwnStudentRecord() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['own-student-record', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, school_id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user?.id,
  })
}

function useActiveEnrollmentYear(studentId: string | undefined) {
  return useQuery({
    queryKey: ['own-active-enrollment-year', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_enrollments')
        .select('academic_year_id')
        .eq('student_id', studentId ?? '')
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!studentId,
  })
}

export function StudentAttendancePage() {
  const { data: student } = useOwnStudentRecord()
  const { data: enrollment } = useActiveEnrollmentYear(student?.id)

  const { data: stats, isLoading } = useQuery({
    queryKey: ['own-attendance-stats', student?.id, enrollment?.academic_year_id],
    queryFn: async (): Promise<StatsRow[]> => {
      const { data, error } = await supabase.rpc('get_student_attendance_stats', {
        p_school_id: student!.school_id,
        p_student_id: student!.id,
        p_academic_year_id: enrollment!.academic_year_id,
      })
      if (error) throw error
      return data
    },
    enabled: !!student?.id && !!enrollment?.academic_year_id,
  })

  const row = stats?.[0]

  if (!student) {
    return <p className="text-sm text-muted-foreground">No student record linked to this account yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Attendance</h2>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {row ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Attendance %</CardDescription>
              <CardTitle className="text-3xl">{row.percentage}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Present</CardDescription>
              <CardTitle className="text-3xl">{row.present_days}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Absent</CardDescription>
              <CardTitle className="text-3xl">{row.absent_days}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Late</CardDescription>
              <CardTitle className="text-3xl">{row.late_days}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Excused</CardDescription>
              <CardTitle className="text-3xl">{row.excused_days}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : (
        !isLoading && <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
      )}
    </div>
  )
}
