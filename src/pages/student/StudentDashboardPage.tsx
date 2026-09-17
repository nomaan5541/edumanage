import { useQuery } from '@tanstack/react-query'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

async function fetchStudentSummary(userId: string) {
  const { data: student } = await supabase
    .from('students')
    .select('id, school_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!student) return null

  const { data: enrollment } = await supabase
    .from('student_enrollments')
    .select('academic_year_id')
    .eq('student_id', student.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!enrollment) return { student, enrollment: null }

  const today = new Date().toISOString().slice(0, 10)

  const [{ data: stats }, { data: feeSummary }, { count: homeworkCount }, { data: nextExam }] = await Promise.all([
    supabase.rpc('get_student_attendance_stats', {
      p_school_id: student.school_id,
      p_student_id: student.id,
      p_academic_year_id: enrollment.academic_year_id,
    }),
    supabase.rpc('get_student_fee_summary', {
      p_school_id: student.school_id,
      p_student_id: student.id,
      p_academic_year_id: enrollment.academic_year_id,
    }),
    supabase.from('homework').select('id', { count: 'exact', head: true }).eq('school_id', student.school_id),
    supabase
      .from('exams')
      .select('name, exam_date')
      .eq('school_id', student.school_id)
      .gte('exam_date', today)
      .order('exam_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const feeDue = (feeSummary ?? []).reduce((sum, row) => sum + Number(row.outstanding), 0)

  return {
    student,
    enrollment,
    attendancePercent: stats?.[0]?.percentage ?? null,
    feeDue,
    homeworkCount: homeworkCount ?? 0,
    nextExam,
  }
}

export function StudentDashboardPage() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['student-summary', user?.id],
    queryFn: () => fetchStudentSummary(user!.id),
    enabled: !!user?.id,
  })

  if (!isLoading && !data?.student) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No student record linked</CardTitle>
          <CardDescription>Contact your school administrator if this seems wrong.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Attendance"
        value={isLoading ? '—' : data?.attendancePercent === null ? 'N/A' : `${data?.attendancePercent}%`}
      />
      <StatCard label="Fee due" value={isLoading ? '—' : `₹${data?.feeDue?.toLocaleString() ?? 0}`} />
      <StatCard label="Homework posted" value={isLoading ? '—' : (data?.homeworkCount ?? 0)} />
      <StatCard
        label="Next exam"
        value={isLoading ? '—' : data?.nextExam ? `${data.nextExam.name} (${data.nextExam.exam_date})` : 'None scheduled'}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
