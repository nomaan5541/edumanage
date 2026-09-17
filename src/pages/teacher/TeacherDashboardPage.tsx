import { useQuery } from '@tanstack/react-query'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

async function fetchTeacherSummary(schoolId: string, userId: string) {
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!teacher) return null

  const today = new Date()
  const dayOfWeek = today.getDay()
  const todayStr = today.toISOString().slice(0, 10)

  const [{ count: assignments }, { data: todayEntries }, { count: homeworkCount }, { count: upcomingExams }] =
    await Promise.all([
      supabase.from('teacher_assignments').select('id', { count: 'exact', head: true }).eq('teacher_id', teacher.id),
      supabase
        .from('timetable_entries')
        .select('id, timetable_slots!inner(day_of_week, period_number, start_time)')
        .eq('teacher_id', teacher.id)
        .eq('timetable_slots.day_of_week', dayOfWeek),
      supabase.from('homework').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
      supabase.from('exams').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).gte('exam_date', todayStr),
    ])

  return {
    assignments: assignments ?? 0,
    todaysPeriods: todayEntries?.length ?? 0,
    homeworkCount: homeworkCount ?? 0,
    upcomingExams: upcomingExams ?? 0,
  }
}

export function TeacherDashboardPage() {
  const { primaryRole, user } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-summary', schoolId, user?.id],
    queryFn: () => fetchTeacherSummary(schoolId as string, user!.id),
    enabled: !!schoolId && !!user?.id,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Class assignments" value={isLoading ? '—' : (data?.assignments ?? 0)} />
        <StatCard label="Periods today" value={isLoading ? '—' : (data?.todaysPeriods ?? 0)} />
        <StatCard label="Homework posted" value={isLoading ? '—' : (data?.homeworkCount ?? 0)} />
        <StatCard label="Upcoming exams" value={isLoading ? '—' : (data?.upcomingExams ?? 0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Use the Attendance, Exams, Homework, and Timetable tabs to manage your assigned classes.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
