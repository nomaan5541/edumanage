import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

async function fetchAcademicSummary(schoolId: string) {
  const [{ count: years }, { count: classes }, { count: sections }, { count: subjects }] = await Promise.all([
    supabase.from('academic_years').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('sections').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
  ])
  return { years: years ?? 0, classes: classes ?? 0, sections: sections ?? 0, subjects: subjects ?? 0 }
}

async function fetchOperationalSummary(schoolId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`

  const [
    { count: students },
    { count: teachers },
    { data: todaysAttendance },
    { data: monthPayments },
    { count: upcomingExams },
  ] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'active'),
    supabase.from('attendance').select('status').eq('school_id', schoolId).eq('attendance_date', today),
    supabase.from('fee_payments').select('amount').eq('school_id', schoolId).gte('created_at', monthStart),
    supabase.from('exams').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).gte('exam_date', today),
  ])

  const presentToday = (todaysAttendance ?? []).filter((r) => r.status === 'present' || r.status === 'late').length
  const attendancePercent = todaysAttendance && todaysAttendance.length > 0
    ? Math.round((presentToday / todaysAttendance.length) * 100)
    : null
  const feeCollectedThisMonth = (monthPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)

  return {
    students: students ?? 0,
    teachers: teachers ?? 0,
    attendancePercent,
    feeCollectedThisMonth,
    upcomingExams: upcomingExams ?? 0,
  }
}

export function SchoolAdminDashboardPage() {
  const { primaryRole } = useAuth()
  const schoolId = primaryRole?.schoolId ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['academic-summary', schoolId],
    queryFn: () => fetchAcademicSummary(schoolId as string),
    enabled: !!schoolId,
  })
  const { data: ops, isLoading: opsLoading } = useQuery({
    queryKey: ['operational-summary', schoolId],
    queryFn: () => fetchOperationalSummary(schoolId as string),
    enabled: !!schoolId,
  })

  const setupIncomplete = !isLoading && data?.years === 0

  return (
    <div className="flex flex-col gap-4">
      {setupIncomplete ? (
        <Card>
          <CardHeader>
            <CardTitle>Finish setting up your school</CardTitle>
            <CardDescription>Create your first academic year, classes, sections, and subjects.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/setup">Open Setup Wizard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Students" value={opsLoading ? '—' : (ops?.students ?? 0)} />
        <StatCard label="Teachers" value={opsLoading ? '—' : (ops?.teachers ?? 0)} />
        <StatCard
          label="Attendance today"
          value={opsLoading ? '—' : ops?.attendancePercent === null ? 'Not marked' : `${ops?.attendancePercent}%`}
        />
        <StatCard
          label="Fees collected (month)"
          value={opsLoading ? '—' : `₹${ops?.feeCollectedThisMonth.toLocaleString() ?? 0}`}
        />
        <StatCard label="Upcoming exams" value={opsLoading ? '—' : (ops?.upcomingExams ?? 0)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Academic years" value={isLoading ? '—' : (data?.years ?? 0)} />
        <StatCard label="Classes" value={isLoading ? '—' : (data?.classes ?? 0)} />
        <StatCard label="Sections" value={isLoading ? '—' : (data?.sections ?? 0)} />
        <StatCard label="Subjects" value={isLoading ? '—' : (data?.subjects ?? 0)} />
      </div>
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
